BEGIN;

ALTER TABLE public.payment_attempts
  ADD COLUMN session_state text NOT NULL DEFAULT 'not_started',
  ADD COLUMN session_claim_token uuid,
  ADD COLUMN session_claim_expires_at timestamptz,
  ADD COLUMN checkout_url text,
  ADD COLUMN checkout_expires_at timestamptz,
  ADD COLUMN session_created_at timestamptz,
  ADD COLUMN session_error_code text;

ALTER TABLE public.payment_attempts
  ADD CONSTRAINT payment_attempts_session_state_check
    CHECK (session_state IN (
      'not_started', 'creating', 'ready', 'retryable', 'outcome_unknown', 'failed'
    )),
  ADD CONSTRAINT payment_attempts_session_claim_pair_check
    CHECK ((session_claim_token IS NULL) = (session_claim_expires_at IS NULL)),
  ADD CONSTRAINT payment_attempts_session_claim_state_check
    CHECK ((session_state = 'creating') = (session_claim_token IS NOT NULL)),
  ADD CONSTRAINT payment_attempts_checkout_url_check
    CHECK (
      checkout_url IS NULL
      OR (
        pg_catalog.length(checkout_url) BETWEEN 9 AND 2048
        AND checkout_url ~ '^https://[^[:space:]]+$'
      )
    ),
  ADD CONSTRAINT payment_attempts_session_fields_check
    CHECK (
      (
        session_state = 'ready'
        AND checkout_url IS NOT NULL
        AND checkout_expires_at IS NOT NULL
        AND session_created_at IS NOT NULL
        AND session_error_code IS NULL
      )
      OR (
        session_state <> 'ready'
        AND checkout_url IS NULL
        AND checkout_expires_at IS NULL
      )
    ),
  ADD CONSTRAINT payment_attempts_session_error_check
    CHECK (
      (
        session_state IN ('retryable', 'outcome_unknown', 'failed')
        AND session_error_code IS NOT NULL
        AND session_error_code IN (
          'provider_retryable',
          'provider_outcome_unknown',
          'provider_rejected',
          'claim_expired',
          'reservation_invalid'
        )
      )
      OR (
        session_state IN ('not_started', 'creating', 'ready')
        AND session_error_code IS NULL
      )
    ),
  ADD CONSTRAINT payment_attempts_session_expiry_check
    CHECK (
      checkout_expires_at IS NULL
      OR checkout_expires_at > session_created_at
    );

REVOKE INSERT, UPDATE, DELETE ON TABLE public.payment_attempts FROM service_role;
GRANT SELECT ON TABLE public.payment_attempts TO service_role;

