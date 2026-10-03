BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated;

CREATE OR REPLACE FUNCTION private.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles AS p
    WHERE p.id = (SELECT auth.uid())
      AND upper(p.role::text) IN ('OWNER', 'ADMIN', 'CATALOG_MANAGER', 'LOGISTICS', 'ACCOUNTANT')
      AND p.is_active IS TRUE
  );
$$;

REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.audit_logs FROM anon, authenticated;
GRANT SELECT ON TABLE public.audit_logs TO authenticated;

DO $$
DECLARE
  policy_row record;
  allowed_columns text;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN ('profiles', 'audit_logs')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', policy_row.policyname, policy_row.schemaname, policy_row.tablename);
  END LOOP;

  SELECT string_agg(format('%I', column_name), ', ' ORDER BY column_name)
  INTO allowed_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = ANY (ARRAY['first_name', 'last_name', 'full_name', 'phone']);

  IF allowed_columns IS NOT NULL THEN
    EXECUTE format('GRANT UPDATE (%s) ON TABLE public.profiles TO authenticated', allowed_columns);
  END IF;

END;
$$;

CREATE POLICY "profiles_self_select"
ON public.profiles FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = id);

CREATE POLICY "profiles_admin_select"
ON public.profiles FOR SELECT TO authenticated
USING ((SELECT private.is_admin()));

CREATE POLICY "profiles_self_update"
ON public.profiles FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = id)
WITH CHECK ((SELECT auth.uid()) = id);

CREATE POLICY "audit_logs_admin_select"
ON public.audit_logs FOR SELECT TO authenticated
USING ((SELECT private.is_admin()));

COMMIT;
