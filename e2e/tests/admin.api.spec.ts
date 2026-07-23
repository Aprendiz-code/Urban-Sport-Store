import { test, expect } from '@playwright/test';

const API_BASE = process.env.E2E_API_BASE ?? 'http://127.0.0.1:4000';
const E2E_SECRET = process.env.E2E_SECRET ?? 'test-secret';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@urbansportstore.dev';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'ChangeMe123!';
const CUSTOMER_EMAIL = process.env.E2E_NON_ADMIN_EMAIL ?? 'customer@urbansportstore.dev';
const CUSTOMER_PASSWORD = process.env.E2E_NON_ADMIN_PASSWORD ?? 'Customer123!';

const getAdminToken = async (request: any) => {
  const tokenRes = await request.post(`${API_BASE}/api/v1/test/token`, { data: { secret: E2E_SECRET } });
  expect(tokenRes.ok()).toBeTruthy();
  const tokenJson = await tokenRes.json();
  return tokenJson?.data?.token ?? tokenJson?.token ?? tokenJson;
};

const getCustomerToken = async (request: any) => {
  const loginRes = await request.post(`${API_BASE}/api/v1/auth/login`, {
    data: { email: CUSTOMER_EMAIL, password: CUSTOMER_PASSWORD },
  });
  expect(loginRes.ok()).toBeTruthy();
  const loginJson = await loginRes.json();
  return loginJson?.data?.token ?? loginJson?.token ?? loginJson;
};

const getInvalidToken = () => 'Bearer invalid.token.value';

test('API: returns 401 for admin products without auth', async ({ request }) => {
  const res = await request.get(`${API_BASE}/api/v1/admin/products`);
  expect(res.status()).toBe(401);
});

test('API: returns 401 for admin products with invalid token', async ({ request }) => {
  const res = await request.get(`${API_BASE}/api/v1/admin/products`, {
    headers: { Authorization: getInvalidToken() },
  });
  expect(res.status()).toBe(401);
});

test('API: returns 403 for authenticated non-admin user', async ({ request }) => {
  const token = await getCustomerToken(request);
  const res = await request.get(`${API_BASE}/api/v1/admin/products`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.status()).toBe(403);
});

test('API: admin can fetch products list', async ({ request }) => {
  const token = await getAdminToken(request);
  const res = await request.get(`${API_BASE}/api/v1/admin/products`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(Array.isArray(json?.data)).toBe(true);
});

test('API: admin can update home content heroTitle', async ({ request }) => {
  const token = await getAdminToken(request);
  const heroTitle = `E2E Hero Title ${Date.now()}`;

  const res = await request.patch(`${API_BASE}/api/v1/admin/home-content`, {
    headers: { Authorization: `Bearer ${token}` },
    data: { heroTitle },
  });

  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  expect(json?.data?.heroTitle ?? json?.heroTitle).toBe(heroTitle);
});
