# Supabase migrations

This folder contains SQL migrations and seed data for the Urban Sport Store Supabase project.

## Source of truth
- `supabase/migrations/` is the canonical SQL source.
- `SUPABASE_INIT.sql` is a legacy snapshot / reference and should not be edited directly.
- `supabase/migrations/*` are the active schema and seed files for validation.
- `20260723_phase3_backend_contract_proposal.sql` is a proposal/documentation file, not an automatically applied migration in the active flow.

## Active SQL files
- `supabase/migrations/0001_init.sql`
- `supabase/migrations/20260723_phase1_public_catalog.sql`
- `supabase/migrations/20260723_phase2_admin_base.sql`
- `supabase/migrations/20260724_phase4_align_schema.sql`
- `supabase/seed.sql`
- `supabase/seed_phase1_public.sql`
- `supabase/seed_phase2_admin_test.sql`

## Legacy / auxiliary SQL
- `SUPABASE_INIT.sql` — legacy schema snapshot / referencia
- `supabase/remote_schema.sql` — generated/auxiliary artifact
- `supabase/generated_schema.sql` — output from local regeneration validation
- `supabase/schema_diff_executed.txt` — auxiliary diff result

## Notes and manual steps
- `profiles.id` is the primary key and references `auth.users(id)`.
- Some migrations depend on Supabase Auth and use `auth.users` and `auth.uid()`.
- The trigger `trg_auth_user_created` attempts to create a `profiles` row on `auth.users` insert; if your Supabase project blocks triggers on `auth.users`, use an application-side fallback to ensure `profiles` rows exist after signup.
- The Service Role Key bypasses RLS and should be stored as a secret in deployment (e.g. Vercel Secret `SUPABASE_SERVICE_ROLE_KEY`).
- Do not use `supabase login`, `supabase link`, or `supabase db push` until the migration flow is fully validated locally and the project linkage is confirmed.

To promote a user to admin:

```sql
UPDATE public.profiles SET role = 'ADMIN' WHERE id = '<auth-user-uuid>';
```

Example fallback when triggers are not allowed:

```sql
INSERT INTO public.profiles (id, email, full_name, role, created_at, updated_at)
VALUES ('<auth-user-uuid>', '<email>', '<full_name>', 'USER', now(), now())
ON CONFLICT (id) DO NOTHING;
```
