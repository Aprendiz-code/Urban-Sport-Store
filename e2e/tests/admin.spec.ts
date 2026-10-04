import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? '';

test('admin end-to-end: login, products CRUD, homepage heroTitle update and audit logs', async ({ page, baseURL }) => {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'Requires dedicated E2E admin credentials.');
  const productName = `E2E Product ${Date.now()}`;
  const updatedProductName = `${productName} (edited)`;
  const productSku = `E2E-SKU-${Date.now()}`;
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
  await page.getByLabel('Marca *').fill('E2E Brand');
  await page.getByLabel('Precio *').fill('19900');
  await page.getByLabel('Stock *').fill('15');
  await page.getByLabel('SKU *').fill(productSku);
  await expect(page.getByPlaceholder(/Pega una URL pública|URL pública/)).toHaveCount(0);
  const categorySelect = page.getByLabel('Categoría');
  const categoryId = await categorySelect.locator('option:not([disabled])').first().getAttribute('value');
  test.skip(!categoryId, 'Requires an active product category.');
  await categorySelect.selectOption(categoryId!);
  await page.getByLabel('Selecciona una imagen').setInputFiles({
    name: 'product.png',
    mimeType: 'image/png',
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  });
  await expect(page.getByText('Imagen cargada exitosamente')).toBeVisible({ timeout: 15000 });
  await page.getByLabel('Selecciona múltiples imágenes').setInputFiles([
    { name: 'gallery-1.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
    { name: 'gallery-2.png', mimeType: 'image/png', buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  ]);
  await expect(page.getByText('2 imagen(es) en galería')).toBeVisible({ timeout: 15000 });

  await page.click('button:has-text("✅ Crear producto")');
  const productRow = page.locator('tr', { hasText: productName });
  await expect(productRow).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Producto creado y guardado correctamente.')).toBeVisible();
  await expect(page.getByLabel('Cerrar formulario')).toHaveCount(0);

  const productsUrl = page.url();
  const productSearch = page.getByRole('searchbox', { name: 'Buscar productos por nombre, marca o SKU' });
  await productSearch.fill(productName);
  await expect(productRow).toBeVisible();
  await expect(productSearch).toBeFocused();
  await expect(page).toHaveURL(productsUrl);
  await productSearch.fill('E2E Brand');
  await expect(productRow).toBeVisible();
  await expect(page).toHaveURL(productsUrl);
  await productSearch.fill(productSku);
  await expect(productRow).toBeVisible();
  await expect(page).toHaveURL(productsUrl);
  await productSearch.fill('');

  await productRow.locator('button:has-text("Editar")').click();
  await expect(page.getByPlaceholder(/Pega una URL pública|URL pública/)).toHaveCount(0);
  await page.getByLabel('Nombre *').fill(updatedProductName);
  await page.click('button:has-text("💾 Guardar cambios")');
  await expect(page.locator('tr', { hasText: updatedProductName })).toBeVisible({ timeout: 15000 });

  await page.reload();
  await expect(page.locator('tr', { hasText: updatedProductName })).toBeVisible({ timeout: 15000 });

  page.once('dialog', (dialog) => dialog.accept());
  await page.locator('tr', { hasText: updatedProductName }).locator('button:has-text("Archivar")').click();
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
