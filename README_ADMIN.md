# Admin Setup — Urban Sport Store

This document explains how to configure and run the admin features (login, product CRUD, inventory, audit) locally.

## Required environment variables

Frontend (`.env.local` at project root or Vite env):

- VITE_SUPABASE_URL=https://your-supabase-project.supabase.co
- VITE_SUPABASE_ANON_KEY=public-anon-key
- VITE_SUPABASE_STORAGE_BUCKET=product-images
- VITE_API_URL=http://localhost:3000/api

Backend (`api/.env`):

- SUPABASE_URL=https://your-supabase-project.supabase.co
- SUPABASE_ANON_KEY=public-anon-key
- SUPABASE_SERVICE_ROLE_KEY=service-role-key
- NODE_ENV=development

Notes:
- The current active contract uses `/api/*` for public API calls and `/api/admin/*` for admin routes.
- The backend validates the Supabase access token and checks the authenticated user against the admin claims already configured in Supabase.
- The frontend uses `VITE_API_URL` to reach `/admin` endpoints and `VITE_SUPABASE_*` to perform auth and upload product images.
- The `api/src/*` directory exists as legacy backend code and is not the deployed production runtime currently.

## Run locally (quick)

1. Start the current serverless API runtime (inside `api/`):

```pwsh
cd api
pnpm install
# configure the Supabase environment variables in api/.env.local
pnpm build
```

> Nota: El runtime actual requiere Supabase Auth y un usuario admin con claims válidos para acceder a los endpoints de administración.

2. Start frontend (root):

```pwsh
pnpm install
pnpm dev
```

3. Seed admin (if not already seeded):

- The current runtime uses the Supabase SQL seed files under `supabase/` as the source of truth. Apply the relevant migrations and seed scripts to your target project before testing admin flows.

## How admin login works (overview)

- The frontend authenticates users using Supabase Auth.
- When the frontend calls admin endpoints it sends the Supabase access token in the `Authorization: Bearer <supabase_token>` header.
- The backend validates that token against Supabase and checks the connected admin claims before allowing the request.
- The frontend client in `src/lib/admin-api.ts` calls the current serverless `/api/admin/*` endpoints directly; older bridge-style flows remain legacy and are not part of the active runtime.

## Testing admin flows manually

1. Register or sign in with Supabase.
2. Open Admin dashboard in the app and create a product with the form: the image field accepts a file (uploads to Supabase Storage) or a public URL.
3. The frontend will call the admin API directly using the Supabase access token in the `Authorization` header.
4. Audit logs: the backend writes the relevant admin actions into the current Supabase-backed tables; the Admin UI shows server logs or local `localStorage` fallback.

## E2E tests (without Supabase)

> Note: The current runtime does not include a dedicated `/api/test/token` helper endpoint in this branch.
> If you want a local test helper for admin API access, implement it explicitly or use a real Supabase admin account.

## Security & deployment notes

- Keep the Supabase service-role and anon keys in secure environment variables and rotate them periodically.
- Restrict the allowed frontend origins in your deployment configuration to the real production domain.
- Monitor the `/api/admin/*` endpoints and review admin access logs regularly.
- Ensure HTTPS is enforced in production and that the Supabase auth configuration is aligned with your admin claims.

## Next steps you may want me to implement

- Full end-to-end tests (Playwright) for admin flows (login, create product, upload image).
- Real-time inventory (Supabase Realtime or socket server) to sync stock across sessions.
- Supabase migration and CI setup for the current SQL-backed runtime.

If you want, I can run the next step now: (A) run an end-to-end test script (requires you start both servers), or (B) implement Playwright tests and CI configuration.
