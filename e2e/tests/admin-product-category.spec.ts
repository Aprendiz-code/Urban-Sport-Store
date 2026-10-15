import { expect, test, type Page, type Route } from '@playwright/test';

const appOrigin = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';
const apiOrigin = 'http://127.0.0.1:3000';
const supabaseOrigin = 'https://category-e2e.supabase.test';
const expectedStaticHosts = new Set(['fonts.googleapis.com', 'images.unsplash.com']);
const userId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const productId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const categories = [
  { id: '10000000-0000-4000-8000-000000000001', name: 'Tenis Hombre', slug: 'tenis-hombre', is_active: true },
  { id: '10000000-0000-4000-8000-000000000002', name: 'Tenis Mujer', slug: 'tenis-mujer', is_active: true },
  { id: '10000000-0000-4000-8000-000000000003', name: 'Ropa Hombre', slug: 'ropa-hombre', is_active: true },
  { id: '10000000-0000-4000-8000-000000000004', name: 'Ropa Mujer', slug: 'ropa-mujer', is_active: true },
  { id: '10000000-0000-4000-8000-000000000005', name: 'Perfumes', slug: 'perfumes', is_active: true },
  { id: '10000000-0000-4000-8000-000000000006', name: 'Relojes', slug: 'relojes', is_active: true },
  { id: '10000000-0000-4000-8000-000000000007', name: 'Gafas', slug: 'gafas', is_active: true },
] as const;

type MockOptions = { role?: string; categoriesFailOnce?: boolean; listFailOnce?: boolean; patchFailOnce?: boolean };

function productRecord() {
  return {
    id: productId,
    slug: 'producto-e2e',
    name: 'Producto E2E',
    brand: 'Marca E2E',
    description: 'Producto sintético de test.',
    price: 120000,
    stock: 4,
    sku: 'E2E-CATEGORY-1',
    category_id: categories[0].id,
    main_image: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
    images: [],
    sizes: [],
    specifications: [],
    is_active: true,
    created_at: '2026-10-01T12:00:00.000Z',
  };
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
}

