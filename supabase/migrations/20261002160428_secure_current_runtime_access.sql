BEGIN;

ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS image text;
UPDATE public.categories
SET image = image_url
WHERE image IS NULL AND image_url IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS categories_public_read ON public.categories;
CREATE POLICY categories_public_read
ON public.categories FOR SELECT TO anon, authenticated
USING (is_active IS TRUE);

DROP POLICY IF EXISTS products_public_read ON public.products;
CREATE POLICY products_public_read
ON public.products FOR SELECT TO anon, authenticated
USING (is_active IS TRUE);

DROP POLICY IF EXISTS home_content_public_read ON public.home_content;
CREATE POLICY home_content_public_read
ON public.home_content FOR SELECT TO anon, authenticated
USING (true);

DROP POLICY IF EXISTS newsletter_public_insert ON public.newsletter_subscribers;
CREATE POLICY newsletter_public_insert
ON public.newsletter_subscribers FOR INSERT TO anon, authenticated
WITH CHECK (status = 'ACTIVE');

REVOKE ALL PRIVILEGES ON TABLE
  public.categories,
  public.products,
  public.home_content,
  public.newsletter_subscribers,
  public.audit_logs,
  public.profiles
FROM PUBLIC, anon, authenticated;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.categories, public.products, public.home_content TO anon, authenticated;
GRANT INSERT (email, source, status) ON TABLE public.newsletter_subscribers TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.categories,
  public.products,
  public.home_content,
  public.audit_logs
TO service_role;

DROP POLICY IF EXISTS "products upload authenticated" ON storage.objects;
DROP POLICY IF EXISTS "products delete admin" ON storage.objects;

CREATE POLICY "products upload authenticated"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'products'
  AND (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('OWNER', 'ADMIN', 'CATALOG_MANAGER')
    OR auth.jwt() -> 'app_metadata' ->> 'isAdmin' = 'true'
    OR auth.jwt() -> 'app_metadata' ->> 'is_admin' = 'true'
  )
);

CREATE POLICY "products delete admin"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'products'
  AND (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('OWNER', 'ADMIN', 'CATALOG_MANAGER')
    OR auth.jwt() -> 'app_metadata' ->> 'isAdmin' = 'true'
    OR auth.jwt() -> 'app_metadata' ->> 'is_admin' = 'true'
  )
);

COMMIT;