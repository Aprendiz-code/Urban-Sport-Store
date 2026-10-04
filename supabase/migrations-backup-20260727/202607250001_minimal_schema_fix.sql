-- Minimal schema fix: only create missing tables compatible with existing products
-- This is NOT a full migration - just the minimum to unblock the API

BEGIN;

-- Create profiles table (required by admin.ts JWT verification, but optional since we use auth metadata)
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text,
  full_name text,
  role text NOT NULL DEFAULT 'USER',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- Create categories table (required by /api/categories and /api/admin/categories)
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

-- Create home_content table (required by /api/admin/home-content)
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

-- Create audit_logs table (optional, but defined in migrations)
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid NULL,
  action text NOT NULL,
  entity text,
  entity_id text,
  entity_id_uuid uuid,
  before_data jsonb,
  after_data jsonb,
  changes jsonb,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_entity ON public.audit_logs(entity);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON public.audit_logs(created_at);

-- Create function for set_updated_at trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Triggers for updated_at columns
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
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_home_content_set_updated_at') THEN
    CREATE TRIGGER trg_home_content_set_updated_at
      BEFORE UPDATE ON public.home_content
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

COMMIT;
