import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@urbansportstore.dev';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'ChangeMe123!';

test('admin end-to-end: login, products CRUD, homepage heroTitle update and audit logs', async ({ page, baseURL }) => {
  const productName = `E2E Product ${Date.now()}`;
  const updatedProductName = `${productName} (edited)`;
  const heroTitle = `E2E Home Hero ${Date.now()}`;

  await page.goto(baseURL!);
  await page.click('button:has-text("Iniciar sesión")');
  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');

  await expect(page.locator('button:has-text("Productos")')).toBeVisible({ timeout: 15000 });

  await page.click('button:has-text("Productos")');
  await page.click('button:has-text("Nuevo producto")');

  await page.getByLabel('Nombre *').fill(productName);
  await page.getByLabel('Marca').fill('E2E Brand');
  await page.getByLabel('Precio *').fill('19900');
  await page.getByLabel('Stock *').fill('15');
  await page.getByLabel('SKU *').fill(`E2E-SKU-${Date.now()}`);
  await page.getByLabel('Categoría').selectOption('Zapatos');
  await page.getByPlaceholder('Pega una URL pública (ej: https://example.com/image.jpg)').fill('https://example.com/image.jpg');

  await page.click('button:has-text("✅ Crear producto")');
  const productRow = page.locator('tr', { hasText: productName });
  await expect(productRow).toBeVisible({ timeout: 15000 });

  await productRow.locator('button:has-text("Editar")').click();
  await page.getByLabel('Nombre *').fill(updatedProductName);
  await page.click('button:has-text("💾 Guardar cambios")');
  await expect(page.locator('tr', { hasText: updatedProductName })).toBeVisible({ timeout: 15000 });

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('tr', { hasText: updatedProductName }).locator('button:has-text("Eliminar")').click();
  await expect(page.locator('tr', { hasText: updatedProductName })).toHaveCount(0, { timeout: 15000 });

  await page.click('button:has-text("Página principal")');
  await expect(page.getByLabel('Título hero')).toBeVisible({ timeout: 15000 });
  await page.getByLabel('Título hero').fill(heroTitle);
  await page.click('button:has-text("Guardar contenido")');
  await expect(page.getByLabel('Título hero')).toHaveValue(heroTitle, { timeout: 15000 });

  await page.click('button:has-text("Actividad")');
  await page.click('button:has-text("Actualizar")');
  await expect(page.locator('text=update_home_content')).toBeVisible({ timeout: 15000 });
});
