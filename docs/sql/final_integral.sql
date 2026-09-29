-- final_integral.sql (versioned copy)
-- Non-destructive, idempotent SQL to complete checklist items and align schema

-- 1) Ensure newsletter_subscribers has updated_at column (non-destructive)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='newsletter_subscribers') THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='newsletter_subscribers' AND column_name='updated_at'
    ) THEN
      ALTER TABLE public.newsletter_subscribers
        ADD COLUMN updated_at timestamptz DEFAULT now();
      UPDATE public.newsletter_subscribers SET updated_at = created_at WHERE updated_at IS NULL;
    END IF;
  END IF;
END$$;

-- 2) Create a safe admin helper function to insert audit logs (requires caller be an ADMIN profile)
CREATE OR REPLACE FUNCTION public.admin_insert_audit(
  p_actor_id uuid,
  p_action text,
  p_entity text,
  p_entity_id text,
  p_changes jsonb
)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE
  new_id uuid := gen_random_uuid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid()::uuid AND p.role = 'ADMIN') THEN
    RAISE EXCEPTION 'permission denied: caller is not admin';
  END IF;
  INSERT INTO public.audit_logs (id, actor_id, action, entity, entity_id, changes, created_at)
  VALUES (new_id, p_actor_id, p_action, p_entity, p_entity_id, p_changes, now());
  RETURN new_id;
END;
$$;

-- 3) Note about storage bucket: project uses bucket 'product-images' according to docs/supabase-rules.sql.
-- If you require a bucket named 'products', create it in the Supabase UI or with the CLI; storage internal schema varies by platform.

-- End of final_integral.sql (versioned)
