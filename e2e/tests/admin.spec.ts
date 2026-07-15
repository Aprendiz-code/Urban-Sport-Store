import { test, expect } from '@playwright/test';

test('admin can login and create product (happy path)', async ({ page, baseURL }) => {
  await page.goto(baseURL!);
  // user must seed admin account and have Supabase configured; this is a template test
  await page.click('text=Iniciar sesión');
  await page.fill('input[name="email"]', process.env.E2E_ADMIN_EMAIL ?? 'admin@urbansportstore.dev');
  await page.fill('input[name="password"]', process.env.E2E_ADMIN_PASSWORD ?? 'ChangeMe123!');
  await page.click('button[type="submit"]');
  await page.waitForURL('**/admin');
  await expect(page.locator('text=Productos')).toBeVisible();
  // open products
  await page.click('text=Productos');
  // click new product
  await page.click('text=Nuevo producto');
  await page.fill('input[placeholder="Nombre"]', 'E2E Test Product');
  await page.fill('input[placeholder="Marca"]', 'E2E Brand');
  await page.fill('input[placeholder="Precio"]', '19900');
  await page.fill('input[placeholder="Stock"]', '12');
  await page.click('text=Crear');
  // ensure product appears in list (may require backend running)
  await expect(page.locator('text=E2E Test Product')).toBeVisible({ timeout: 5000 });
});
