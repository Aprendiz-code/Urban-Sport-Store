BEGIN;

CREATE OR REPLACE FUNCTION public.lookup_payment_link_session_by_reference(
  p_internal_reference text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_provider_session_id text;
BEGIN
  IF COALESCE(auth.jwt() ->> 'role', '') <> 'service_role' THEN
    RAISE EXCEPTION 'Only the authorized backend may look up payment attempts'
      USING ERRCODE = '42501';
  END IF;

  IF p_internal_reference IS NULL
    OR p_internal_reference !~ '^[A-Za-z0-9_-]{1,120}$' THEN
    RETURN pg_catalog.jsonb_build_object('status', 'unmatched');
  END IF;

  SELECT attempt.provider_session_id
  INTO v_provider_session_id
  FROM public.payment_attempts AS attempt
  WHERE attempt.reference = p_internal_reference
    AND attempt.provider_session_type = 'payment_link'
    AND attempt.session_state IN ('ready', 'outcome_unknown', 'voided')
    AND attempt.status IN ('created', 'pending', 'approved', 'rejected', 'error', 'expired', 'voided');

  IF NOT FOUND OR v_provider_session_id IS NULL THEN
    RETURN pg_catalog.jsonb_build_object('status', 'unmatched');
  END IF;

  RETURN public.lookup_payment_link_session(v_provider_session_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.lookup_payment_link_session_by_reference(text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.lookup_payment_link_session_by_reference(text)
  TO service_role;

COMMIT;