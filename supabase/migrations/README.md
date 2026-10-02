# Supabase migrations

This folder contains SQL migrations and seed data for the Urban Sport Store Supabase project.

## Source of truth
- `supabase/migrations/` is the canonical SQL source.
- `SUPABASE_INIT.sql` is a legacy snapshot / reference and should not be edited directly.
- `supabase/migrations/*` are the active schema and seed files for validation.
- `20260723_phase3_backend_contract_proposal.sql` is a proposal/documentation file, not an automatically applied migration in the active flow.

## CLI behavior and blockers

Supabase CLI discovers every `.sql` file in `supabase/migrations/`; labels in this README do not prevent execution. Remote migration history was not queried in this audit. The historical `20260727000000_set_admin_raw_app_meta.sql` is retained because moving it without knowing remote history could break reconciliation, but it must not execute. Do not use `supabase db push` until its remote status is verified and the migration is safely excluded or marked consistently without running its contents.

Run `pnpm run supabase:preflight` for a local-only scan. It deliberately fails while the unsafe migration is present or the reconciliation guide is not manually marked complete. See [docs/supabase-migration-inventory.md](../../docs/supabase-migration-inventory.md), [docs/supabase-migration-reconciliation.md](../../docs/supabase-migration-reconciliation.md), and [docs/secret-rotation-runbook.md](../../docs/secret-rotation-runbook.md).

The local authorization changes are `20261002170000_security_profiles_audit.sql`, `20261002170300_profiles_role_bootstrap_hardening.sql`, and `20261002170400_unify_profile_authorization.sql`. `20261002170100_ecommerce_core.sql` and `20261002170200_ecommerce_rls.sql` remain separate, unapproved commerce schema work and are not to be applied as part of the role hardening task.

`supabase/config.toml` loads only `seed.sql` automatically. `seed_phase2_admin_test.sql` is manual/local and can assign ADMIN; never run it in production.

## Legacy / auxiliary SQL
- `SUPABASE_INIT.sql` — legacy schema snapshot / referencia
- `supabase/remote_schema.sql` — generated/auxiliary artifact
- `supabase/generated_schema.sql` — output from local regeneration validation
- `supabase/schema_diff_executed.txt` — auxiliary diff result
- `supabase/migrations/20260727000000_set_admin_raw_app_meta.sql` — histórica con promoción insegura por email; no ejecutar. Se conserva hasta reconciliar el historial remoto.

## Notes and manual steps
- Workspace notes say the remote project contains data and `20261002160428_secure_current_runtime_access` was applied; this was not verified remotely in this audit.
- Remote history includes `20260801201755_remote_schema`, for which this workspace has no matching migration file. There are also duplicate/legacy SQL files. Reconcile this history before `supabase db push` or `supabase migration repair`.
- Local Docker is not running in the current environment, so these changes could not be tested against a local Supabase stack.
- `profiles.id` is the primary key and references `auth.users(id)`.
- Some migrations depend on Supabase Auth and use `auth.users` and `auth.uid()`.
- The trigger `on_auth_user_created` creates a non-privileged `profiles` row. It does not use Auth metadata for role, permissions, or active state.
- The Service Role Key bypasses RLS and should be stored as a secret in deployment (e.g. Vercel Secret `SUPABASE_SERVICE_ROLE_KEY`).
- Do not use `supabase login`, `supabase link`, or `supabase db push` until the migration flow is fully validated locally and the project linkage is confirmed.

Admin promotion is owner-only, manual, and UUID-based; see `../../docs/admin-role-management.md`. Do not promote by email or Auth metadata:

```sql
UPDATE public.profiles SET role = 'ADMIN', is_active = true WHERE id = '<verified-auth-user-uuid>';
```

Do not add an application-side profile insert fallback unless trigger status is verified and the fallback is idempotent and non-privileged.