CREATE OR REPLACE FUNCTION public.claim_payment_session(
  p_order_id uuid,
  p_user_id uuid,
  p_claim_token uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_attempt public.payment_attempts%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_attempt_found boolean := false;
  v_attempt_count integer;
  v_item_count integer;
  v_attempt_number integer;
  v_now timestamptz := pg_catalog.clock_timestamp();
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the authorized backend may claim payment sessions'
      USING ERRCODE = '42501';
  END IF;

  IF p_order_id IS NULL OR p_user_id IS NULL OR p_claim_token IS NULL THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'conflict', 'reason', 'invalid_request'
    );
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_order_id::text, 120120)
  );

  SELECT attempt.*
  INTO v_attempt
  FROM public.payment_attempts AS attempt
  WHERE attempt.order_id = p_order_id
    AND attempt.status IN ('created', 'pending')
  ORDER BY attempt.attempt_number DESC, attempt.id
  LIMIT 1
  FOR UPDATE;
  v_attempt_found := FOUND;

  SELECT order_row.*
  INTO v_order
  FROM public.orders AS order_row
  WHERE order_row.id = p_order_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_order.user_id IS DISTINCT FROM p_user_id
    OR v_order.status <> 'pending_payment' THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'conflict', 'reason', 'order_unavailable'
    );
  END IF;

  SELECT pg_catalog.count(*)
  INTO v_attempt_count
  FROM public.payments AS payment
  WHERE payment.order_id = p_order_id;

  IF v_attempt_count <> 1 THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'conflict', 'reason', 'payment_unavailable'
    );
  END IF;

  SELECT payment.*
  INTO v_payment
  FROM public.payments AS payment
  WHERE payment.order_id = p_order_id
  FOR UPDATE;

  IF v_payment.amount <> v_order.total
    OR v_payment.currency <> v_order.currency
    OR v_payment.status = 'approved'
    OR (v_attempt_found AND v_payment.status <> 'pending') THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'conflict', 'reason', 'payment_unavailable'
    );
  END IF;

  IF v_attempt_found AND v_attempt.session_state = 'outcome_unknown' THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'outcome_unknown',
      'attempt_id', v_attempt.id,
      'reference', v_attempt.reference
    );
  END IF;

  PERFORM reservation.id
  FROM public.inventory_reservations AS reservation
  WHERE reservation.order_id = p_order_id
  ORDER BY reservation.product_id, reservation.id
  FOR UPDATE;

  SELECT pg_catalog.count(*)
  INTO v_item_count
  FROM public.order_items AS item
  WHERE item.order_id = p_order_id;

  IF v_item_count = 0
    OR EXISTS (
      SELECT 1
      FROM public.order_items AS item
      LEFT JOIN public.inventory_reservations AS reservation
        ON reservation.order_id = item.order_id
       AND reservation.product_id = item.product_id
      WHERE item.order_id = p_order_id
        AND (
          reservation.id IS NULL
          OR reservation.status <> 'active'
          OR reservation.expires_at <= v_now
          OR reservation.quantity <> item.quantity
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.inventory_reservations AS reservation
      LEFT JOIN public.order_items AS item
        ON item.order_id = reservation.order_id
       AND item.product_id = reservation.product_id
      WHERE reservation.order_id = p_order_id
        AND item.id IS NULL
    ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'conflict', 'reason', 'reservation_unavailable'
    );
  END IF;

  IF NOT v_attempt_found AND v_payment.status IN ('rejected', 'error') THEN
    UPDATE public.payments
    SET status = 'pending'
    WHERE id = v_payment.id;
    v_payment.status := 'pending';
  END IF;

  IF NOT v_attempt_found THEN
    SELECT COALESCE(pg_catalog.max(attempt.attempt_number), 0) + 1
    INTO v_attempt_number
    FROM public.payment_attempts AS attempt
    WHERE attempt.order_id = p_order_id;

    INSERT INTO public.payment_attempts (
      order_id,
      payment_id,
      reference,
      attempt_number,
      status,
      expected_amount,
      currency
    )
    VALUES (
      p_order_id,
      v_payment.id,
      'sess_' || pg_catalog.replace(pg_catalog.gen_random_uuid()::text, '-', ''),
      v_attempt_number,
      'created',
      v_payment.amount,
      v_payment.currency
    )
    RETURNING * INTO v_attempt;
  ELSIF v_attempt.payment_id <> v_payment.id
    OR v_attempt.expected_amount <> v_payment.amount
    OR v_attempt.currency <> v_payment.currency THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'conflict', 'reason', 'attempt_unavailable'
    );
  END IF;

  IF v_attempt.session_state = 'ready' THEN
    IF v_attempt.checkout_expires_at > v_now THEN
      RETURN pg_catalog.jsonb_build_object(
        'status', 'ready',
        'attempt_id', v_attempt.id,
        'reference', v_attempt.reference,
        'checkout_url', v_attempt.checkout_url,
        'checkout_expires_at', v_attempt.checkout_expires_at
      );
    END IF;

    RETURN pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'reason', 'session_expired',
      'attempt_id', v_attempt.id,
      'reference', v_attempt.reference
    );
  END IF;

  IF v_attempt.session_state = 'creating' THEN
    IF v_attempt.session_claim_expires_at > v_now THEN
      RETURN pg_catalog.jsonb_build_object(
        'status', 'in_progress',
        'attempt_id', v_attempt.id,
        'reference', v_attempt.reference,
        'claim_expires_at', v_attempt.session_claim_expires_at
      );
    END IF;

    UPDATE public.payment_attempts
    SET session_state = 'outcome_unknown',
        session_claim_token = NULL,
        session_claim_expires_at = NULL,
        session_error_code = 'claim_expired',
        updated_at = pg_catalog.clock_timestamp()
    WHERE id = v_attempt.id
    RETURNING * INTO v_attempt;

    RETURN pg_catalog.jsonb_build_object(
      'status', 'outcome_unknown',
      'attempt_id', v_attempt.id,
      'reference', v_attempt.reference
    );
  END IF;

  IF v_attempt.session_state = 'failed' THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'reason', 'session_failed',
      'attempt_id', v_attempt.id,
      'reference', v_attempt.reference
    );
  END IF;

  UPDATE public.payment_attempts
  SET session_state = 'creating',
      session_claim_token = p_claim_token,
      session_claim_expires_at = v_now + interval '2 minutes',
      session_error_code = NULL,
      updated_at = pg_catalog.clock_timestamp()
  WHERE id = v_attempt.id
  RETURNING * INTO v_attempt;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'claimed',
    'attempt_id', v_attempt.id,
    'reference', v_attempt.reference,
    'attempt_number', v_attempt.attempt_number,
    'expected_amount', v_attempt.expected_amount,
    'currency', v_attempt.currency,
    'claim_token', v_attempt.session_claim_token,
    'claim_expires_at', v_attempt.session_claim_expires_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.complete_payment_session(
  p_attempt_id uuid,
  p_claim_token uuid,
  p_outcome text,
  p_transaction_id text,
  p_checkout_url text,
  p_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_attempt public.payment_attempts%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_now timestamptz := pg_catalog.clock_timestamp();
  v_reservation_valid boolean;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the authorized backend may complete payment sessions'
      USING ERRCODE = '42501';
  END IF;

  IF p_attempt_id IS NULL
    OR p_claim_token IS NULL
    OR p_outcome IS NULL
    OR p_outcome NOT IN ('ready', 'retryable', 'outcome_unknown', 'failed')
    OR (p_transaction_id IS NOT NULL
      AND pg_catalog.length(p_transaction_id) NOT BETWEEN 1 AND 128)
    OR (p_outcome = 'ready' AND (
      p_checkout_url IS NULL
      OR pg_catalog.length(p_checkout_url) NOT BETWEEN 9 AND 2048
      OR p_checkout_url !~ '^https://[^[:space:]]+$'
      OR p_expires_at IS NULL
      OR p_expires_at <= v_now
    ))
    OR (p_outcome <> 'ready' AND (
      p_checkout_url IS NOT NULL OR p_expires_at IS NOT NULL
    ))
    OR (p_outcome IN ('retryable', 'failed') AND p_transaction_id IS NOT NULL) THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'conflict', 'reason', 'invalid_outcome'
    );
  END IF;

  SELECT attempt.*
  INTO v_attempt
  FROM public.payment_attempts AS attempt
  WHERE attempt.id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND
    OR v_attempt.session_state <> 'creating'
    OR v_attempt.session_claim_token IS DISTINCT FROM p_claim_token
    OR v_attempt.session_claim_expires_at <= v_now THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'conflict', 'reason', 'claim_obsolete'
    );
  END IF;

  SELECT order_row.*
  INTO v_order
  FROM public.orders AS order_row
  WHERE order_row.id = v_attempt.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'conflict', 'reason', 'order_unavailable'
    );
  END IF;

  SELECT payment.*
  INTO v_payment
  FROM public.payments AS payment
  WHERE payment.id = v_attempt.payment_id
    AND payment.order_id = v_attempt.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'conflict', 'reason', 'payment_unavailable'
    );
  END IF;

  PERFORM reservation.id
  FROM public.inventory_reservations AS reservation
  WHERE reservation.order_id = v_order.id
  ORDER BY reservation.product_id, reservation.id
  FOR UPDATE;

  SELECT
    pg_catalog.count(*) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.order_items AS item
      LEFT JOIN public.inventory_reservations AS reservation
        ON reservation.order_id = item.order_id
       AND reservation.product_id = item.product_id
      WHERE item.order_id = v_order.id
        AND (
          reservation.id IS NULL
          OR reservation.status <> 'active'
          OR reservation.expires_at <= v_now
          OR reservation.quantity <> item.quantity
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.inventory_reservations AS reservation
      LEFT JOIN public.order_items AS item
        ON item.order_id = reservation.order_id
       AND item.product_id = reservation.product_id
      WHERE reservation.order_id = v_order.id
        AND item.id IS NULL
    )
  INTO v_reservation_valid
  FROM public.order_items AS item
  WHERE item.order_id = v_order.id;

  v_reservation_valid := COALESCE(v_reservation_valid, false);

  IF p_outcome = 'ready' AND (
    v_order.status <> 'pending_payment'
    OR v_payment.status <> 'pending'
    OR v_payment.amount <> v_order.total
    OR v_payment.currency <> v_order.currency
    OR NOT v_reservation_valid
  ) THEN
    UPDATE public.payment_attempts
    SET session_state = 'outcome_unknown',
        session_claim_token = NULL,
        session_claim_expires_at = NULL,
        session_created_at = v_now,
        session_error_code = 'reservation_invalid',
        transaction_id = COALESCE(transaction_id, p_transaction_id),
        updated_at = pg_catalog.clock_timestamp()
    WHERE id = v_attempt.id;

    RETURN pg_catalog.jsonb_build_object(
      'status', 'outcome_unknown',
      'attempt_id', v_attempt.id,
      'reference', v_attempt.reference
    );
  END IF;

  IF p_outcome = 'ready' THEN
    UPDATE public.payment_attempts
    SET session_state = 'ready',
        session_claim_token = NULL,
        session_claim_expires_at = NULL,
        checkout_url = p_checkout_url,
        checkout_expires_at = p_expires_at,
        session_created_at = v_now,
        session_error_code = NULL,
        transaction_id = COALESCE(transaction_id, p_transaction_id),
        updated_at = pg_catalog.clock_timestamp()
    WHERE id = v_attempt.id;

    RETURN pg_catalog.jsonb_build_object(
      'status', 'ready',
      'attempt_id', v_attempt.id,
      'reference', v_attempt.reference,
      'checkout_url', p_checkout_url,
      'checkout_expires_at', p_expires_at
    );
  END IF;

  IF p_outcome = 'outcome_unknown' THEN
    UPDATE public.payment_attempts
    SET session_state = 'outcome_unknown',
        session_claim_token = NULL,
        session_claim_expires_at = NULL,
        session_created_at = CASE
          WHEN p_transaction_id IS NULL THEN session_created_at
          ELSE v_now
        END,
        session_error_code = 'provider_outcome_unknown',
        transaction_id = COALESCE(transaction_id, p_transaction_id),
        updated_at = pg_catalog.clock_timestamp()
    WHERE id = v_attempt.id;

    RETURN pg_catalog.jsonb_build_object(
      'status', 'outcome_unknown',
      'attempt_id', v_attempt.id,
      'reference', v_attempt.reference
    );
  END IF;

  IF p_outcome = 'retryable' THEN
    UPDATE public.payment_attempts
    SET session_state = 'retryable',
        session_claim_token = NULL,
        session_claim_expires_at = NULL,
        checkout_url = NULL,
        checkout_expires_at = NULL,
        session_error_code = 'provider_retryable',
        updated_at = pg_catalog.clock_timestamp()
    WHERE id = v_attempt.id;

    RETURN pg_catalog.jsonb_build_object(
      'status', 'retryable',
      'attempt_id', v_attempt.id,
      'reference', v_attempt.reference
    );
  END IF;

  UPDATE public.payment_attempts
  SET status = 'error',
      session_state = 'failed',
      session_claim_token = NULL,
      session_claim_expires_at = NULL,
      checkout_url = NULL,
      checkout_expires_at = NULL,
      session_error_code = 'provider_rejected',
      updated_at = pg_catalog.clock_timestamp()
  WHERE id = v_attempt.id;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'failed',
    'attempt_id', v_attempt.id,
    'reference', v_attempt.reference
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_payment_session(uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_payment_session(uuid, uuid, text, text, text, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_payment_session(uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_payment_session(uuid, uuid, text, text, text, timestamptz)
  TO service_role;

COMMIT;
