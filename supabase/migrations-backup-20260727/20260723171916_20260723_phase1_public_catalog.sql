-- FASE 1: catálogo público mínimo y seguro
-- Objetivo: destrabar lectura de catálogo/home/newsletter sin aplicar políticas de RLS ni roles.

BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS public.categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL,
    description text,
    image_url text,
    is_active boolean NOT NULL DEFAULT true,
    sort_order integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.products (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id uuid NOT NULL,
    name text NOT NULL,
    slug text NOT NULL,
    sku text NOT NULL,
    description text,
    price numeric(10,2) NOT NULL,
    compare_at_price numeric(10,2),
    is_active boolean NOT NULL DEFAULT true,
    stock integer NOT NULL DEFAULT 0,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id)
        REFERENCES public.categories (id)
        ON DELETE RESTRICT
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
CREATE UNIQUE INDEX IF NOT EXISTS categories_slug_key
    ON public.categories (slug);
CREATE INDEX IF NOT EXISTS categories_is_active_sort_order_idx
    ON public.categories (is_active, sort_order);
CREATE UNIQUE INDEX IF NOT EXISTS products_slug_key
    ON public.products (slug);
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_key
    ON public.products (sku);
CREATE INDEX IF NOT EXISTS products_is_active_created_at_idx
    ON public.products (is_active, created_at DESC);
CREATE INDEX IF NOT EXISTS products_category_id_idx
    ON public.products (category_id);
CREATE UNIQUE INDEX IF NOT EXISTS home_content_key_key
    ON public.home_content (key);
CREATE UNIQUE INDEX IF NOT EXISTS newsletter_subscribers_email_key
    ON public.newsletter_subscribers (email);
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
