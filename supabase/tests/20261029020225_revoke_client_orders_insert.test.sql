BEGIN;

SELECT plan(9);

-- Default privileges for future public tables remain pending separate authorization.

SELECT ok(
  NOT has_table_privilege('anon', 'public.orders', 'INSERT'),
  'anon cannot insert orders'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.orders', 'INSERT'),
  'authenticated cannot insert orders'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.orders', 'SELECT'),
  'authenticated retains order reads'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.claim_payment_session(uuid,uuid,uuid)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.claim_payment_session(uuid,uuid,uuid)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.claim_payment_session(uuid,uuid,uuid)', 'EXECUTE'),
  'claim_payment_session is executable only by service_role'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.complete_payment_session_with_provider_session(uuid,uuid,text,text,text,timestamptz,text,text,timestamptz)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.complete_payment_session_with_provider_session(uuid,uuid,text,text,text,timestamptz,text,text,timestamptz)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.complete_payment_session_with_provider_session(uuid,uuid,text,text,text,timestamptz,text,text,timestamptz)', 'EXECUTE'),
  'complete_payment_session_with_provider_session is executable only by service_role'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.lookup_payment_link_session(text,uuid,uuid)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.lookup_payment_link_session(text,uuid,uuid)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.lookup_payment_link_session(text,uuid,uuid)', 'EXECUTE'),
  'lookup_payment_link_session is executable only by service_role'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.process_verified_wompi_event_after_requote(text,text,text,text,text,text,numeric,text,timestamptz,text)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.process_verified_wompi_event_after_requote(text,text,text,text,text,text,numeric,text,timestamptz,text)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.process_verified_wompi_event_after_requote(text,text,text,text,text,text,numeric,text,timestamptz,text)', 'EXECUTE'),
  'process_verified_wompi_event_after_requote is executable only by service_role'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.process_verified_wompi_event_by_provider_session(text,text,text,text,text,text,numeric,text,timestamptz,text,uuid,uuid)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.process_verified_wompi_event_by_provider_session(text,text,text,text,text,text,numeric,text,timestamptz,text,uuid,uuid)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.process_verified_wompi_event_by_provider_session(text,text,text,text,text,text,numeric,text,timestamptz,text,uuid,uuid)', 'EXECUTE'),
  'process_verified_wompi_event_by_provider_session is executable only by service_role'
);

SELECT ok(
  NOT has_function_privilege('anon', 'public.process_verified_wompi_event(text,text,text,text,text,text,numeric,text,timestamptz,text)', 'EXECUTE')
    AND NOT has_function_privilege('authenticated', 'public.process_verified_wompi_event(text,text,text,text,text,text,numeric,text,timestamptz,text)', 'EXECUTE')
    AND has_function_privilege('service_role', 'public.process_verified_wompi_event(text,text,text,text,text,text,numeric,text,timestamptz,text)', 'EXECUTE'),
  'process_verified_wompi_event is executable only by service_role'
);

ROLLBACK;