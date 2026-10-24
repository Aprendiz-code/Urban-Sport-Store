BEGIN;

CREATE OR REPLACE FUNCTION public.process_verified_wompi_event_by_provider_session(
  p_event_fingerprint text,
  p_provider_event_id text,
  p_provider_session_id text,
  p_transaction_id text,
  p_event_type text,
  p_provider_status text,
  p_amount numeric,
  p_currency text,
  p_received_at timestamptz,
  p_provider_transaction_reference text,
  p_expected_user_id uuid DEFAULT NULL,
  p_expected_order_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_lookup jsonb;
  v_attempt_id uuid;
  v_order_id uuid;
  v_order public.orders%ROWTYPE;
  v_result text;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the authorized backend may reconcile payment sessions'
      USING ERRCODE = '42501';
  END IF;

  IF p_provider_session_id IS NULL
     OR p_provider_session_id !~ '^[A-Za-z0-9_-]{1,128}$'
     OR p_event_fingerprint IS NULL
     OR p_event_fingerprint !~ '^[0-9a-f]{64}$'
     OR p_event_type IS DISTINCT FROM 'transaction.updated'
     OR p_provider_status IS NULL
     OR p_provider_status NOT IN (
       'pending', 'approved', 'rejected', 'error', 'voided'
     )
     OR p_amount IS NULL
     OR p_amount < 0
     OR p_currency IS NULL
     OR p_currency !~ '^[A-Z]{3}$'
     OR p_received_at IS NULL THEN
    RETURN jsonb_build_object(
      'status', 'invalid',
      'correlation', 'provider_session'
    );
  END IF;

  v_lookup := public.lookup_payment_link_session(
    p_provider_session_id,
    p_expected_user_id,
    p_expected_order_id
  );

  IF v_lookup ->> 'status' <> 'matched' THEN
    RETURN jsonb_build_object(
      'status', v_lookup ->> 'status',
      'correlation', 'provider_session'
    );
  END IF;

  v_attempt_id := (v_lookup ->> 'attempt_id')::uuid;
  v_order_id := (v_lookup ->> 'order_id')::uuid;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_order_id::text, 120120)
  );

  SELECT order_row.*
  INTO v_order
  FROM public.orders AS order_row
  WHERE order_row.id = v_order_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'status', 'unmatched',
      'correlation', 'provider_session'
    );
  END IF;

  PERFORM attempt.id
  FROM public.payment_attempts AS attempt
  WHERE attempt.order_id = v_order_id
  ORDER BY attempt.attempt_number, attempt.id
  FOR UPDATE;

  PERFORM payment.id
  FROM public.payments AS payment
  WHERE payment.order_id = v_order_id
  ORDER BY payment.id
  FOR UPDATE;

  IF v_order.shipping_quote_id IS NOT NULL THEN
    PERFORM quote.id
    FROM public.shipping_quotes AS quote
    WHERE quote.id = v_order.shipping_quote_id
    ORDER BY quote.id
    FOR UPDATE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.payment_attempts AS attempt
    JOIN public.orders AS order_row
      ON order_row.id = attempt.order_id
    WHERE attempt.id = v_attempt_id
      AND attempt.order_id = v_order_id
      AND attempt.provider_session_id = p_provider_session_id
      AND attempt.provider_session_type = 'payment_link'
      AND (
        p_expected_user_id IS NULL
        OR order_row.user_id = p_expected_user_id
      )
      AND (
        p_expected_order_id IS NULL
        OR order_row.id = p_expected_order_id
      )
  ) THEN
    RETURN jsonb_build_object(
      'status', 'unmatched',
      'correlation', 'provider_session'
    );
  END IF;

  v_result := public.process_verified_wompi_event_after_requote(
    p_event_fingerprint,
    p_provider_event_id,
    v_lookup ->> 'reference',
    p_transaction_id,
    p_event_type,
    p_provider_status,
    p_amount,
    p_currency,
    p_received_at,
    p_provider_transaction_reference
  );

  RETURN jsonb_build_object(
    'status', v_result,
    'correlation', 'provider_session',
    'attempt_id', v_attempt_id,
    'order_id', v_order_id,
    'reference', v_lookup ->> 'reference',
    'provider_status', p_provider_status
  );
END;
$function$;

REVOKE ALL ON FUNCTION
  public.process_verified_wompi_event_by_provider_session(
    text, text, text, text, text, text, numeric, text, timestamptz,
    text, uuid, uuid
  )
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.process_verified_wompi_event_by_provider_session(
    text, text, text, text, text, text, numeric, text, timestamptz,
    text, uuid, uuid
  )
TO service_role;

COMMENT ON FUNCTION
  public.process_verified_wompi_event_by_provider_session(
    text, text, text, text, text, text, numeric, text, timestamptz,
    text, uuid, uuid
  ) IS
  'Correlates a verified Wompi event through provider_session_id while preserving the existing internal-reference reconciliation flow.';

COMMIT;
