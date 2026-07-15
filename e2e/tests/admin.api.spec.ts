import { test, expect } from '@playwright/test';

const API_BASE = process.env.E2E_API_BASE ?? 'http://localhost:4000';
const E2E_SECRET = process.env.E2E_SECRET ?? 'test-secret';

test('E2E: create category, brand and product using test token', async ({ request }) => {
  // obtain test token
  const tokenRes = await request.post(`${API_BASE}/api/v1/test/token`, { data: { secret: E2E_SECRET } });
  expect(tokenRes.ok()).toBeTruthy();
  const tokenJson = await tokenRes.json();
  const token = tokenJson?.data?.token ?? tokenJson?.token ?? tokenJson;

  // create category
  const category = { name: 'E2E Category', slug: `e2e-category-${Date.now()}` };
  const brand = { name: 'E2E Brand', slug: `e2e-brand-${Date.now()}` };

  const catRes = await request.post(`${API_BASE}/api/v1/admin/categories`, {
    headers: { Authorization: `Bearer ${token}` },
    data: category,
  });
  expect(catRes.status()).toBe(201);
  const catJson = await catRes.json();
  const categoryId = catJson.data?.id ?? catJson.id;

  const brandRes = await request.post(`${API_BASE}/api/v1/admin/brands`, {
    headers: { Authorization: `Bearer ${token}` },
    data: brand,
  });
  expect(brandRes.status()).toBe(201);
  const brandJson = await brandRes.json();
  const brandId = brandJson.data?.id ?? brandJson.id;

  // create product
  const product = {
    name: 'E2E API Product',
    slug: `e2e-api-product-${Date.now()}`,
    sku: `E2E-SKU-${Date.now()}`,
    price: 19.99,
    stock: 5,
    categoryId,
    brandId,
  };

  const prodRes = await request.post(`${API_BASE}/api/v1/admin/products`, {
    headers: { Authorization: `Bearer ${token}` },
    data: product,
  });

  expect(prodRes.status()).toBe(201);
  const prodJson = await prodRes.json();
  expect(prodJson.data?.name ?? prodJson.name).toBeTruthy();
});