async function installMocks(page: Page, options: MockOptions = {}) {
  const product = productRecord();
  const patchBodies: Array<Record<string, unknown>> = [];
  const unexpectedRequests: string[] = [];
  let categoryAttempts = 0;
  let listAttempts = 0;
  let patchAttempts = 0;
  let createPayload: Record<string, unknown> | null = null;

  await page.addInitScript(({ storageKey, session }) => {
    window.localStorage.setItem(storageKey, JSON.stringify(session));
  }, {
    storageKey: 'sb-category-e2e-auth-token',
    session: {
      access_token: 'e2e-admin-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'e2e-refresh-token',
      user: { id: userId, email: 'category-e2e@example.test', app_metadata: { provider: 'email' }, user_metadata: {} },
    },
  });

  await page.route('**/*', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;

    if (url.origin === supabaseOrigin) {
      if (path.startsWith('/storage/v1/object/public/products/')) {
        return route.fulfill({
          status: 200,
          contentType: 'image/png',
          body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6V8AAAAASUVORK5CYII=', 'base64'),
        });
      }
      if (path === '/auth/v1/user') {
        return fulfillJson(route, { id: userId, email: 'category-e2e@example.test', app_metadata: { provider: 'email' }, user_metadata: {} });
      }
      if (path === '/rest/v1/profiles') {
        return fulfillJson(route, { id: userId, role: options.role ?? 'ADMIN', is_active: true });
      }
      unexpectedRequests.push(`${request.method()} ${path}`);
      return route.abort();
    }

    if (url.origin !== appOrigin && url.origin !== apiOrigin) {
      if (expectedStaticHosts.has(url.hostname)) return route.abort();
      unexpectedRequests.push(`${request.method()} ${url.origin}${path}`);
      return route.abort();
    }
    if (path === '/api/home' && request.method() === 'GET') return fulfillJson(route, { data: {} });
    if (path === '/api/categories' && request.method() === 'GET') {
      return fulfillJson(route, { data: categories });
    }
    if (path === '/api/admin/categories' && request.method() === 'GET') {
      categoryAttempts += 1;
      if (options.categoriesFailOnce && categoryAttempts === 1) {
        return fulfillJson(route, { error: { message: 'Fallo temporal de categorías.' } }, 500);
      }
      return fulfillJson(route, { data: categories });
    }
    if (path === '/api/products' && request.method() === 'GET') return fulfillJson(route, { data: [product] });
    if (path === '/api/admin/products' && request.method() === 'GET') {
      listAttempts += 1;
      if (options.listFailOnce && listAttempts === 1) return fulfillJson(route, { error: { message: 'Fallo temporal de listado.' } }, 500);
      return fulfillJson(route, { data: [product] });
    }
    if (path === '/api/admin/dashboard' && request.method() === 'GET') {
      return fulfillJson(route, { data: {
        orders: { status: 'empty', total: 0, recent: [] },
        customers: { status: 'empty', total: 0 },
        sales: { status: 'empty', paid_orders: 0, total_7d: 0, period_start: null, period_end: null },
        category_sales_status: 'empty',
      } });
    }
    if (path === '/api/admin/audit' && request.method() === 'GET') return fulfillJson(route, { data: [] });
    if (path === '/api/admin/product-images' && request.method() === 'POST') {
      return fulfillJson(route, { data: { path: 'products/category-e2e.png' } });
    }
    if (path === '/api/admin/products' && request.method() === 'POST') {
      createPayload = request.postDataJSON() as Record<string, unknown>;
      return fulfillJson(route, { data: { ...product, ...createPayload, id: productId } }, 201);
    }
    if (path === `/api/admin/products/${productId}` && request.method() === 'PATCH') {
      const body = request.postDataJSON() as Record<string, unknown>;
      patchBodies.push(body);
      patchAttempts += 1;
      if (options.patchFailOnce && patchAttempts === 1) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        return fulfillJson(route, { error: { code: 'E2E_REJECTED', message: 'Fallo temporal al guardar.' } }, 400);
      }
      if (typeof body.category_id === 'string') product.category_id = body.category_id;
      return fulfillJson(route, { data: product });
    }
    if (path.startsWith('/api/')) {
      unexpectedRequests.push(`${request.method()} ${path}`);
      return fulfillJson(route, { error: { message: 'Ruta local inesperada.' } }, 500);
    }
    return route.continue();
  });

  return {
    patchBodies,
    unexpectedRequests,
    getCategoryAttempts: () => categoryAttempts,
    getListAttempts: () => listAttempts,
    getCreatePayload: () => createPayload,
  };
}

async function openProducts(page: Page) {
  await page.goto('/admin?adminSection=products');
  await expect(page.locator('.admin-page-header h1')).toHaveText('Productos');
}

async function openProductActions(page: Page) {
  const row = page.getByRole('row', { name: /Producto E2E/ });
  await expect(row).toBeVisible();
  await row.locator('summary[aria-label^="Acciones para"]').click();
  return row;
}

