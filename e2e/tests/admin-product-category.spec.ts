import { test, expect, type Page, type Route } from '@playwright/test';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const PRODUCT_ID = '22222222-2222-4222-8222-222222222222';
const ORIGINAL_CATEGORY_ID = '33333333-3333-4333-8333-333333333333';
const TARGET_CATEGORY_ID = '44444444-4444-4444-8444-444444444444';
const OTHER_CATEGORY_ID = '55555555-5555-4555-8555-555555555555';

const categories = [
  { id: ORIGINAL_CATEGORY_ID, name: 'Urbano', slug: 'urbano', is_active: true },
  { id: TARGET_CATEGORY_ID, name: 'Running', slug: 'running', is_active: true },
  { id: OTHER_CATEGORY_ID, name: 'Tercera categoría', slug: 'tercera', is_active: true },
];

function createProduct(categoryId: string | null = ORIGINAL_CATEGORY_ID) {
  return {
    id: PRODUCT_ID,
    name: 'Producto legacy de prueba',
    slug: 'producto-legacy-de-prueba',
    brand: 'Marca local',
    description: 'Producto usado exclusivamente por el test runtime.',
    price: 24000,
    stock: 4,
    sku: 'E2E-CATEGORY-1',
    category_id: categoryId,
    main_image: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=',
    images: [],
    sizes: [],
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

async function installMocks(
  page: Page,
  role: 'ADMIN' | 'LOGISTICS',
  baseURL?: string,
  productCategoryId: string | null = ORIGINAL_CATEGORY_ID,
  failFirstUpdate = true,
) {
  const product = createProduct(productCategoryId);
  const patchRequests: Array<{ body: unknown; authorization: string | null }> = [];
  const externalRequests: string[] = [];
  let updateAttempts = 0;
  const appOrigin = new URL(baseURL ?? 'http://localhost:5173').origin;
  const expectedStaticHosts = new Set(['fonts.googleapis.com', 'images.unsplash.com']);

  await page.route('**/*', async (route: Route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const json = (body: unknown, status = 200) => route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });

    if (path.endsWith('/auth/v1/token')) {
      return json({
        access_token: `mock-${role.toLowerCase()}-access-token`,
        token_type: 'bearer',
        expires_in: 3600,
        refresh_token: 'mock-refresh-token',
        user: { id: USER_ID, email: 'category-e2e@example.test', app_metadata: { provider: 'email' }, user_metadata: {} },
      });
    }
    if (path.endsWith('/auth/v1/user')) {
      return json({ id: USER_ID, email: 'category-e2e@example.test', app_metadata: { provider: 'email' }, user_metadata: {} });
    }
    if (path.includes('/rest/v1/profiles')) {
      return json([{ id: USER_ID, role, is_active: true }]);
    }
    if (path === '/api/home' && request.method() === 'GET') return json({ data: {} });
    if (path === '/api/products' && request.method() === 'GET') return json({ data: [product] });
    if (path === '/api/categories' && request.method() === 'GET') return json({ data: categories });
    if (path === '/api/admin/products' && request.method() === 'GET') return json({ data: [product] });
    if (path === `/api/admin/products/${PRODUCT_ID}` && request.method() === 'PATCH') {
      patchRequests.push({
        body: request.postDataJSON(),
        authorization: request.headers()['authorization'] ?? null,
      });
      updateAttempts += 1;
      if (role !== 'ADMIN') return json({ error: { message: 'No autorizado.' } }, 403);
      if (failFirstUpdate && updateAttempts === 1) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return json({ error: { message: 'Fallo temporal simulado.' } }, 500);
      }
      const body = request.postDataJSON() as { category_id?: string };
      product.category_id = body.category_id ?? product.category_id;
      return json({ data: product });
    }
    if (path === '/api/admin/audit' && request.method() === 'GET') return json({ data: [] });
    if (path === '/api/admin/dashboard' && request.method() === 'GET') {
      return json({ data: { orders: { status: 'empty', total: 0, recent: [] }, customers: { status: 'empty', total: 0 }, sales: { status: 'empty', paid_orders: 0, total_7d: 0, period_start: null, period_end: null }, category_sales_status: 'empty' } });
    }
    if (path === '/api/admin/home-content' && request.method() === 'GET') return json({ data: {} });
    if (path === '/api/account/profile' && request.method() === 'GET') {
      return json({ data: { id: USER_ID, email: 'category-e2e@example.test', firstName: 'Test', lastName: 'Category', fullName: 'Test Category', phone: null } });
    }

    if (url.origin !== appOrigin) {
      if (!expectedStaticHosts.has(url.hostname)) externalRequests.push(request.url());
      return route.abort();
    }
    if (path.startsWith('/api/')) {
      externalRequests.push(request.url());
      return json({ error: { message: 'Unexpected local API request in category E2E.' } }, 500);
    }
    return route.continue();
  });

  return { patchRequests, externalRequests };
}

