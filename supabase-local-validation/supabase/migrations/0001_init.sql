-- 0001_init.sql
-- Initial schema for Urban Sport Store

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Function to set updated_at timestamp
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- TABLE: profiles (id references auth.users.id)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  role text NOT NULL DEFAULT 'USER',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- TABLE: categories
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  image text,
  sort_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_categories_sort ON public.categories(sort_order);
CREATE INDEX IF NOT EXISTS idx_categories_active ON public.categories(is_active);

-- TABLE: products (expanded schema)
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  brand text,
  short_description text,
  description text,
  price numeric(10,2) NOT NULL,
  original_price numeric(10,2),
  discount_percentage numeric(5,2),
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  subcategory text,
  gender text,
  sizes text[],
  colors jsonb,
  stock integer DEFAULT 0,
  sku text UNIQUE,
  main_image text,
  images jsonb,
  is_featured boolean DEFAULT false,
  is_discounted boolean DEFAULT false,
  is_active boolean DEFAULT true,
  rating numeric(3,2),
  reviews_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_active ON public.products(is_active);
CREATE INDEX IF NOT EXISTS idx_products_featured ON public.products(is_featured);
CREATE INDEX IF NOT EXISTS idx_products_discounted ON public.products(is_discounted);
CREATE INDEX IF NOT EXISTS idx_products_sku ON public.products(sku);

-- TABLE: home_content
CREATE TABLE IF NOT EXISTS public.home_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE,
  hero_title text,
  hero_subtitle text,
  hero_image text,
  featured_category_ids uuid[] DEFAULT '{}',
  featured_product_ids uuid[] DEFAULT '{}',
  discounted_product_ids uuid[] DEFAULT '{}',
  promo_banner jsonb,
  newsletter_enabled boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_home_key ON public.home_content(key);

-- TABLE: newsletter_subscribers (no updated_at)
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_newsletter_email ON public.newsletter_subscribers(email);

-- TABLE: audit_logs (no updated_at)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NULL,
  action text NOT NULL,
  entity text,
  entity_id text,
  changes jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.audit_logs(entity);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON public.audit_logs(created_at);

-- Triggers: set_updated_at on selected tables
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_profiles_set_updated_at') THEN
    CREATE TRIGGER trg_profiles_set_updated_at
      BEFORE UPDATE ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_categories_set_updated_at') THEN
    CREATE TRIGGER trg_categories_set_updated_at
      BEFORE UPDATE ON public.categories
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_products_set_updated_at') THEN
    CREATE TRIGGER trg_products_set_updated_at
      BEFORE UPDATE ON public.products
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_home_content_set_updated_at') THEN
    CREATE TRIGGER trg_home_content_set_updated_at
      BEFORE UPDATE ON public.home_content
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

-- Trigger to create profile row when auth.users created
CREATE OR REPLACE FUNCTION public.handle_auth_user_created()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, created_at, updated_at)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.user_metadata->>'full_name', NEW.email), 'USER', now(), now())
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_auth_user_created') THEN
    CREATE TRIGGER trg_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION public.handle_auth_user_created();
  END IF;
END$$;

-- Enable Row Level Security where applicable
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.home_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Policies

-- profiles: select own or admin; update own
CREATE POLICY profiles_select_own_or_admin ON public.profiles
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND (auth.uid()::uuid = id OR EXISTS (SELECT 1 FROM public.profiles p2 WHERE p2.id = auth.uid()::uuid AND p2.role = 'ADMIN'))
  );

CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE USING (auth.uid() IS NOT NULL AND auth.uid()::uuid = id)
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid()::uuid = id);

-- products: public select only active; admin modify
CREATE POLICY public_select_products ON public.products
  FOR SELECT USING (is_active = true);

CREATE POLICY admin_modify_products ON public.products
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::uuid AND p.role = 'ADMIN')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::uuid AND p.role = 'ADMIN')
  );

-- categories: public select only active; admin modify
CREATE POLICY public_select_categories ON public.categories
  FOR SELECT USING (is_active = true);

CREATE POLICY admin_modify_categories ON public.categories
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::uuid AND p.role = 'ADMIN')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::uuid AND p.role = 'ADMIN')
  );

-- home_content: public select; admin modify
CREATE POLICY public_select_home_content ON public.home_content
  FOR SELECT USING (true);

CREATE POLICY admin_modify_home_content ON public.home_content
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::uuid AND p.role = 'ADMIN')
  ) WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::uuid AND p.role = 'ADMIN')
  );

-- newsletter_subscribers: allow public INSERT only (WITH CHECK true). Select/Delete restricted to admin.
CREATE POLICY public_insert_newsletter ON public.newsletter_subscribers
  FOR INSERT WITH CHECK (true);

CREATE POLICY admin_select_newsletter ON public.newsletter_subscribers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::uuid AND p.role = 'ADMIN')
  );

CREATE POLICY admin_delete_newsletter ON public.newsletter_subscribers
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::uuid AND p.role = 'ADMIN')
  );

-- audit_logs: INSERT only by admin (WITH CHECK), select only admin
CREATE POLICY admin_insert_audit_logs ON public.audit_logs
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::uuid AND p.role = 'ADMIN')
  );

CREATE POLICY admin_select_audit_logs ON public.audit_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::uuid AND p.role = 'ADMIN')
  );

-- End of migration
