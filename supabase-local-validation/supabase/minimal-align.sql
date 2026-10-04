ALTER TABLE public.newsletter_subscribers
  ADD COLUMN IF NOT EXISTS status text DEFAULT 'ACTIVE';
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'check_newsletter_status'
      AND conrelid = 'public.newsletter_subscribers'::regclass
  ) THEN
    ALTER TABLE public.newsletter_subscribers
      ADD CONSTRAINT check_newsletter_status
        CHECK (status IN ('ACTIVE','UNSUBSCRIBED','BOUNCED'));
  END IF;
END
$$;
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS before_data jsonb;
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS after_data jsonb;
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS entity_id_uuid uuid;
UPDATE public.audit_logs
SET entity_id_uuid = entity_id
WHERE entity_id_uuid IS NULL
  AND entity_id IS NOT NULL;