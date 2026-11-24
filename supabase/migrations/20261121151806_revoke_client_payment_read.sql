-- BORRADOR — NO APROBADO PARA PRODUCCIÓN
-- Revisión de grants de lectura directa en payments y payment_attempts.
-- No es una migración. No ejecutar contra producción.
--
-- Revoca SELECT de tabla y, por separado, SELECT explícito por columna.
-- No modifica RLS, propietarios, funciones, permisos de escritura ni otras tablas.
-- No revoca grants de service_role: el acceso SELECT de servidor observado
-- y los EXECUTE de RPC quedan intactos.
--
-- Los chequeos finales consideran permisos efectivos, incluidos PUBLIC y
-- membresías heredadas. Si una membresía concede acceso residual, el DO falla
-- y la transacción completa debe revertirse; este borrador no cambia roles
-- heredados ni sus grants.

BEGIN;
REVOKE SELECT ON TABLE public.payments
  FROM PUBLIC, anon, authenticated;
REVOKE SELECT (
  id,
  order_id,
  payment_provider,
  status,
  amount,
  currency,
  created_at
) ON TABLE public.payments
  FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON TABLE public.payment_attempts
  FROM PUBLIC, anon, authenticated;
REVOKE SELECT (
  id,
  order_id,
  payment_id,
  reference,
  attempt_number,
  status,
  transaction_id,
  expected_amount,
  currency,
  session_state,
  session_claim_token,
  session_claim_expires_at,
  checkout_url,
  checkout_expires_at,
  session_created_at,
  session_error_code,
  created_at,
  updated_at,
  provider_session_id,
  provider_session_type,
  provider_session_expires_at
) ON TABLE public.payment_attempts
  FROM PUBLIC, anon, authenticated;
DO $$
DECLARE
  client_role text;
  target_table regclass;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    FOREACH target_table IN ARRAY ARRAY[
      'public.payments'::regclass,
      'public.payment_attempts'::regclass
    ] LOOP
      IF has_table_privilege(client_role, target_table, 'SELECT')
         OR has_any_column_privilege(client_role, target_table, 'SELECT') THEN
        RAISE EXCEPTION
          'Residual effective SELECT for role % on % (possibly inherited); transaction must roll back',
          client_role, target_table;
      END IF;
    END LOOP;
  END LOOP;

  IF NOT has_table_privilege('service_role', 'public.payments', 'SELECT')
     OR NOT has_table_privilege('service_role', 'public.payment_attempts', 'SELECT') THEN
    RAISE EXCEPTION
      'Observed service_role table SELECT is missing; transaction must roll back';
  END IF;
END
$$;
COMMIT;
