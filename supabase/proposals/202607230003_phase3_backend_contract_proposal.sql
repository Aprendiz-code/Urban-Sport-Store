-- Phase C: backend contract proposal (documentary / non-destructive draft)
-- Purpose:
--   1) document the canonical contract now expected by the runtime,
--   2) keep the current public/admin behavior stable,
--   3) avoid destructive changes until the migration plan is explicitly approved.
--
-- IMPORTANT:
--   This file is a proposal only. It is NOT applied automatically.
--   Do not enable RLS here before policies are reviewed.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- Canonical public tables currently validated by the runtime.
CREATE TABLE IF NOT EXISTS public.categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    description text,
    image_url text,
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE RESTRICT,
    name text NOT NULL,
    slug text NOT NULL UNIQUE,
    sku text NOT NULL UNIQUE,
    description text,
    price numeric(10,2) NOT NULL,
    compare_at_price numeric(10,2),
    is_active boolean NOT NULL DEFAULT true,
    stock integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.home_content (
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
CREATE TABLE IF NOT EXISTS public.newsletter_subscribers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    email text NOT NULL UNIQUE,
    source text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.profiles (
    id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role text NOT NULL DEFAULT 'CUSTOMER' CHECK (role IN ('CUSTOMER', 'ADMIN')),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    action text NOT NULL,
    entity text NOT NULL,
    entity_id uuid,
    changes jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS categories_is_active_sort_order_idx
    ON public.categories (is_active, sort_order);
CREATE INDEX IF NOT EXISTS products_is_active_created_at_idx
    ON public.products (is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS products_category_id_idx
    ON public.products (category_id);
CREATE INDEX IF NOT EXISTS audit_logs_actor_id_created_at_idx
    ON public.audit_logs (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_entity_entity_id_idx
    ON public.audit_logs (entity, entity_id);
CREATE INDEX IF NOT EXISTS profiles_role_idx
    ON public.profiles (role);
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS categories_set_updated_at ON public.categories;
CREATE TRIGGER categories_set_updated_at
BEFORE UPDATE ON public.categories
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS products_set_updated_at ON public.products;
CREATE TRIGGER products_set_updated_at
BEFORE UPDATE ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS home_content_set_updated_at ON public.home_content;
CREATE TRIGGER home_content_set_updated_at
BEFORE UPDATE ON public.home_content
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS newsletter_subscribers_set_updated_at ON public.newsletter_subscribers;
CREATE TRIGGER newsletter_subscribers_set_updated_at
BEFORE UPDATE ON public.newsletter_subscribers
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
-- Seed row intentionally kept minimal and stable for the public homepage.
INSERT INTO public.home_content (
    key,
    hero_title,
    hero_subtitle,
    hero_image,
    featured_category_ids,
    featured_product_ids,
    discounted_product_ids,
    promo_banner,
    newsletter_enabled
)
VALUES (
    'homepage',
    'Urban Sport Store',
    'Explora el catálogo principal',
    NULL,
    ARRAY[]::uuid[],
    ARRAY[]::uuid[],
    ARRAY[]::uuid[],
    NULL,
    true
)
ON CONFLICT (key) DO NOTHING;
COMMIT;
