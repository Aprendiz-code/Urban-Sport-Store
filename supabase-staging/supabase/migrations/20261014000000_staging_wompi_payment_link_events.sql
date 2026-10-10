BEGIN;

ALTER TABLE public.payment_attempts
  DROP CONSTRAINT payment_attempts_status_check,
  ADD CONSTRAINT payment_attempts_status_check
    CHECK (status IN ('created', 'pending', 'approved', 'rejected', 'error', 'expired', 'voided')),
  DROP CONSTRAINT payment_attempts_session_state_check,
  ADD CONSTRAINT payment_attempts_session_state_check
    CHECK (session_state IN (
      'not_started', 'creating', 'ready', 'retryable', 'outcome_unknown', 'failed', 'voided'
    )),
  DROP CONSTRAINT payment_attempts_session_error_check,
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
        session_state = 'voided'
        AND session_error_code = 'provider_voided'
      )
      OR (
        session_state IN ('not_started', 'creating', 'ready')
        AND session_error_code IS NULL
      )
    );

ALTER TABLE public.payment_events
  DROP CONSTRAINT payment_events_provider_status_check,
  ADD CONSTRAINT payment_events_provider_status_check
    CHECK (provider_status IN ('pending', 'approved', 'rejected', 'error', 'voided'));

CREATE OR REPLACE FUNCTION public.lookup_payment_link_session(
  p_provider_session_id text,
  p_expected_user_id uuid DEFAULT NULL,
  p_expected_order_id uuid DEFAULT NULL
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
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the authorized backend may look up payment-link sessions'
      USING ERRCODE = '42501';
  END IF;

  IF p_provider_session_id IS NULL
    OR p_provider_session_id !~ '^[A-Za-z0-9_-]{1,128}$' THEN
    RETURN pg_catalog.jsonb_build_object('status', 'unmatched');
  END IF;

  SELECT attempt.*
  INTO v_attempt
  FROM public.payment_attempts AS attempt
  WHERE attempt.provider_session_id = p_provider_session_id
    AND attempt.provider_session_type = 'payment_link'
    AND attempt.session_state IN ('ready', 'outcome_unknown', 'voided')
    AND attempt.status IN ('created', 'pending', 'approved', 'rejected', 'error', 'expired', 'voided');

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'unmatched');
  END IF;

  SELECT order_row.*
  INTO v_order
  FROM public.orders AS order_row
  WHERE order_row.id = v_attempt.order_id
    AND order_row.status IN ('pending_payment', 'cancelled', 'paid', 'payment_review')
    AND (p_expected_user_id IS NULL OR order_row.user_id = p_expected_user_id)
    AND (p_expected_order_id IS NULL OR order_row.id = p_expected_order_id);

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'unmatched');
  END IF;

  SELECT payment.*
  INTO v_payment
  FROM public.payments AS payment
  WHERE payment.id = v_attempt.payment_id
    AND payment.order_id = v_attempt.order_id
    AND payment.status IN ('pending', 'approved', 'rejected', 'error')
    AND v_attempt.expected_amount = payment.amount
    AND v_attempt.currency = payment.currency
    AND payment.amount = v_order.total
    AND payment.currency = v_order.currency;

  IF NOT FOUND THEN
    RETURN pg_catalog.jsonb_build_object('status', 'unmatched');
  END IF;

  RETURN pg_catalog.jsonb_build_object(
    'status', 'matched',
    'attempt_id', v_attempt.id,
    'order_id', v_order.id,
    'user_id', v_order.user_id,
    'payment_id', v_payment.id,
    'reference', v_attempt.reference,
    'expected_amount', v_attempt.expected_amount,
    'currency', v_attempt.currency,
    'transaction_id', v_attempt.transaction_id,
    'attempt_status', v_attempt.status,
    'session_state', v_attempt.session_state,
    'order_status', v_order.status,
    'payment_status', v_payment.status,
    'provider_session_type', v_attempt.provider_session_type,
    'provider_session_expires_at', v_attempt.provider_session_expires_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.lookup_payment_link_session(text, uuid, uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lookup_payment_link_session(text, uuid, uuid)
  TO service_role;

CREATE OR REPLACE FUNCTION public.process_verified_wompi_event(
  p_event_fingerprint text,
  p_provider_event_id text,
  p_reference text,
  p_transaction_id text,
  p_event_type text,
  p_provider_status text,
  p_amount numeric,
  p_currency text,
  p_received_at timestamptz
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_event_id uuid;
  v_attempt public.payment_attempts%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_payment public.payments%ROWTYPE;
  v_result text;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the authorized backend may process verified payment events'
      USING ERRCODE = '42501';
  END IF;

  IF p_event_fingerprint IS NULL
    OR p_event_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_reference IS NULL
    OR p_reference !~ '^[A-Za-z0-9_-]{1,120}$'
    OR p_event_type IS DISTINCT FROM 'transaction.updated'
    OR p_provider_status IS NULL
    OR p_provider_status NOT IN ('pending', 'approved', 'rejected', 'error', 'voided')
    OR p_amount IS NULL
    OR p_amount < 0
    OR p_currency IS NULL
    OR p_currency !~ '^[A-Z]{3}$'
    OR p_received_at IS NULL
    OR (p_provider_event_id IS NOT NULL
      AND pg_catalog.length(p_provider_event_id) NOT BETWEEN 1 AND 128)
    OR (p_transaction_id IS NOT NULL
      AND pg_catalog.length(p_transaction_id) NOT BETWEEN 1 AND 128) THEN
    RAISE EXCEPTION 'Invalid normalized payment event'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.payment_events (
    event_fingerprint, provider_event_id, provider_reference,
    event_type, provider_status, received_at
  )
  VALUES (
    p_event_fingerprint, p_provider_event_id, p_reference,
    p_event_type, p_provider_status, p_received_at
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_event_id;

  IF v_event_id IS NULL THEN
    RETURN 'duplicate';
  END IF;

  SELECT attempt.*
  INTO v_attempt
  FROM public.payment_attempts AS attempt
  WHERE attempt.reference = p_reference
  FOR UPDATE;

  IF NOT FOUND THEN
    UPDATE public.payment_events
    SET processing_result = 'unmatched',
        processed_at = pg_catalog.clock_timestamp()
    WHERE id = v_event_id;
    RETURN 'unmatched';
  END IF;

  IF p_transaction_id IS NOT NULL THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(p_transaction_id, 0)
    );
  END IF;

  UPDATE public.payment_events
  SET attempt_id = v_attempt.id,
      order_id = v_attempt.order_id
  WHERE id = v_event_id;

  SELECT order_row.*
  INTO v_order
  FROM public.orders AS order_row
  WHERE order_row.id = v_attempt.order_id
  FOR UPDATE;

  SELECT payment.*
  INTO v_payment
  FROM public.payments AS payment
  WHERE payment.id = v_attempt.payment_id
    AND payment.order_id = v_attempt.order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Payment attempt is not attached to its order payment'
      USING ERRCODE = '23503';
  END IF;

  PERFORM reservation.id
  FROM public.inventory_reservations AS reservation
  WHERE reservation.order_id = v_order.id
  ORDER BY reservation.product_id
  FOR UPDATE;

  IF p_amount <> v_attempt.expected_amount
    OR p_currency <> v_attempt.currency
    OR p_amount <> v_payment.amount
    OR p_currency <> v_payment.currency
    OR (p_transaction_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.payment_attempts AS other_attempt
      WHERE other_attempt.transaction_id = p_transaction_id
        AND other_attempt.id <> v_attempt.id
    ))
    OR (p_transaction_id IS NOT NULL
      AND v_attempt.transaction_id IS NOT NULL
      AND p_transaction_id <> v_attempt.transaction_id) THEN
    v_result := 'stale';
  ELSIF v_attempt.status IN ('approved', 'rejected', 'error', 'expired', 'voided') THEN
    v_result := 'stale';
  ELSIF p_provider_status = 'approved'
    AND v_order.status = 'cancelled' THEN
    UPDATE public.payment_attempts
    SET status = 'approved',
        transaction_id = COALESCE(transaction_id, p_transaction_id),
        updated_at = pg_catalog.clock_timestamp()
    WHERE id = v_attempt.id;

    UPDATE public.payments
    SET payment_provider = 'wompi',
        status = 'approved'
    WHERE id = v_payment.id;

    UPDATE public.orders
    SET status = 'payment_review'
    WHERE id = v_order.id;

    v_result := 'review_required';
  ELSIF p_provider_status = 'voided'
    AND v_order.status IN ('pending_payment', 'cancelled')
    AND v_payment.status = 'pending' THEN
    UPDATE public.payment_attempts
    SET status = 'voided',
        transaction_id = COALESCE(transaction_id, p_transaction_id),
        session_state = 'voided',
        session_claim_token = NULL,
        session_claim_expires_at = NULL,
        checkout_url = NULL,
        checkout_expires_at = NULL,
        session_error_code = 'provider_voided',
        updated_at = pg_catalog.clock_timestamp()
    WHERE id = v_attempt.id;

    v_result := 'applied';
  ELSIF v_order.status <> 'pending_payment' THEN
    v_result := 'stale';
  ELSIF p_provider_status = 'approved' THEN
    UPDATE public.payment_attempts
    SET status = 'approved',
        transaction_id = COALESCE(transaction_id, p_transaction_id),
        updated_at = pg_catalog.clock_timestamp()
    WHERE id = v_attempt.id;

    UPDATE public.payments
    SET payment_provider = 'wompi',
        status = 'approved'
    WHERE id = v_payment.id;

    IF EXISTS (
      SELECT 1
      FROM public.order_items AS item
      LEFT JOIN public.inventory_reservations AS reservation
        ON reservation.order_id = item.order_id
       AND reservation.product_id = item.product_id
      WHERE item.order_id = v_order.id
        AND (
          reservation.id IS NULL
          OR reservation.status <> 'active'
          OR reservation.expires_at <= pg_catalog.clock_timestamp()
          OR reservation.quantity <> item.quantity
        )
    ) OR EXISTS (
      SELECT 1
      FROM public.inventory_reservations AS reservation
      LEFT JOIN public.order_items AS item
        ON item.order_id = reservation.order_id
       AND item.product_id = reservation.product_id
      WHERE reservation.order_id = v_order.id
        AND item.id IS NULL
    ) THEN
      UPDATE public.orders
      SET status = 'payment_review'
      WHERE id = v_order.id;
      v_result := 'review_required';
    ELSE
      UPDATE public.orders
      SET status = 'paid'
      WHERE id = v_order.id;
      v_result := 'applied';
    END IF;
  ELSE
    UPDATE public.payment_attempts
    SET status = p_provider_status,
        transaction_id = COALESCE(transaction_id, p_transaction_id),
        updated_at = pg_catalog.clock_timestamp()
    WHERE id = v_attempt.id;

    UPDATE public.payments
    SET payment_provider = 'wompi',
        status = p_provider_status
    WHERE id = v_payment.id;

    v_result := 'applied';
  END IF;

  UPDATE public.payment_events
  SET processing_result = v_result,
      processed_at = pg_catalog.clock_timestamp()
  WHERE id = v_event_id;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.process_verified_wompi_event(
  text, text, text, text, text, text, numeric, text, timestamptz
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_verified_wompi_event(
  text, text, text, text, text, text, numeric, text, timestamptz
) TO service_role;

COMMIT;
