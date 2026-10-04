Schema review notes and actions (non-destructive)

Report produced from repository files only. No SQL executed.

Key findings
- Two distinct models coexist in the repo:
  1) `SUPABASE_INIT.sql` — monolithic snapshot, PascalCase identifiers, contains full domain model including orders, payments, variants, etc.
  2) `supabase/migrations/*` — incremental migrations (snake_case, public schema) focused on public catalog, profiles, audit, home_content and progressive alignment.
- There is partial overlap (categories, products, audit/home/newsletter) but inconsistent column names and FK semantics.

Areas that require validation executed (cannot be fully resolved by static analysis):
- Whether `SUPABASE_INIT.sql` was generated from an earlier runs of `migrations/*` or from a different source/tool. (requires validation executed)
- Exact effect of `DO $$ ... $$` blocks that attempt to discover and drop/recreate constraints or triggers (e.g., phase4 FK change). These may succeed or no-op depending on target DB state. (requires validation executed)
- Whether function/triggers names in INIT exist in current DB (set_updated_at vs custom names) and whether triggers are idempotent in the DB. (requires validation executed)
- Real presence of additional tables (Orders, Payments, etc.) in production DB — not inferable from files. (requires validation executed)

Concrete recommended next steps for 4B (preparation):
1. Create an automated regeneration script (local) that:
   - Creates a clean Postgres DB (docker or supabase local),
   - Applies `supabase/migrations/*.sql` in sorted order,
   - Runs `pg_dump -s` to create `supabase/generated_schema.sql`.
   - Compares generated schema with `SUPABASE_INIT.sql` producing `supabase/schema_diff_executed.txt`.
2. Review diffs and produce migration(s) to reconcile gaps in a non-destructive way:
   - For missing tables in migrations but present in INIT: decide if they are required by runtime now; if yes, add migrations to create them in snake_case or map names.
   - For column name differences (camelCase vs snake_case): prefer canonical snake_case; provide non-destructive migrations that add new column names and backpopulate data, then adjust application code to use new names, then deprecate old names in a later safe window.
3. Document the canonical naming convention (snake_case, public schema) and enforce it in PR reviews.
4. Mark `SUPABASE_INIT.sql` as GENERATED: add header and move to `supabase/init_snapshot.sql` (or keep at root but add header). Create regeneration workflow in repo `scripts/`.
5. Run smoke-tests and admin-tests against the migrated local DB to validate runtime contract.

Files created by this analysis (non-destructive):
- `supabase/schema_inventory.txt` — inventory of SQL files and objects
- `supabase/schema_diff.txt` — textual structural diff and representative deltas
- `supabase/schema_review_notes.md` — review notes and action items

If you want, next I can:
- generate the `scripts/regen-init.sh` and `scripts/compare-schemas.sh` (bash + PowerShell variants) and a short README on how to run them locally (requires Docker), but I will not run them here.
- or produce a prioritized list of concrete small migrations (4B) to add to `supabase/migrations/` to reconcile critical differences (non-destructive first).


