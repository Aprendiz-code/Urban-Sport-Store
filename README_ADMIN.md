# Admin Setup — Urban Sport Store

This document explains how to configure and run the admin features (login, product CRUD, inventory, audit) locally.

## Required environment variables

Frontend (`.env.local` at project root or Vite env):

- VITE_SUPABASE_URL=https://your-supabase-project.supabase.co
- VITE_SUPABASE_ANON_KEY=public-anon-key
- VITE_SUPABASE_STORAGE_BUCKET=products
- VITE_API_URL=http://localhost:4000/api/v1
- VITE_ADMIN_EMAIL=admin@urbansportstore.dev

Backend (`api/.env`):

- PORT=4000
- DATABASE_URL=postgresql://user:pass@localhost:5432/urbansport
- JWT_SECRET=change_this_dev_secret
- SUPABASE_URL=https://your-supabase-project.supabase.co
- SEED_ADMIN_EMAIL=admin@urbansportstore.dev
- SEED_ADMIN_PASSWORD=ChangeMe123!
- CORS_ORIGINS=http://localhost:5173

Notes:
- The backend uses `SUPABASE_URL` to validate a Supabase access token and exchange it for a backend JWT via `POST /api/v1/auth/bridge`.
- The frontend uses `VITE_API_URL` to call `/admin` endpoints and `VITE_SUPABASE_*` to perform auth and upload product images.

## Run locally (quick)

1. Start backend (inside `api/`):

```pwsh
cd api
pnpm install
# ensure DATABASE_URL is working and run prisma migrations if needed
# if you don't have a DB, update DATABASE_URL to a local Postgres or use SQLite with a quick change
pnpm dev # or npm run dev (depends on your setup)
```

2. Start frontend (root):

```pwsh
pnpm install
pnpm dev
```

3. Seed admin (if not already seeded):

- Backend repo contains seed logic (see `api/prisma/seed.ts`). Update `.env` with SEED_ADMIN_EMAIL/PASSWORD and run the seed script or start the backend which may auto-seed depending on project setup.

## How admin login works (overview)

- The frontend authenticates users using Supabase Auth.
- When the frontend calls admin endpoints it sends the Supabase access token in `Authorization: Bearer <supabase_token>` header.
- The backend exposes `POST /api/v1/auth/bridge` which validates the Supabase token (`GET {SUPABASE_URL}/auth/v1/user`) and if the user exists in the backend it issues a backend JWT (signed with `JWT_SECRET`).
- The frontend client (`src/lib/admin-api.ts`) will attempt admin calls using a cached backend JWT (stored in `localStorage`) and will call the bridge endpoint to exchange the Supabase token if necessary.

## Testing admin flows manually

1. Register or sign in with Supabase (use `VITE_ADMIN_EMAIL` for quick admin check).
2. Open Admin dashboard in the app and create a product with the form: the image field accepts a file (uploads to Supabase Storage) or a public URL.
3. The frontend will call the admin API; if bridge is required it will exchange the Supabase token and retry the request.
4. Audit logs: the backend records create/update/delete/inventory actions in the `AuditLog` Prisma model; the Admin UI shows server logs or local `localStorage` fallback.

## E2E tests (without Supabase)

I added a small helper endpoint in the backend to support CI/local E2E runs without depending on Supabase auth. Set `E2E_SECRET` in `api/.env` to a secret string and run the seed so an admin user exists.

1. Add to `api/.env`:

```pwsh
E2E_SECRET=your-local-secret
```

2. Run backend and frontend locally, then run Playwright tests:

```pwsh
# from repo root
npx playwright install
E2E_API_BASE=http://localhost:4000 E2E_SECRET=your-local-secret pnpm e2e
```

The tests will call `POST /api/v1/test/token` with the secret to get a backend JWT, then create a category, brand and product via the admin API.

## Security & deployment notes

- Use strong random `JWT_SECRET` in production and rotate keys periodically.
- Configure `CORS_ORIGINS` in the backend to only allow your frontend domains in production.
- Add rate-limiting and monitoring for the `/auth/bridge` endpoint to avoid token abuse.
- Ensure secure cookies (`SECURE_COOKIES=true`) and HTTPS in production.

## Next steps you may want me to implement

- Full end-to-end tests (Playwright) for admin flows (login, create product, upload image).
- Real-time inventory (Supabase Realtime or socket server) to sync stock across sessions.
- Backend migration and CI setup for Prisma migrations and seed.

If you want, I can run the next step now: (A) run an end-to-end test script (requires you start both servers), or (B) implement Playwright tests and CI configuration.