async function signIn(page: Page) {
  await page.goto('/login');
  await page.locator('#auth-email').fill('category-e2e@example.test');
  await page.locator('#auth-password').fill('local-mock-password');
  await page.locator('button[type="submit"]').click();
}

test('category editing is isolated, retryable, single-submit and keyboard accessible', async ({ page, baseURL }) => {
  const { patchRequests, externalRequests } = await installMocks(page, 'ADMIN', baseURL);
  await signIn(page);
  await page.getByRole('button', { name: 'Productos', exact: true }).click();

  const row = page.getByRole('row', { name: /Producto legacy de prueba/ });
  const rowActions = row.locator('summary[aria-label^="Acciones para"]');
  await expect(row).toBeVisible();
  await rowActions.click();
  await row.getByRole('button', { name: 'Editar', exact: true }).click();
  await expect(page.locator('#admin-product-category')).toHaveValue(ORIGINAL_CATEGORY_ID);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Editar producto' })).toHaveCount(0);

  await rowActions.click();
  const changeButton = row.getByRole('button', { name: 'Cambiar categoría' });
  await changeButton.click();
  const categoryDialog = page.getByRole('dialog', { name: 'Cambiar categoría' });
  await expect(categoryDialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(categoryDialog).toHaveCount(0);
  await expect(rowActions).toBeFocused();

  await rowActions.click();
  await row.getByRole('button', { name: 'Cambiar categoría' }).click();
  await page.getByLabel('Nueva categoría').selectOption(OTHER_CATEGORY_ID);
  await page.getByRole('button', { name: 'Guardar categoría' }).dblclick();

  await expect(page.getByRole('alert')).toContainText('Fallo temporal simulado.');
  await expect(row).toContainText('Urbano');
  expect(patchRequests).toHaveLength(1);
  expect(patchRequests[0].body).toEqual({ category_id: OTHER_CATEGORY_ID });
  expect(patchRequests[0].authorization).toMatch(/^Bearer mock-admin-access-token$/);

  await page.getByRole('button', { name: 'Guardar categoría' }).click();
  await expect(row).toContainText('Tercera categoría');
  await expect(categoryDialog).toHaveCount(0);
  expect(patchRequests).toHaveLength(2);
  expect(patchRequests[1].body).toEqual({ category_id: OTHER_CATEGORY_ID });
  expect(externalRequests).toEqual([]);
});

test('a product with no previous category can be assigned an existing category', async ({ page, baseURL }) => {
  const { patchRequests, externalRequests } = await installMocks(page, 'ADMIN', baseURL, null, false);
  await signIn(page);
  await page.getByRole('button', { name: 'Productos', exact: true }).click();

  const row = page.getByRole('row', { name: /Producto legacy de prueba/ });
  await expect(row).toContainText('Sin categoría');
  await row.locator('summary[aria-label^="Acciones para"]').click();
  await row.getByRole('button', { name: 'Cambiar categoría' }).click();
  await page.getByLabel('Nueva categoría').selectOption(TARGET_CATEGORY_ID);
  await page.getByRole('button', { name: 'Guardar categoría' }).click();

  await expect(row).toContainText('Running');
  expect(patchRequests).toHaveLength(1);
  expect(patchRequests[0].body).toEqual({ category_id: TARGET_CATEGORY_ID });
  expect(externalRequests).toEqual([]);
});

test('a user without products.write cannot open or submit category changes', async ({ page, baseURL }) => {
  const { patchRequests, externalRequests } = await installMocks(page, 'LOGISTICS', baseURL);
  await signIn(page);
  await page.goto('/?view=admin&adminSection=products');

  await expect(page.getByRole('alert')).toContainText('No tienes permisos para acceder a esta sección.');
  await expect(page.getByRole('button', { name: 'Cambiar categoría' })).toHaveCount(0);
  expect(patchRequests).toHaveLength(0);
  expect(externalRequests).toEqual([]);
});