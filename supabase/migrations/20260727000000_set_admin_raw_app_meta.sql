-- Migration: set admin role in raw_app_meta_data for known admin user
BEGIN;

UPDATE auth.users
SET raw_app_meta_data = COALESCE(raw_app_meta_data::jsonb, '{}'::jsonb) || '{"role":"ADMIN","isAdmin": true}'::jsonb
WHERE email = 'urbansportstore@outlook.com';

COMMIT;
