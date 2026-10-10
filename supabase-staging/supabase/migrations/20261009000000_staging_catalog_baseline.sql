BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  first_name text,
  last_name text,
  full_name text,
  phone text,
  role text NOT NULL DEFAULT 'CUSTOMER'
    CHECK (role IN ('CUSTOMER', 'OWNER', 'ADMIN', 'CATALOG_MANAGER', 'LOGISTICS', 'ACCOUNTANT')),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id text,
  entity_id_uuid uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  image text,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  brand text NOT NULL,
  description text,
  price numeric(12, 2) NOT NULL CHECK (price >= 0),
  compare_at_price numeric(12, 2) CHECK (compare_at_price IS NULL OR compare_at_price >= 0),
  sku text NOT NULL UNIQUE,
  stock integer NOT NULL DEFAULT 0 CHECK (stock >= 0),
  main_image text,
  images jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(images) = 'array'),
  sizes text[] NOT NULL DEFAULT ARRAY[]::text[],
  specifications jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(specifications) = 'array'),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.home_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  hero_title text,
  hero_subtitle text,
  hero_image text,
  featured_category_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  featured_product_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  discounted_product_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  promo_banner text,
  newsletter_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  source text,
  status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (status IN ('ACTIVE', 'UNSUBSCRIBED', 'BOUNCED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX profiles_role_is_active_idx ON public.profiles (role, is_active);
CREATE INDEX categories_active_sort_order_idx ON public.categories (is_active, sort_order);
CREATE INDEX products_active_created_at_idx ON public.products (is_active, created_at DESC);
CREATE INDEX products_category_active_idx ON public.products (category_id, is_active);
CREATE INDEX audit_logs_created_at_idx ON public.audit_logs (created_at DESC);
CREATE INDEX newsletter_subscribers_status_idx ON public.newsletter_subscribers (status);

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $function$
BEGIN
  NEW.updated_at = pg_catalog.now();
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER categories_set_updated_at
BEFORE UPDATE ON public.categories
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER products_set_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER home_content_set_updated_at
BEFORE UPDATE ON public.home_content
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER newsletter_subscribers_set_updated_at
BEFORE UPDATE ON public.newsletter_subscribers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.handle_auth_user_created()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, is_active)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(NEW.raw_user_meta_data ->> 'full_name', ''),
    'CUSTOMER',
    true
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.handle_auth_user_created() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_created();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_self_select
ON public.profiles FOR SELECT TO authenticated
USING ((SELECT auth.uid()) = id);

CREATE POLICY categories_public_read
ON public.categories FOR SELECT TO anon, authenticated
USING (is_active IS TRUE);

CREATE POLICY products_public_read
ON public.products FOR SELECT TO anon, authenticated
USING (is_active IS TRUE);

CREATE POLICY home_content_public_read
ON public.home_content FOR SELECT TO anon, authenticated
USING (true);

REVOKE ALL PRIVILEGES ON TABLE
  public.profiles,
  public.audit_logs,
  public.categories,
  public.products,
  public.home_content,
  public.newsletter_subscribers
FROM PUBLIC, anon, authenticated, service_role;

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON TABLE public.categories, public.products, public.home_content TO anon, authenticated;
GRANT SELECT (id, role, is_active) ON TABLE public.profiles TO authenticated;

GRANT SELECT ON TABLE public.profiles TO service_role;
GRANT UPDATE (first_name, last_name, full_name, phone) ON TABLE public.profiles TO service_role;
GRANT SELECT, INSERT ON TABLE public.audit_logs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.categories, public.products TO service_role;
GRANT SELECT, UPDATE ON TABLE public.home_content TO service_role;
GRANT INSERT ON TABLE public.newsletter_subscribers TO service_role;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'products',
  'products',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

COMMIT;