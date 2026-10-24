BEGIN;

SELECT plan(13);

SET LOCAL ROLE postgres;
SET LOCAL request.jwt.claims =
  '{"role":"service_role","sub":"00000000-0000-0000-0000-000000000001"}';

CREATE TEMP TABLE wompi_session_test_ids (
  key text PRIMARY KEY,
  order_id uuid NOT NULL,
  payment_id uuid NOT NULL,
  attempt_id uuid NOT NULL,
  user_id uuid NOT NULL,
  reference text NOT NULL,
  provider_session_id text NOT NULL
);

INSERT INTO wompi_session_test_ids
SELECT
  key,
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  pg_catalog.gen_random_uuid(),
  'reference-' || key,
  'provider-session-' || key
FROM (VALUES
  ('valid'),
  ('foreign'),
  ('voided'),
  ('late_voided'),
  ('reference')
) AS fixture(key);

INSERT INTO auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
SELECT
  user_id, 'authenticated', 'authenticated', key || '@example.invalid',
  '', clock_timestamp(), '{}'::jsonb, '{}'::jsonb,
  clock_timestamp(), clock_timestamp()
FROM wompi_session_test_ids;

INSERT INTO public.profiles (id, role, is_active)
SELECT user_id, 'CUSTOMER', true
FROM wompi_session_test_ids;

INSERT INTO public.orders (
  id, order_number, user_id, email, customer_name, phone,
  status, payment_status, expires_at, currency, total,
  shipping_address, idempotency_key, request_hash
)
SELECT
  order_id, 'WOMPI-TEST-' || key, user_id,
  'synthetic@example.invalid', 'Test Customer', '3000000000',
  'pending_payment', 'pending',
  pg_catalog.clock_timestamp() + interval '24 hours',
  'COP', 1000, '{}'::jsonb,
  pg_catalog.gen_random_uuid(), repeat('a', 64)
FROM wompi_session_test_ids;

INSERT INTO public.payments (
  id, order_id, payment_provider, status, amount, currency
)
SELECT payment_id, order_id, 'local', 'pending', 1000, 'COP'
FROM wompi_session_test_ids;

INSERT INTO public.payment_attempts (
  id, order_id, payment_id, reference, attempt_number, status,
  expected_amount, currency, session_state, checkout_url,
  session_created_at, checkout_expires_at, provider_session_id,
  provider_session_type, provider_session_expires_at
)
SELECT
  attempt_id, order_id, payment_id, reference, 1, 'pending',
  1000, 'COP', 'ready',
  'https://checkout.wompi.co/l/' || provider_session_id,
  clock_timestamp(), pg_catalog.transaction_timestamp() + interval '10 minutes',
  provider_session_id, 'payment_link',
  pg_catalog.transaction_timestamp() + interval '10 minutes'
FROM wompi_session_test_ids;

-- 1. Búsqueda exitosa por provider_session_id.
SELECT is(
  (
    public.lookup_payment_link_session(
      (SELECT provider_session_id FROM wompi_session_test_ids WHERE key = 'valid')
    ) ->> 'status'
  ),
  'matched',
  'provider_session_id resolves the matching session'
);

-- 2. Sesión inexistente.
SELECT is(
  (
    public.lookup_payment_link_session('provider-session-not-found')
    ->> 'status'
  ),
  'unmatched',
  'unknown provider session is unmatched'
);

-- 3-4. Sesión asociada a otro pedido o usuario.
SELECT is(
  (
    public.lookup_payment_link_session(
      (SELECT provider_session_id FROM wompi_session_test_ids WHERE key = 'foreign'),
      pg_catalog.gen_random_uuid(),
      NULL
    ) ->> 'status'
  ),
  'unmatched',
  'provider session cannot be asserted against another user'
);

SELECT is(
  (
    public.lookup_payment_link_session(
      (SELECT provider_session_id FROM wompi_session_test_ids WHERE key = 'foreign'),
      NULL,
      pg_catalog.gen_random_uuid()
    ) ->> 'status'
  ),
  'unmatched',
  'provider session cannot be asserted against another order'
);

