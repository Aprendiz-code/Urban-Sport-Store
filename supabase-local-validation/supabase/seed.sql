-- Minimal seed for Urban Sport Store
-- Creates sample categories, a sample product, and home_content

-- Insert categories
INSERT INTO public.categories (id, name, slug, description, sort_order, is_active, created_at)
VALUES
  (gen_random_uuid(), 'General', 'general', 'Categoría general de productos', 0, true, now()),
  (gen_random_uuid(), 'Calzado', 'calzado', 'Zapatillas y calzado deportivo', 1, true, now())
ON CONFLICT (slug) DO NOTHING;

-- Insert a sample product (links to first category)
WITH cat AS (
  SELECT id FROM public.categories WHERE slug = 'general' LIMIT 1
)
INSERT INTO public.products (slug, name, brand, short_description, description, price, category_id, sizes, colors, stock, sku, main_image, images, is_active, created_at)
SELECT
  'sample-product-1',
  'Zapatillas Urban Runner',
  'UrbanBrand',
  'Zapatillas cómodas para entrenamiento diario',
  'Descripción detallada del producto de ejemplo.',
  49.99,
  cat.id,
  ARRAY['S','M','L','XL'],
  jsonb_build_array(jsonb_build_object('name','Negro','hex','#000000')),
  120,
  'UB-001',
  'https://cdn.urbansportstore.test/products/ub-001-main.jpg',
  jsonb_build_array('https://cdn.urbansportstore.test/products/ub-001-1.jpg','https://cdn.urbansportstore.test/products/ub-001-2.jpg'),
  true,
  now()
FROM cat
ON CONFLICT (slug) DO NOTHING;

-- Insert home content sample
INSERT INTO public.home_content (key, hero_title, hero_subtitle, hero_image, featured_category_ids, featured_product_ids, promo_banner, newsletter_enabled, created_at)
VALUES (
  'homepage',
  'Bienvenido a Urban Sport Store',
  'Encuentra tu próximo par de zapatillas',
  'https://cdn.urbansportstore.test/home/hero.jpg',
  (SELECT ARRAY(SELECT id FROM public.categories WHERE slug IN ('general','calzado'))),
  (SELECT ARRAY(SELECT id FROM public.products WHERE slug = 'sample-product-1')),
  jsonb_build_object('image','https://cdn.urbansportstore.test/home/promo.jpg','link','/promos/summer','alt','Promo de verano'),
  true,
  now()
)
ON CONFLICT (key) DO NOTHING;

-- Insert sample newsletter subscriber (aligned schema)
INSERT INTO public.newsletter_subscribers (id, email, status, source, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'sample@urbansportstore.test',
  'ACTIVE',
  'homepage',
  now(),
  now()
)
ON CONFLICT (email) DO NOTHING;

-- Insert a sample audit log entry reflecting the created sample product
INSERT INTO public.audit_logs (id, actor_id, action, entity, entity_id, entity_id_uuid, before_data, after_data, created_at)
VALUES (
  gen_random_uuid(),
  NULL,
  'seed_create_product',
  'product',
  (SELECT id FROM public.products WHERE slug = 'sample-product-1' LIMIT 1),
  (SELECT id FROM public.products WHERE slug = 'sample-product-1' LIMIT 1),
  NULL,
  (SELECT to_jsonb(p) FROM (SELECT * FROM public.products WHERE slug = 'sample-product-1' LIMIT 1) p),
  now()
)
ON CONFLICT DO NOTHING;
