Playwright E2E tests

Install Playwright and run tests locally:

```bash
pnpm add -D @playwright/test
npx playwright install
pnpm playwright test --project=chromium
```

The tests assume frontend on `http://localhost:5173` and backend on `http://localhost:4000` with seeded admin account.
