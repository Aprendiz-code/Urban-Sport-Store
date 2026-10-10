BEGIN;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_wompi_check
  CHECK (status IN ('pending_payment', 'cancelled', 'paid', 'payment_review'))
  NOT VALID;
ALTER TABLE public.orders
  VALIDATE CONSTRAINT orders_status_wompi_check;
ALTER TABLE public.orders
  DROP CONSTRAINT orders_status_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_provider_wompi_check
  CHECK (payment_provider IN ('local', 'wompi'))
  NOT VALID;
ALTER TABLE public.payments
  VALIDATE CONSTRAINT payments_provider_wompi_check;
ALTER TABLE public.payments
  ADD CONSTRAINT payments_status_wompi_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'error'))
  NOT VALID;
ALTER TABLE public.payments
  VALIDATE CONSTRAINT payments_status_wompi_check;
ALTER TABLE public.payments
  DROP CONSTRAINT payments_payment_provider_check;
ALTER TABLE public.payments
  DROP CONSTRAINT payments_status_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_id_order_id_key UNIQUE (id, order_id);

CREATE TABLE public.payment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  payment_id uuid NOT NULL,
  reference text NOT NULL UNIQUE
    CHECK (reference ~ '^[A-Za-z0-9_-]{1,120}$'),
  attempt_number integer NOT NULL CHECK (attempt_number > 0),
  status text NOT NULL DEFAULT 'created'
    CHECK (status IN ('created', 'pending', 'approved', 'rejected', 'error', 'expired')),
  transaction_id text UNIQUE
    CHECK (transaction_id IS NULL OR length(transaction_id) BETWEEN 1 AND 128),
  expected_amount numeric(12, 2) NOT NULL CHECK (expected_amount >= 0),
  currency text NOT NULL CHECK (currency = 'COP'),
  created_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT pg_catalog.clock_timestamp(),
  CONSTRAINT payment_attempts_order_attempt_number_key UNIQUE (order_id, attempt_number),
  CONSTRAINT payment_attempts_id_order_id_key UNIQUE (id, order_id),
  CONSTRAINT payment_attempts_payment_order_fkey
    FOREIGN KEY (payment_id, order_id)
    REFERENCES public.payments (id, order_id)
    ON DELETE RESTRICT
);

CREATE UNIQUE INDEX payment_attempts_one_active_per_order_idx
  ON public.payment_attempts (order_id)
  WHERE status IN ('created', 'pending');
CREATE INDEX payment_attempts_payment_id_idx
  ON public.payment_attempts (payment_id);

CREATE TABLE public.payment_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_fingerprint text NOT NULL UNIQUE
    CHECK (event_fingerprint ~ '^[0-9a-f]{64}$'),
  provider_event_id text UNIQUE
    CHECK (provider_event_id IS NULL OR length(provider_event_id) BETWEEN 1 AND 128),
  attempt_id uuid,
  order_id uuid REFERENCES public.orders(id) ON DELETE RESTRICT,
  provider_reference text NOT NULL
    CHECK (length(provider_reference) BETWEEN 1 AND 120),
  event_type text NOT NULL CHECK (event_type = 'transaction.updated'),
  provider_status text NOT NULL
    CHECK (provider_status IN ('pending', 'approved', 'rejected', 'error')),
  received_at timestamptz NOT NULL,
  processed_at timestamptz,
  processing_result text NOT NULL DEFAULT 'received'
    CHECK (processing_result IN ('received', 'applied', 'stale', 'unmatched', 'review_required')),
  CONSTRAINT payment_events_attempt_order_fkey
    FOREIGN KEY (attempt_id, order_id)
    REFERENCES public.payment_attempts (id, order_id)
    ON DELETE RESTRICT,
  CONSTRAINT payment_events_attempt_pair_check
    CHECK ((attempt_id IS NULL) = (order_id IS NULL))
);

CREATE INDEX payment_events_order_received_at_idx
  ON public.payment_events (order_id, received_at DESC)
  WHERE order_id IS NOT NULL;

ALTER TABLE public.payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.payment_attempts, public.payment_events
  FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON TABLE public.payment_attempts TO service_role;

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
    OR p_provider_status NOT IN ('pending', 'approved', 'rejected', 'error')
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
  ELSIF v_attempt.status IN ('approved', 'rejected', 'error', 'expired') THEN
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