test.describe('admin product categories with local mocks', () => {
  test.beforeEach(async ({ page, baseURL }) => {
    test.skip(!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(baseURL ?? ''), 'E2E restringido a localhost.');
  });

  test('the admin list reports an error and retries to show active and inactive products', async ({ page }) => {
    const mocks = await installMocks(page, { listFailOnce: true });
    await openProducts(page);
    await expect(page.getByRole('alert')).toContainText('No fue posible cargar los productos.');
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await expect(page.getByRole('row', { name: /Producto E2E/ })).toBeVisible();
    expect(mocks.getListAttempts()).toBeGreaterThanOrEqual(2);
  });

  test('new product requires a category and sends category_id to the API', async ({ page }) => {
    const mocks = await installMocks(page);
    await openProducts(page);
    await page.getByRole('button', { name: 'Nuevo producto', exact: true }).click();

    const categorySelect = page.locator('#admin-product-category');
    await expect(categorySelect).toHaveAttribute('required', '');
    await expect(categorySelect).toHaveValue('');
    await expect(categorySelect.locator('option')).toHaveText([
      'Selecciona una categoría', 'Tenis Hombre', 'Tenis Mujer', 'Ropa Hombre',
      'Ropa Mujer', 'Perfumes', 'Relojes', 'Gafas',
    ]);
    await categorySelect.selectOption(categories[4].id);
    await expect(page.getByText('Se mostrará en: Perfumes')).toBeVisible();
    await page.locator('#admin-product-name').fill('Perfume E2E');
    await page.locator('#admin-product-brand').fill('Marca E2E');
    await page.locator('#admin-product-price').fill('120000');
    await page.locator('#admin-product-stock').fill('4');
    await page.locator('#admin-product-sku').fill('E2E-PERFUME-1');
    await page.locator('input[aria-label="Seleccionar imágenes del producto"]').setInputFiles({
      name: 'perfume.png', mimeType: 'image/png', buffer: Buffer.from('synthetic image fixture'),
    });
    await page.getByRole('button', { name: 'Crear producto', exact: true }).click();

    await expect(page.getByRole('dialog', { name: 'Crear producto' })).not.toBeVisible();
    expect(mocks.getCreatePayload()).toMatchObject({ category_id: categories[4].id, name: 'Perfume E2E' });
    expect(mocks.unexpectedRequests).toEqual([]);
  });

  test('edit preselects the current category and category reassignment sends only category_id', async ({ page }) => {
    const mocks = await installMocks(page);
    await openProducts(page);
    const row = await openProductActions(page);
    await row.getByRole('button', { name: 'Editar', exact: true }).click();
    await expect(page.locator('#admin-product-category')).toHaveValue(categories[0].id);
    await page.getByRole('button', { name: 'Cerrar formulario de producto' }).click();

    await row.locator('summary[aria-label^="Acciones para"]').click();
    await row.getByRole('button', { name: 'Cambiar categoría' }).click();
    const dialog = page.getByRole('dialog', { name: 'Cambiar categoría' });
    await expect(dialog.getByLabel('Nueva categoría')).toHaveValue(categories[0].id);
    await dialog.getByLabel('Nueva categoría').selectOption(categories[1].id);
    await dialog.getByRole('button', { name: 'Guardar categoría' }).click();

    await expect(dialog).not.toBeVisible();
    await expect(row).toContainText('Tenis Mujer');
    await expect(row.locator('summary')).toBeFocused();
    expect(mocks.patchBodies).toEqual([{ category_id: categories[1].id }]);
    expect(mocks.unexpectedRequests).toEqual([]);
  });

  test('category load failure is retryable from the form', async ({ page }) => {
    const mocks = await installMocks(page, { categoriesFailOnce: true });
    await openProducts(page);
    await page.getByRole('button', { name: 'Nuevo producto', exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Fallo temporal de categorías.');
    await expect(page.locator('#admin-product-category')).toBeDisabled();
    await page.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await expect(page.locator('#admin-product-category')).toBeEnabled();
    expect(mocks.getCategoryAttempts()).toBeGreaterThanOrEqual(2);
  });

  test('failed category update preserves the selection and ignores a double click', async ({ page }) => {
    const mocks = await installMocks(page, { patchFailOnce: true });
    await openProducts(page);
    const row = await openProductActions(page);
    await row.getByRole('button', { name: 'Cambiar categoría' }).click();
    const dialog = page.getByRole('dialog', { name: 'Cambiar categoría' });
    await dialog.getByLabel('Nueva categoría').selectOption(categories[1].id);
    await dialog.getByRole('button', { name: 'Guardar categoría' }).evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
    });

    await expect(dialog.getByRole('alert')).toContainText('Fallo temporal al guardar.');
    await expect(dialog.getByLabel('Nueva categoría')).toHaveValue(categories[1].id);
    expect(mocks.patchBodies).toEqual([{ category_id: categories[1].id }]);
    await dialog.getByRole('button', { name: 'Guardar categoría' }).click();
    await expect(dialog).not.toBeVisible();
    expect(mocks.patchBodies).toEqual([
      { category_id: categories[1].id },
      { category_id: categories[1].id },
    ]);
  });

  test('a logistics user cannot access product category actions', async ({ page }) => {
    const mocks = await installMocks(page, { role: 'LOGISTICS' });
    await openProducts(page);
    await expect(page.getByRole('alert')).toContainText('No tienes permisos para acceder a esta sección.');
    await expect(page.getByRole('button', { name: 'Cambiar categoría' })).toHaveCount(0);
    expect(mocks.patchBodies).toEqual([]);
    expect(mocks.unexpectedRequests).toEqual([]);
  });
});
