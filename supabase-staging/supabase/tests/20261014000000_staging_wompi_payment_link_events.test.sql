BEGIN;

DO $assertions$
DECLARE
  v_user_id uuid := pg_catalog.gen_random_uuid();
  v_other_user_id uuid := pg_catalog.gen_random_uuid();
  v_category_id uuid := pg_catalog.gen_random_uuid();
  v_product_id uuid := pg_catalog.gen_random_uuid();
  v_link_order_id uuid := pg_catalog.gen_random_uuid();
  v_other_order_id uuid := pg_catalog.gen_random_uuid();
  v_reference_order_id uuid := pg_catalog.gen_random_uuid();
  v_link_payment_id uuid := pg_catalog.gen_random_uuid();
  v_other_payment_id uuid := pg_catalog.gen_random_uuid();
  v_reference_payment_id uuid := pg_catalog.gen_random_uuid();
  v_link_attempt_id uuid := pg_catalog.gen_random_uuid();
  v_other_attempt_id uuid := pg_catalog.gen_random_uuid();
  v_reference_attempt_id uuid := pg_catalog.gen_random_uuid();
  v_link_expires_at timestamptz := pg_catalog.clock_timestamp() + interval '15 minutes';
  v_other_expires_at timestamptz := pg_catalog.clock_timestamp() + interval '15 minutes';
  v_result jsonb;
  v_event_result text;
  v_attempt_status text;
  v_session_state text;
  v_payment_status text;
  v_order_status text;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.payment_attempts'::regclass
      AND conname = 'payment_attempts_status_check'
      AND pg_catalog.strpos(pg_catalog.pg_get_constraintdef(oid), 'voided') > 0
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.payment_attempts'::regclass
      AND conname = 'payment_attempts_session_state_check'
      AND pg_catalog.strpos(pg_catalog.pg_get_constraintdef(oid), 'voided') > 0
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint
    WHERE conrelid = 'public.payment_events'::regclass
      AND conname = 'payment_events_provider_status_check'
      AND pg_catalog.strpos(pg_catalog.pg_get_constraintdef(oid), 'voided') > 0
  ) THEN
    RAISE EXCEPTION 'VOIDED must be allowed by attempt, session, and event constraints';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    WHERE relation.oid = 'public.payment_attempts'::regclass
      AND relation.relrowsecurity
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    WHERE relation.oid = 'public.payment_events'::regclass
      AND relation.relrowsecurity
  ) OR EXISTS (
    SELECT 1
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('payment_attempts', 'payment_events')
      AND roles && ARRAY['anon', 'authenticated', 'public']::name[]
  ) THEN
    RAISE EXCEPTION 'Payment tables must retain RLS without client policies';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.lookup_payment_link_session(text,uuid,uuid)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.lookup_payment_link_session(text,uuid,uuid)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.lookup_payment_link_session(text,uuid,uuid)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.lookup_payment_link_session_by_reference(text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.lookup_payment_link_session_by_reference(text)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.lookup_payment_link_session_by_reference(text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.process_verified_wompi_event(text,text,text,text,text,text,numeric,text,timestamp with time zone)',
    'EXECUTE'
  ) OR has_function_privilege(
    'authenticated',
    'public.process_verified_wompi_event(text,text,text,text,text,text,numeric,text,timestamp with time zone)',
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'service_role',
    'public.process_verified_wompi_event(text,text,text,text,text,text,numeric,text,timestamp with time zone)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'Payment lookup and event processing RPCs must be service_role-only';
  END IF;

  IF has_table_privilege('anon', 'public.payment_attempts', 'SELECT')
    OR has_table_privilege('authenticated', 'public.payment_attempts', 'SELECT')
    OR has_table_privilege('anon', 'public.payment_events', 'SELECT')
    OR has_table_privilege('authenticated', 'public.payment_events', 'SELECT')
    OR has_table_privilege('service_role', 'public.payment_attempts', 'INSERT')
    OR has_table_privilege('service_role', 'public.payment_attempts', 'UPDATE')
    OR has_table_privilege('service_role', 'public.payment_attempts', 'DELETE') THEN
    RAISE EXCEPTION 'Payment history must remain hidden from clients and backend mutations RPC-only';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS function_row
    JOIN pg_catalog.pg_namespace AS schema_row
      ON schema_row.oid = function_row.pronamespace
    WHERE schema_row.nspname = 'public'
      AND function_row.proname = 'lookup_payment_link_session'
      AND function_row.prosecdef
      AND 'search_path=""' = ANY(function_row.proconfig)
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS function_row
    JOIN pg_catalog.pg_namespace AS schema_row
      ON schema_row.oid = function_row.pronamespace
    WHERE schema_row.nspname = 'public'
      AND function_row.proname = 'lookup_payment_link_session_by_reference'
      AND function_row.prosecdef
      AND 'search_path=""' = ANY(function_row.proconfig)
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS function_row
    JOIN pg_catalog.pg_namespace AS schema_row
      ON schema_row.oid = function_row.pronamespace
    WHERE schema_row.nspname = 'public'
      AND function_row.proname = 'process_verified_wompi_event'
      AND function_row.prosecdef
      AND 'search_path=""' = ANY(function_row.proconfig)
  ) THEN
    RAISE EXCEPTION 'Payment RPCs must use hardened SECURITY DEFINER configuration';
  END IF;

  INSERT INTO auth.users (
    id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  VALUES
    (
      v_user_id, 'authenticated', 'authenticated',
      'payment-link-events-' || v_user_id::text || '@example.invalid', '',
      pg_catalog.clock_timestamp(), '{}'::jsonb, '{}'::jsonb,
      pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
    ),
    (
      v_other_user_id, 'authenticated', 'authenticated',
      'payment-link-events-' || v_other_user_id::text || '@example.invalid', '',
      pg_catalog.clock_timestamp(), '{}'::jsonb, '{}'::jsonb,
      pg_catalog.clock_timestamp(), pg_catalog.clock_timestamp()
    );

  INSERT INTO public.categories (id, name, slug, is_active)
  VALUES (
    v_category_id,
    'Payment link event test category',
    'payment-link-event-test-' || v_category_id::text,
    true
  );

  INSERT INTO public.products (
    id, category_id, slug, name, brand, price, sku, stock, is_active
  )
  VALUES (
    v_product_id,
    v_category_id,
    'payment-link-event-test-' || v_product_id::text,
    'Payment link event test product',
    'Test brand',
    1000,
    'PAYMENT-LINK-EVENT-' || v_product_id::text,
    10,
    true
  );

  INSERT INTO public.orders (
    id, order_number, user_id, email, customer_name, phone, status, expires_at,
    currency, subtotal, discount_amount, shipping_amount, total, payment_provider,
    shipping_address, idempotency_key, request_hash
  )
  VALUES
    (
      v_link_order_id, 'LINK-EVENT-' || v_link_order_id::text,
      v_user_id, 'payment-link-event-owner@example.invalid', 'Test Customer',
      '3000000000', 'pending_payment', pg_catalog.clock_timestamp() + interval '24 hours',
      'COP', 1000, 0, 0, 1000, 'local',
      '{"recipientName":"Test Customer","addressLine1":"Test Street 1","city":"Bogota","state":"Cundinamarca","postalCode":"110111","country":"CO","phone":"3000000000"}'::jsonb,
      pg_catalog.gen_random_uuid(), pg_catalog.repeat('a', 64)
    ),
    (
      v_other_order_id, 'LINK-EVENT-OTHER-' || v_other_order_id::text,
      v_other_user_id, 'payment-link-event-other@example.invalid', 'Test Customer',
      '3000000000', 'pending_payment', pg_catalog.clock_timestamp() + interval '24 hours',
      'COP', 1000, 0, 0, 1000, 'local',
      '{"recipientName":"Test Customer","addressLine1":"Test Street 1","city":"Bogota","state":"Cundinamarca","postalCode":"110111","country":"CO","phone":"3000000000"}'::jsonb,
      pg_catalog.gen_random_uuid(), pg_catalog.repeat('b', 64)
    ),
    (
      v_reference_order_id, 'REFERENCE-EVENT-' || v_reference_order_id::text,
      v_user_id, 'payment-link-event-owner@example.invalid', 'Test Customer',
      '3000000000', 'pending_payment', pg_catalog.clock_timestamp() + interval '24 hours',
      'COP', 1000, 0, 0, 1000, 'local',
      '{"recipientName":"Test Customer","addressLine1":"Test Street 1","city":"Bogota","state":"Cundinamarca","postalCode":"110111","country":"CO","phone":"3000000000"}'::jsonb,
      pg_catalog.gen_random_uuid(), pg_catalog.repeat('c', 64)
    );

  INSERT INTO public.order_items (
    order_id, product_id, product_name, sku, quantity, unit_price, total_price
  )
  VALUES
    (v_link_order_id, v_product_id, 'Test product', 'LINK-EVENT-ITEM', 1, 1000, 1000),
    (v_other_order_id, v_product_id, 'Test product', 'LINK-EVENT-ITEM', 1, 1000, 1000),
    (v_reference_order_id, v_product_id, 'Test product', 'REFERENCE-EVENT-ITEM', 1, 1000, 1000);

  INSERT INTO public.inventory_reservations (
    order_id, product_id, quantity, status, expires_at
  )
  VALUES
    (v_link_order_id, v_product_id, 1, 'active', pg_catalog.clock_timestamp() + interval '20 minutes'),
    (v_other_order_id, v_product_id, 1, 'active', pg_catalog.clock_timestamp() + interval '20 minutes'),
    (v_reference_order_id, v_product_id, 1, 'active', pg_catalog.clock_timestamp() + interval '20 minutes');

  INSERT INTO public.payments (
    id, order_id, payment_provider, status, amount, currency
  )
  VALUES
    (v_link_payment_id, v_link_order_id, 'local', 'pending', 1000, 'COP'),
    (v_other_payment_id, v_other_order_id, 'local', 'pending', 1000, 'COP'),
    (v_reference_payment_id, v_reference_order_id, 'local', 'pending', 1000, 'COP');

  INSERT INTO public.payment_attempts (
    id, order_id, payment_id, reference, attempt_number, status,
    expected_amount, currency, session_state, checkout_url,
    checkout_expires_at, session_created_at, provider_session_id,
    provider_session_type, provider_session_expires_at
  )
  VALUES
    (
      v_link_attempt_id, v_link_order_id, v_link_payment_id,
      'link-event-' || v_link_order_id::text, 1, 'pending', 1000, 'COP',
      'ready', 'https://checkout.wompi.co/l/' || v_link_order_id::text,
      v_link_expires_at,
      pg_catalog.clock_timestamp(),
      'link-session-' || v_link_order_id::text,
      'payment_link', v_link_expires_at
    ),
    (
      v_other_attempt_id, v_other_order_id, v_other_payment_id,
      'link-event-' || v_other_order_id::text, 1, 'pending', 1000, 'COP',
      'ready', 'https://checkout.wompi.co/l/' || v_other_order_id::text,
      v_other_expires_at,
      pg_catalog.clock_timestamp(),
      'link-session-' || v_other_order_id::text,
      'payment_link', v_other_expires_at
    ),
    (
      v_reference_attempt_id, v_reference_order_id, v_reference_payment_id,
      'reference-event-' || v_reference_order_id::text, 1, 'pending', 1000, 'COP',
      'not_started', NULL, NULL, NULL, NULL, NULL, NULL
    );

  PERFORM pg_catalog.set_config('request.jwt.claims', '{"role":"anon"}', true);
  BEGIN
    v_result := public.lookup_payment_link_session_by_reference(
      'link-event-' || v_link_order_id::text
    );
    RAISE EXCEPTION 'anon must not resolve payment attempts by reference';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM pg_catalog.set_config('request.jwt.claims', '{"role":"authenticated"}', true);
  BEGIN
    v_result := public.lookup_payment_link_session_by_reference(
      'link-event-' || v_link_order_id::text
    );
    RAISE EXCEPTION 'authenticated must not resolve payment attempts by reference';
  EXCEPTION
    WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM pg_catalog.set_config(
    'request.jwt.claims',
    '{"role":"service_role"}',
    true
  );

  v_result := public.lookup_payment_link_session(
    'link-session-' || v_link_order_id::text,
    v_user_id,
    v_link_order_id
  );
  IF v_result ->> 'status' <> 'matched'
    OR (v_result ->> 'attempt_id')::uuid <> v_link_attempt_id
    OR v_result ->> 'reference' <> 'link-event-' || v_link_order_id::text THEN
    RAISE EXCEPTION 'A payment-link session must resolve to its linked attempt and reference';
  END IF;

  v_result := public.lookup_payment_link_session_by_reference(
    'link-event-' || v_link_order_id::text
  );
  IF v_result ->> 'status' <> 'matched'
    OR (v_result ->> 'attempt_id')::uuid <> v_link_attempt_id
    OR v_result ->> 'reference' <> 'link-event-' || v_link_order_id::text THEN
    RAISE EXCEPTION 'An internal attempt reference must resolve to its payment-link session';
  END IF;

  v_result := public.lookup_payment_link_session(
    'missing-payment-link-session', NULL, NULL
  );
  IF v_result ->> 'status' <> 'unmatched' THEN
    RAISE EXCEPTION 'A nonexistent payment-link session must be unmatched';
  END IF;

  v_result := public.lookup_payment_link_session(
    'link-session-' || v_link_order_id::text,
    v_other_user_id,
    NULL
  );
  IF v_result ->> 'status' <> 'unmatched' THEN
    RAISE EXCEPTION 'A session belonging to another user must not be disclosed';
  END IF;

  v_result := public.lookup_payment_link_session(
    'link-session-' || v_link_order_id::text,
    NULL,
    v_other_order_id
  );
  IF v_result ->> 'status' <> 'unmatched' THEN
    RAISE EXCEPTION 'A session belonging to another order must not be disclosed';
  END IF;

  v_event_result := public.process_verified_wompi_event(
    pg_catalog.encode(extensions.digest('voided-event-valid', 'sha256'), 'hex'),
    'voided-event-valid',
    'link-event-' || v_link_order_id::text,
    'wompi-voided-tx-' || v_link_order_id::text,
    'transaction.updated',
    'voided',
    1000,
    'COP',
    pg_catalog.clock_timestamp()
  );
  IF v_event_result <> 'applied' THEN
    RAISE EXCEPTION 'A valid VOIDED event must be applied without approving payment';
  END IF;

  SELECT status, session_state
  INTO v_attempt_status, v_session_state
  FROM public.payment_attempts
  WHERE id = v_link_attempt_id;

  SELECT status INTO v_payment_status
  FROM public.payments
  WHERE id = v_link_payment_id;

  SELECT status INTO v_order_status
  FROM public.orders
  WHERE id = v_link_order_id;

  IF v_attempt_status <> 'voided'
    OR v_session_state <> 'voided'
    OR v_payment_status <> 'pending'
    OR v_order_status <> 'pending_payment'
    OR NOT EXISTS (
      SELECT 1
      FROM public.payment_attempts
      WHERE id = v_link_attempt_id
        AND transaction_id = 'wompi-voided-tx-' || v_link_order_id::text
        AND provider_session_id = 'link-session-' || v_link_order_id::text
        AND checkout_url IS NULL
        AND checkout_expires_at IS NULL
        AND session_error_code = 'provider_voided'
    ) THEN
    RAISE EXCEPTION 'VOIDED must retain traceability, disable checkout, and leave payment/order unpaid';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.payment_events
    WHERE provider_event_id = 'voided-event-valid'
      AND provider_status = 'voided'
      AND processing_result = 'applied'
      AND attempt_id = v_link_attempt_id
      AND order_id = v_link_order_id
  ) THEN
    RAISE EXCEPTION 'A valid VOIDED event must retain its processing trace';
  END IF;

  v_result := public.lookup_payment_link_session(
    'link-session-' || v_link_order_id::text,
    v_user_id,
    v_link_order_id
  );
  IF v_result ->> 'status' <> 'matched'
    OR v_result ->> 'session_state' <> 'voided' THEN
    RAISE EXCEPTION 'A voided payment-link session must remain traceable';
  END IF;

  v_event_result := public.process_verified_wompi_event(
    pg_catalog.encode(extensions.digest('voided-event-valid', 'sha256'), 'hex'),
    'voided-event-valid',
    'link-event-' || v_link_order_id::text,
    'wompi-voided-tx-' || v_link_order_id::text,
    'transaction.updated',
    'voided',
    1000,
    'COP',
    pg_catalog.clock_timestamp()
  );
  IF v_event_result <> 'duplicate' THEN
    RAISE EXCEPTION 'A repeated VOIDED event must be idempotently classified as duplicate';
  END IF;

  v_event_result := public.process_verified_wompi_event(
    pg_catalog.encode(extensions.digest('late-approved-after-voided', 'sha256'), 'hex'),
    'late-approved-after-voided',
    'link-event-' || v_link_order_id::text,
    'wompi-voided-tx-' || v_link_order_id::text,
    'transaction.updated',
    'approved',
    1000,
    'COP',
    pg_catalog.clock_timestamp()
  );
  SELECT status INTO v_order_status
  FROM public.orders
  WHERE id = v_link_order_id;
  IF v_event_result <> 'stale' OR v_order_status <> 'pending_payment' THEN
    RAISE EXCEPTION 'A late approval after VOIDED must not mark the order paid';
  END IF;

  v_event_result := public.process_verified_wompi_event(
    pg_catalog.encode(extensions.digest('legacy-reference-approved', 'sha256'), 'hex'),
    'legacy-reference-approved',
    'reference-event-' || v_reference_order_id::text,
    'wompi-reference-tx-' || v_reference_order_id::text,
    'transaction.updated',
    'approved',
    1000,
    'COP',
    pg_catalog.clock_timestamp()
  );
  SELECT status INTO v_order_status
  FROM public.orders
  WHERE id = v_reference_order_id;
  SELECT status INTO v_payment_status
  FROM public.payments
  WHERE id = v_reference_payment_id;
  IF v_event_result <> 'applied'
    OR v_order_status <> 'paid'
    OR v_payment_status <> 'approved' THEN
    RAISE EXCEPTION 'The existing reference-correlated approval flow must remain unchanged';
  END IF;
END;
$assertions$;

ROLLBACK;
