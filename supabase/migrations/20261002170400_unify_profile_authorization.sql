BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
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
    FROM public.profiles AS profile
    WHERE profile.id = (SELECT auth.uid())
      AND pg_catalog.upper(profile.role::text) IN (
        'OWNER', 'ADMIN', 'CATALOG_MANAGER', 'LOGISTICS', 'ACCOUNTANT'
      )
      AND profile.is_active IS TRUE
  );
$$;

REVOKE ALL ON FUNCTION private.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL PRIVILEGES ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.profiles TO authenticated;
GRANT ALL PRIVILEGES ON TABLE public.profiles TO service_role;

DO $$
DECLARE
  allowed_columns text;
  policy_row record;
BEGIN
  FOR policy_row IN
    SELECT policyname
    FROM pg_catalog.pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
  LOOP
    EXECUTE pg_catalog.format('DROP POLICY %I ON public.profiles', policy_row.policyname);
  END LOOP;

  SELECT pg_catalog.string_agg(pg_catalog.format('%I', column_name), ', ' ORDER BY column_name)
  INTO allowed_columns
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name = ANY (ARRAY['first_name', 'last_name', 'full_name', 'phone']);

  IF allowed_columns IS NOT NULL THEN
    EXECUTE pg_catalog.format(
      'GRANT UPDATE (%s) ON TABLE public.profiles TO authenticated',
      allowed_columns
    );
  END IF;
END;
$$;

CREATE POLICY profiles_self_select
ON public.profiles FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = id);

CREATE POLICY profiles_admin_select
ON public.profiles FOR SELECT TO authenticated
USING ((SELECT private.is_admin()));

CREATE POLICY profiles_self_update
ON public.profiles FOR UPDATE TO authenticated
USING ((SELECT auth.uid()) = id)
WITH CHECK ((SELECT auth.uid()) = id);

DROP POLICY IF EXISTS admin_modify_products ON public.products;
DROP POLICY IF EXISTS admin_modify_categories ON public.categories;
DROP POLICY IF EXISTS admin_modify_home_content ON public.home_content;
DROP POLICY IF EXISTS "Allow authenticated admin insert" ON public.products;
DROP POLICY IF EXISTS "Allow authenticated admin update" ON public.products;
DROP POLICY IF EXISTS "Allow authenticated admin delete" ON public.products;

ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "products upload authenticated" ON storage.objects;
DROP POLICY IF EXISTS "products delete admin" ON storage.objects;
DROP POLICY IF EXISTS "Admin write access to product-images" ON storage.objects;

CREATE POLICY "products upload authenticated"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'products' AND (SELECT private.is_admin()));

CREATE POLICY "products delete admin"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'products' AND (SELECT private.is_admin()));

COMMIT;