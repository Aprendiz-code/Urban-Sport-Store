import { test, expect } from '@playwright/test';

const configuredApiBase = process.env.E2E_API_BASE ?? 'http://127.0.0.1:3000/api';
const API_BASE = /\/api\/?$/i.test(configuredApiBase)
  ? configuredApiBase.replace(/\/$/, '')
  : `${configuredApiBase.replace(/\/$/, '')}/api`;
const ADMIN_ACCESS_TOKEN = process.env.E2E_ADMIN_ACCESS_TOKEN ?? '';
const NON_ADMIN_ACCESS_TOKEN = process.env.E2E_NON_ADMIN_ACCESS_TOKEN ?? '';
const E2E_SUPABASE_REF = process.env.E2E_SUPABASE_REF ?? '';
const isLocalApi = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/api$/i.test(API_BASE);
const isDedicatedE2EProject = Boolean(E2E_SUPABASE_REF) && E2E_SUPABASE_REF !== 'geapxdyyfmygqrqfnier';

function requireLocalApi() {
  test.skip(!isLocalApi, 'Admin API E2E tests are restricted to local environments.');
}

test('API: returns 401 for admin products without auth', async ({ request }) => {
  requireLocalApi();
  const response = await request.get(`${API_BASE}/admin/products`);
  expect(response.status()).toBe(401);
});

test('API: returns 401 for admin products with an invalid token', async ({ request }) => {
  requireLocalApi();
  const response = await request.get(`${API_BASE}/admin/products`, {
    headers: { Authorization: 'Bearer invalid.token.value' },
  });
  expect(response.status()).toBe(401);
});

test('API: returns 403 for an authenticated non-admin profile', async ({ request }) => {
  requireLocalApi();
  test.skip(!isDedicatedE2EProject, 'Requires a dedicated non-production E2E Supabase project.');
  test.skip(!NON_ADMIN_ACCESS_TOKEN, 'Requires a dedicated non-admin local Supabase access token.');
  const response = await request.get(`${API_BASE}/admin/products`, {
    headers: { Authorization: `Bearer ${NON_ADMIN_ACCESS_TOKEN}` },
  });
  expect(response.status()).toBe(403);
});

test('API: an admin can read the products list', async ({ request }) => {
  requireLocalApi();
  test.skip(!isDedicatedE2EProject, 'Requires a dedicated non-production E2E Supabase project.');
  test.skip(!ADMIN_ACCESS_TOKEN, 'Requires a dedicated local E2E admin Supabase access token.');
  const response = await request.get(`${API_BASE}/admin/products`, {
    headers: { Authorization: `Bearer ${ADMIN_ACCESS_TOKEN}` },
  });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(Array.isArray(payload?.data)).toBe(true);
});

test('API: an admin can read home content', async ({ request }) => {
  requireLocalApi();
  test.skip(!isDedicatedE2EProject, 'Requires a dedicated non-production E2E Supabase project.');
  test.skip(!ADMIN_ACCESS_TOKEN, 'Requires a dedicated local E2E admin Supabase access token.');
  const response = await request.get(`${API_BASE}/admin/home-content`, {
    headers: { Authorization: `Bearer ${ADMIN_ACCESS_TOKEN}` },
  });
  expect(response.ok()).toBeTruthy();
  const payload = await response.json();
  expect(payload?.data).toBeTruthy();
});
