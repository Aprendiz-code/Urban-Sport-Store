-- Migration unit 1: schema_changes
-- Transaction mode: transactional
-- Boundary reason: default

SET check_function_bodies = false;

DROP TRIGGER trg_auth_user_created ON auth.users;

DROP EXTENSION pg_net;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE UPDATE ON SEQUENCES FROM anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE UPDATE ON SEQUENCES FROM authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE UPDATE ON SEQUENCES FROM service_role;

DROP FUNCTION public.handle_auth_user_created();

ALTER TABLE public.audit_logs
  ALTER COLUMN entity_id TYPE uuid USING entity_id::uuid;

ALTER TABLE public.categories
  DROP COLUMN image;

ALTER TABLE public.home_content
  ALTER COLUMN promo_banner TYPE text USING promo_banner::text;

ALTER TABLE public.products
  DROP COLUMN brand;

ALTER TABLE public.products
  DROP COLUMN colors;

ALTER TABLE public.products
  DROP COLUMN discount_percentage;

ALTER TABLE public.products
  DROP COLUMN gender;

ALTER TABLE public.products
  DROP COLUMN images;

ALTER TABLE public.products
  DROP COLUMN main_image;

ALTER TABLE public.products
  DROP COLUMN original_price;

ALTER TABLE public.products
  DROP COLUMN rating;

ALTER TABLE public.products
  DROP COLUMN reviews_count;

ALTER TABLE public.products
  DROP COLUMN short_description;

ALTER TABLE public.products
  DROP COLUMN sizes;

ALTER TABLE public.products
  DROP COLUMN subcategory;

ALTER TABLE public.profiles
  DROP COLUMN email;

ALTER TABLE public.profiles
  DROP COLUMN full_name;

COMMENT ON COLUMN public.audit_logs.before_data IS NULL;

COMMENT ON COLUMN public.audit_logs.after_data IS NULL;

COMMENT ON COLUMN public.audit_logs.entity_id_uuid IS NULL;

ALTER TABLE public.categories
  DROP CONSTRAINT categories_slug_key;

COMMENT ON COLUMN public.newsletter_subscribers.status IS NULL;

COMMENT ON COLUMN public.newsletter_subscribers.source IS NULL;

ALTER TABLE public.products
  DROP CONSTRAINT fk_products_category_id;

ALTER TABLE public.products
  DROP CONSTRAINT products_category_id_fkey;

DROP INDEX public.idx_audit_actor_id;

DROP INDEX public.idx_audit_created_at;

DROP INDEX public.idx_audit_entity;

DROP INDEX public.idx_audit_entity_id_uuid;

DROP INDEX public.idx_categories_active;

DROP INDEX public.idx_categories_sort;

DROP INDEX public.idx_home_key;

DROP INDEX public.idx_newsletter_email;

DROP INDEX public.idx_newsletter_status;

DROP INDEX public.idx_products_active;

DROP INDEX public.idx_products_category;

DROP INDEX public.idx_products_discounted;

ALTER TABLE public.products
  DROP COLUMN is_discounted;

DROP INDEX public.idx_products_featured;

ALTER TABLE public.products
  DROP COLUMN is_featured;

DROP INDEX public.idx_products_sku;

DROP INDEX public.idx_products_slug;

DROP INDEX public.idx_profiles_role;

DROP TRIGGER trg_categories_set_updated_at ON public.categories;

DROP TRIGGER trg_home_content_set_updated_at ON public.home_content;

DROP TRIGGER trg_newsletter_subscribers_set_updated_at ON public.newsletter_subscribers;

DROP TRIGGER trg_products_set_updated_at ON public.products;

DROP TRIGGER trg_profiles_set_updated_at ON public.profiles;

DROP POLICY admin_insert_audit_logs ON public.audit_logs;

DROP POLICY admin_select_audit_logs ON public.audit_logs;

DROP POLICY admin_modify_categories ON public.categories;

DROP POLICY public_select_categories ON public.categories;

DROP POLICY admin_modify_home_content ON public.home_content;

DROP POLICY public_select_home_content ON public.home_content;

DROP POLICY admin_delete_newsletter ON public.newsletter_subscribers;

DROP POLICY admin_select_newsletter ON public.newsletter_subscribers;

DROP POLICY public_insert_newsletter ON public.newsletter_subscribers;

DROP POLICY admin_modify_products ON public.products;

DROP POLICY public_select_products ON public.products;

DROP POLICY profiles_select_own_or_admin ON public.profiles;

