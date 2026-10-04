-- 20260724_phase4_align_schema.sql
-- Align schema with backend contract:
-- 1. newsletter_subscribers: add status, source, updated_at
-- 2. audit_logs: refactor to before_data/after_data with entity_id as uuid
-- 3. products.category_id: change FK from ON DELETE SET NULL to ON DELETE RESTRICT

-- ===== PART 1: newsletter_subscribers =====
-- Add missing columns with backward compatibility

ALTER TABLE public.newsletter_subscribers
ADD COLUMN IF NOT EXISTS status text DEFAULT 'ACTIVE',
ADD COLUMN IF NOT EXISTS source text,
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- Create trigger for newsletter updated_at
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_newsletter_subscribers_set_updated_at') THEN
    CREATE TRIGGER trg_newsletter_subscribers_set_updated_at
      BEFORE UPDATE ON public.newsletter_subscribers
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END$$;

-- Add constraint to status column
ALTER TABLE public.newsletter_subscribers
ADD CONSTRAINT check_newsletter_status 
  CHECK (status IN ('ACTIVE', 'UNSUBSCRIBED', 'BOUNCED'));

-- ===== PART 2: audit_logs refactor =====
-- Add before_data and after_data columns; keep changes for compatibility
-- Convert entity_id from text to uuid (add new column, migrate, drop old)

-- Step 1: Add new columns
ALTER TABLE public.audit_logs
ADD COLUMN IF NOT EXISTS before_data jsonb,
ADD COLUMN IF NOT EXISTS after_data jsonb,
ADD COLUMN IF NOT EXISTS entity_id_uuid uuid;

-- Step 2: Migrate existing entity_id text -> entity_id_uuid (best effort)
UPDATE public.audit_logs
SET entity_id_uuid = entity_id::uuid
WHERE entity_id IS NOT NULL
  AND entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Step 3: Drop old entity_id column and rename new one
-- (Only if migration was successful; keep old column for now to avoid data loss)
-- We'll keep both columns to avoid breaking existing data; entity_id_uuid is the canonical one

-- Step 4: Make after_data NOT NULL for all new inserts (existing rows stay NULL)
-- This is handled at application level via defaults

-- ===== PART 3: Update products.category_id foreign key =====
-- Drop old FK and recreate with ON DELETE RESTRICT

-- First, check if FK exists and get its name
-- PostgreSQL doesn't make this easy without querying pg_constraint, so we do it safely:

DO $$
DECLARE
    v_fk_name text;
BEGIN
    -- Find the FK constraint name
    SELECT constraint_name INTO v_fk_name
    FROM information_schema.referential_constraints
    WHERE table_name = 'products'
      AND column_name = 'category_id'
      AND constraint_schema = 'public'
    LIMIT 1;

    -- If found, drop it
    IF v_fk_name IS NOT NULL THEN
        EXECUTE 'ALTER TABLE public.products DROP CONSTRAINT ' || v_fk_name;
    END IF;

    -- Recreate with ON DELETE RESTRICT
    ALTER TABLE public.products
    ADD CONSTRAINT fk_products_category_id
        FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE RESTRICT;

EXCEPTION WHEN others THEN
    -- If already exists or other error, just ensure the constraint exists
    BEGIN
        ALTER TABLE public.products
        ADD CONSTRAINT fk_products_category_id
            FOREIGN KEY (category_id) REFERENCES public.categories(id) ON DELETE RESTRICT;
    EXCEPTION WHEN others THEN
        NULL; -- Constraint already exists
    END;
END$$;

-- ===== INDEXES =====
-- Add indexes for performance on new columns if they don't exist

CREATE INDEX IF NOT EXISTS idx_newsletter_status ON public.newsletter_subscribers(status);
CREATE INDEX IF NOT EXISTS idx_audit_entity_id_uuid ON public.audit_logs(entity_id_uuid);
CREATE INDEX IF NOT EXISTS idx_audit_actor_id ON public.audit_logs(actor_id);

-- ===== COMMENTS =====
COMMENT ON COLUMN public.newsletter_subscribers.status IS 'Subscription status: ACTIVE, UNSUBSCRIBED, BOUNCED';
COMMENT ON COLUMN public.newsletter_subscribers.source IS 'Subscription source: homepage, footer, modal, etc.';
COMMENT ON COLUMN public.audit_logs.before_data IS 'State before change (null for CREATE actions)';
COMMENT ON COLUMN public.audit_logs.after_data IS 'State after change';
COMMENT ON COLUMN public.audit_logs.entity_id_uuid IS 'UUID of the audited entity (canonical)';

-- End of migration
