BEGIN;

-- Local-only admin test seed.
-- This script must be executed only after the Phase 2 migration exists locally
-- and after a real user has been confirmed in auth.users.
-- It does NOT invent any UUID; it reuses the id of the real auth user.

WITH target_user AS (
  SELECT id
  FROM auth.users
  WHERE email = '<target-admin-email>'
  LIMIT 1
)
INSERT INTO public.profiles (id, role)
SELECT
  tu.id,
  'ADMIN'
FROM target_user tu
ON CONFLICT (id) DO UPDATE SET
  role = 'ADMIN',
  updated_at = now();

COMMIT;