DROP POLICY profiles_update_own ON public.profiles;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT INSERT, SELECT ON TABLES TO anon;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT INSERT, SELECT ON TABLES TO authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT INSERT, SELECT ON TABLES TO service_role;

CREATE OR REPLACE FUNCTION public.set_updated_at()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$;

ALTER TABLE public.audit_logs
  ALTER COLUMN actor_id SET NOT NULL;

ALTER TABLE public.audit_logs
  ALTER COLUMN changes SET DEFAULT '{}'::jsonb;

ALTER TABLE public.audit_logs
  ALTER COLUMN changes SET NOT NULL;

ALTER TABLE public.audit_logs
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE public.audit_logs
  ALTER COLUMN entity SET NOT NULL;

ALTER TABLE public.categories
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE public.categories
  ALTER COLUMN is_active SET NOT NULL;

ALTER TABLE public.categories
  ALTER COLUMN sort_order SET NOT NULL;

ALTER TABLE public.categories
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.home_content
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE public.home_content
  ALTER COLUMN discounted_product_ids SET DEFAULT ARRAY[]::uuid[];

ALTER TABLE public.home_content
  ALTER COLUMN discounted_product_ids SET NOT NULL;

ALTER TABLE public.home_content
  ALTER COLUMN featured_category_ids SET DEFAULT ARRAY[]::uuid[];

ALTER TABLE public.home_content
  ALTER COLUMN featured_category_ids SET NOT NULL;

ALTER TABLE public.home_content
  ALTER COLUMN featured_product_ids SET DEFAULT ARRAY[]::uuid[];

ALTER TABLE public.home_content
  ALTER COLUMN featured_product_ids SET NOT NULL;

ALTER TABLE public.home_content
  ALTER COLUMN newsletter_enabled SET NOT NULL;

ALTER TABLE public.home_content
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.newsletter_subscribers
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE public.newsletter_subscribers
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.products
  ALTER COLUMN category_id SET NOT NULL;

ALTER TABLE public.products
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE public.products
  ALTER COLUMN is_active SET NOT NULL;

ALTER TABLE public.products
  ALTER COLUMN sku SET NOT NULL;

ALTER TABLE public.products
  ALTER COLUMN stock SET NOT NULL;

ALTER TABLE public.products
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.profiles
  ALTER COLUMN created_at SET NOT NULL;

ALTER TABLE public.profiles
  ALTER COLUMN ROLE SET DEFAULT 'CUSTOMER'::text;

ALTER TABLE public.profiles
  ALTER COLUMN updated_at SET NOT NULL;

ALTER TABLE public.audit_logs
  DISABLE ROW LEVEL SECURITY;

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;

GRANT INSERT, SELECT ON public.audit_logs TO anon;

GRANT INSERT, SELECT ON public.audit_logs TO authenticated;

ALTER TABLE public.categories
  DISABLE ROW LEVEL SECURITY;

ALTER TABLE public.categories
  ADD COLUMN image_url text;

GRANT SELECT ON public.categories TO anon;

GRANT SELECT ON public.categories TO authenticated;

ALTER TABLE public.home_content
  DISABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.home_content TO anon;

GRANT SELECT ON public.home_content TO authenticated;

GRANT SELECT, UPDATE ON public.home_content TO service_role;

ALTER TABLE public.newsletter_subscribers
  DISABLE ROW LEVEL SECURITY;

GRANT INSERT ON public.newsletter_subscribers TO anon;

GRANT INSERT ON public.newsletter_subscribers TO authenticated;

GRANT INSERT ON public.newsletter_subscribers TO service_role;

ALTER TABLE public.products
  DISABLE ROW LEVEL SECURITY;

ALTER TABLE public.products
  ADD CONSTRAINT products_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE RESTRICT;

ALTER TABLE public.products
  ADD COLUMN compare_at_price numeric(10,2);

GRANT DELETE, INSERT, SELECT, UPDATE ON public.products TO anon;

GRANT DELETE, INSERT, SELECT, UPDATE ON public.products TO authenticated;

ALTER TABLE public.profiles
  DISABLE ROW LEVEL SECURITY;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check CHECK (role = ANY (ARRAY['CUSTOMER'::text, 'ADMIN'::text]));

GRANT INSERT, SELECT ON public.profiles TO anon;

GRANT INSERT, SELECT ON public.profiles TO authenticated;

GRANT INSERT, SELECT ON public.profiles TO service_role;
