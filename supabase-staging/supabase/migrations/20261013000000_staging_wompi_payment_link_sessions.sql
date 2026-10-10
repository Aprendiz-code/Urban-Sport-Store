BEGIN;

ALTER TABLE public.payment_attempts
  ADD COLUMN provider_session_id text,
  ADD COLUMN provider_session_type text,
  ADD COLUMN provider_session_expires_at timestamptz,
  ADD CONSTRAINT payment_attempts_provider_session_id_key
    UNIQUE (provider_session_id),
  ADD CONSTRAINT payment_attempts_provider_session_fields_check
    CHECK (
      (
        provider_session_id IS NULL
        AND provider_session_type IS NULL
        AND provider_session_expires_at IS NULL
      )
      OR (
        provider_session_id IS NOT NULL
        AND provider_session_id ~ '^[A-Za-z0-9_-]{1,128}$'
        AND provider_session_type = 'payment_link'
        AND provider_session_expires_at IS NOT NULL
      )
    ),
  ADD CONSTRAINT payment_attempts_provider_session_ready_check
    CHECK (
      session_state <> 'ready'
      OR provider_session_id IS NULL
      OR (
        provider_session_type = 'payment_link'
        AND provider_session_expires_at = checkout_expires_at
      )
    );

CREATE OR REPLACE FUNCTION public.complete_payment_session_with_provider_session(
  p_attempt_id uuid,
  p_claim_token uuid,
  p_outcome text,
  p_transaction_id text,
  p_checkout_url text,
  p_expires_at timestamptz,
  p_provider_session_id text,
  p_provider_session_type text,
  p_provider_session_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_result jsonb;
  v_constraint_name text;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the authorized backend may complete provider sessions'
      USING ERRCODE = '42501';
  END IF;

  IF (
    p_provider_session_id IS NULL
    AND (
      p_provider_session_type IS NOT NULL
      OR p_provider_session_expires_at IS NOT NULL
    )
  ) OR (
    p_provider_session_id IS NOT NULL
    AND (
      p_provider_session_id !~ '^[A-Za-z0-9_-]{1,128}$'
      OR p_provider_session_type IS DISTINCT FROM 'payment_link'
      OR p_provider_session_expires_at IS NULL
    )
  ) OR (
    p_outcome = 'ready'
    AND (
      p_provider_session_id IS NULL
      OR p_provider_session_expires_at IS DISTINCT FROM p_expires_at
    )
  ) OR (
    p_outcome NOT IN ('ready', 'outcome_unknown')
    AND p_provider_session_id IS NOT NULL
  ) THEN
    RETURN pg_catalog.jsonb_build_object(
      'status', 'conflict',
      'reason', 'invalid_provider_session'
    );
  END IF;

  BEGIN
    v_result := public.complete_payment_session(
      p_attempt_id,
      p_claim_token,
      p_outcome,
      p_transaction_id,
      p_checkout_url,
      p_expires_at
    );

    IF v_result ->> 'status' IN ('ready', 'outcome_unknown')
      AND p_provider_session_id IS NOT NULL THEN
      UPDATE public.payment_attempts
      SET provider_session_id = p_provider_session_id,
          provider_session_type = p_provider_session_type,
          provider_session_expires_at = p_provider_session_expires_at,
          updated_at = pg_catalog.clock_timestamp()
      WHERE id = p_attempt_id
        AND session_state = v_result ->> 'status';
    END IF;

    RETURN v_result;
  EXCEPTION
    WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint_name = CONSTRAINT_NAME;
      IF v_constraint_name <> 'payment_attempts_provider_session_id_key' THEN
        RAISE;
      END IF;
      RETURN pg_catalog.jsonb_build_object(
        'status', 'conflict',
        'reason', 'provider_session_already_recorded'
      );
  END;
END;
$function$;

REVOKE ALL ON FUNCTION public.complete_payment_session_with_provider_session(
  uuid, uuid, text, text, text, timestamptz, text, text, timestamptz
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_payment_session_with_provider_session(
  uuid, uuid, text, text, text, timestamptz, text, text, timestamptz
) TO service_role;

COMMIT;