-- 5. VOIDED válido.
SELECT is(
  (
    public.process_verified_wompi_event_by_provider_session(
      repeat('b', 64)::text,
      'voided-event'::text,
      (SELECT provider_session_id FROM wompi_session_test_ids WHERE key = 'voided')::text,
      'voided-transaction'::text,
      'transaction.updated'::text,
      'voided'::text,
      1000::numeric,
      'COP'::text,
      clock_timestamp()::timestamptz,
      NULL::text,
      NULL::uuid,
      NULL::uuid
    ) ->> 'status'
  ),
  'applied',
  'valid VOIDED event is applied'
);

-- 6. Cancelación del pedido y estados finales.
SELECT ok(
  EXISTS (
    SELECT 1
    FROM public.orders
    WHERE id = (SELECT order_id FROM wompi_session_test_ids WHERE key = 'voided')
      AND status = 'cancelled'
      AND payment_status = 'cancelled'
  )
  AND EXISTS (
    SELECT 1
    FROM public.payments
    WHERE order_id = (SELECT order_id FROM wompi_session_test_ids WHERE key = 'voided')
      AND status = 'voided'
  )
  AND EXISTS (
    SELECT 1
    FROM public.payment_attempts
    WHERE id = (SELECT attempt_id FROM wompi_session_test_ids WHERE key = 'voided')
      AND status = 'voided'
      AND session_state = 'voided'
      AND session_claim_token IS NULL
      AND session_error_code = 'provider_voided'
  ),
  'valid VOIDED event sets terminal voided states'
);

-- 7. VOIDED duplicado.
SELECT is(
  (
    public.process_verified_wompi_event_by_provider_session(
      repeat('b', 64)::text,
      'voided-event'::text,
      (SELECT provider_session_id FROM wompi_session_test_ids WHERE key = 'voided')::text,
      'voided-transaction'::text,
      'transaction.updated'::text,
      'voided'::text,
      1000::numeric,
      'COP'::text,
      clock_timestamp()::timestamptz,
      NULL::text,
      NULL::uuid,
      NULL::uuid
    ) ->> 'status'
  ),
  'duplicate',
  'duplicate VOIDED event is idempotently rejected'
);

-- 8. VOIDED tardío sobre estado terminal.
UPDATE public.orders
SET status = 'paid', payment_status = 'paid'
WHERE id = (
  SELECT order_id FROM wompi_session_test_ids WHERE key = 'late_voided'
);

SELECT is(
  (
    public.process_verified_wompi_event_by_provider_session(
      repeat('c', 64)::text,
      'late-voided-event'::text,
      (SELECT provider_session_id FROM wompi_session_test_ids WHERE key = 'late_voided')::text,
      'late-voided-transaction'::text,
      'transaction.updated'::text,
      'voided'::text,
      1000::numeric,
      'COP'::text,
      clock_timestamp()::timestamptz,
      NULL::text,
      NULL::uuid,
      NULL::uuid
    ) ->> 'status'
  ),
  'stale',
  'late VOIDED event is stale'
);

-- 9. Flujo por reference preservado.
SELECT is(
  public.process_verified_wompi_event(
    repeat('d', 64),
    'reference-event',
    (SELECT reference FROM wompi_session_test_ids WHERE key = 'reference'),
    'reference-transaction',
    'transaction.updated',
    'voided',
    1000,
    'COP',
    clock_timestamp(),
    NULL
  ),
  'applied',
  'existing reference reconciliation remains valid'
);

-- 10-13. Permisos y RLS.
SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.process_verified_wompi_event_by_provider_session(text,text,text,text,text,text,numeric,text,timestamptz,text,uuid,uuid)',
    'EXECUTE'
  ),
  'anon cannot execute provider-session reconciliation'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.process_verified_wompi_event_by_provider_session(text,text,text,text,text,text,numeric,text,timestamptz,text,uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated cannot execute provider-session reconciliation'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.process_verified_wompi_event_by_provider_session(text,text,text,text,text,text,numeric,text,timestamptz,text,uuid,uuid)',
    'EXECUTE'
  ),
  'service_role can execute provider-session reconciliation'
);

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_attempts'
      AND policyname = 'requote_attempts_select_own'
  ),
  'owner-scoped payment attempt RLS policy remains present'
);

ROLLBACK;
