Playwright E2E tests

Install Playwright and run tests locally:

```bash
pnpm add -D @playwright/test
npx playwright install
pnpm playwright test --project=chromium
```

The tests assume the frontend at `http://localhost:5173` and the API at `http://127.0.0.1:3000/api`.

Admin UI E2E tests create and archive test products, so they require localhost, dedicated `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD` credentials, `E2E_ALLOW_WRITES=true`, and an `E2E_SUPABASE_REF` different from production. Never set `E2E_BASE_URL` to production.

Read-only admin API E2E tests use `E2E_ADMIN_ACCESS_TOKEN`, `E2E_NON_ADMIN_ACCESS_TOKEN`, and `E2E_SUPABASE_REF` from a dedicated local test project. They use `/api/admin/*`, make no write requests, and skip if the API base is not localhost or the Supabase ref is production. Do not use production access tokens.
