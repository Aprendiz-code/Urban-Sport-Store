BEGIN;

-- Seed minimal public catalog: 2 categories + 3 products + homepage content.
-- Idempotent: repeated execution updates existing rows instead of duplicating them.

WITH category_seed(name, slug, description, image_url, sort_order) AS (
  VALUES
    (
      'Running',
      'running',
      'Sneakers and essentials for speed, comfort, and everyday movement.',
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=900&q=80',
      1
    ),
    (
      'Training',
      'training',
      'Versatile training pieces for gym sessions and active routines.',
      'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=900&q=80',
      2
    )
),
upserted_categories AS (
  INSERT INTO public.categories (
    id,
    name,
    slug,
    description,
    image_url,
    is_active,
    sort_order,
    created_at,
    updated_at
  )
  SELECT
    CASE slug
      WHEN 'running' THEN '11111111-1111-1111-1111-111111111111'::uuid
      WHEN 'training' THEN '22222222-2222-2222-2222-222222222222'::uuid
    END,
    name,
    slug,
    description,
    image_url,
    true,
    sort_order,
    NOW(),
    NOW()
  FROM category_seed
  ON CONFLICT (slug) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    image_url = EXCLUDED.image_url,
    is_active = true,
    sort_order = EXCLUDED.sort_order,
    updated_at = NOW()
  RETURNING id, slug
)
SELECT 1;

WITH category_map AS (
  SELECT id, slug FROM public.categories WHERE slug IN ('running', 'training')
),
product_seed(name, slug, category_slug, sku, description, price, compare_at_price, stock) AS (
  VALUES
    (
      'Urban Sprint Runner',
      'urban-sprint-runner',
      'running',
      'USR-001',
      'Lightweight running shoe built for everyday speed and comfort.',
      129.99,
      149.99,
      12
    ),
    (
      'Train Pro Flex',
      'train-pro-flex',
      'training',
      'TPF-001',
      'Stable training sneaker for gym sessions and versatile workouts.',
      119.99,
      139.99,
      9
    ),
    (
      'Street Court Lite',
      'street-court-lite',
      'training',
      'SCL-001',
      'A smart everyday court-style option with strong comfort and grip.',
      99.99,
      119.99,
      15
    )
)
INSERT INTO public.products (
  id,
  category_id,
  name,
  slug,
  sku,
  description,
  price,
  compare_at_price,
  is_active,
  stock,
  created_at,
  updated_at
)
SELECT
  CASE ps.slug
    WHEN 'urban-sprint-runner' THEN '33333333-3333-3333-3333-333333333333'::uuid
    WHEN 'train-pro-flex' THEN '44444444-4444-4444-4444-444444444444'::uuid
    WHEN 'street-court-lite' THEN '55555555-5555-5555-5555-555555555555'::uuid
  END,
  cm.id,
  ps.name,
  ps.slug,
  ps.sku,
  ps.description,
  ps.price,
  ps.compare_at_price,
  true,
  ps.stock,
  NOW(),
  NOW()
FROM product_seed ps
JOIN category_map cm ON cm.slug = ps.category_slug
ON CONFLICT (slug) DO UPDATE SET
  category_id = EXCLUDED.category_id,
  name = EXCLUDED.name,
  sku = EXCLUDED.sku,
  description = EXCLUDED.description,
  price = EXCLUDED.price,
  compare_at_price = EXCLUDED.compare_at_price,
  is_active = true,
  stock = EXCLUDED.stock,
  updated_at = NOW();

WITH homepage_ref AS (
  SELECT
    ARRAY[
      '11111111-1111-1111-1111-111111111111'::uuid,
      '22222222-2222-2222-2222-222222222222'::uuid
    ] AS featured_categories,
    ARRAY[
      '33333333-3333-3333-3333-333333333333'::uuid,
      '44444444-4444-4444-4444-444444444444'::uuid,
      '55555555-5555-5555-5555-555555555555'::uuid
    ] AS featured_products
)
INSERT INTO public.home_content (
  id,
  key,
  hero_title,
  hero_subtitle,
  hero_image,
  featured_category_ids,
  featured_product_ids,
  discounted_product_ids,
  promo_banner,
  newsletter_enabled,
  created_at,
  updated_at
)
SELECT
  '66666666-6666-6666-6666-666666666666'::uuid,
  'homepage',
  'Urban Sport Store',
  'Explora el catálogo principal con categorías y productos mínimos para pruebas públicas.',
  'https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80',
  hr.featured_categories,
  hr.featured_products,
  ARRAY[]::uuid[],
  'Descubre tu próxima compra con estilo y rendimiento.',
  true,
  NOW(),
  NOW()
FROM homepage_ref hr
ON CONFLICT (key) DO UPDATE SET
  hero_title = EXCLUDED.hero_title,
  hero_subtitle = EXCLUDED.hero_subtitle,
  hero_image = EXCLUDED.hero_image,
  featured_category_ids = EXCLUDED.featured_category_ids,
  featured_product_ids = EXCLUDED.featured_product_ids,
  discounted_product_ids = EXCLUDED.discounted_product_ids,
  promo_banner = EXCLUDED.promo_banner,
  newsletter_enabled = EXCLUDED.newsletter_enabled,
  updated_at = NOW();

COMMIT;
