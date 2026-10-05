import { test, expect } from '@playwright/test';

const products = [
  {
    id: 'product-a',
    slug: 'uno-running',
    name: 'Zapatilla Uno',
    brand: 'Urban',
    price: 120000,
    stock: 8,
    sku: 'URB-001',
    category: 'Running',
    description: 'Descripción real de la primera zapatilla.',
    image: 'https://images.example/uno-main.jpg',
    main_image: 'https://images.example/uno-main.jpg',
    images: ['https://images.example/uno-side.jpg', 'https://images.example/uno-back.jpg'],
    colors: [],
    sizes: ['Única'],
    is_featured: true,
  },
  {
    id: 'product-b',
    name: 'Zapatilla Dos',
    brand: 'Stride',
    price: 145000,
    stock: 5,
    sku: 'STR-002',
    category: 'Running',
    description: 'Descripción real de la segunda zapatilla.',
    image: 'https://images.example/dos-main.jpg',
    main_image: 'https://images.example/dos-main.jpg',
    images: ['https://images.example/dos-side.jpg'],
    colors: [],
    sizes: ['Única'],
  },
];

test('product cards open the matching detail and its gallery actions stay independent', async ({ page }) => {
  await page.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    const pathname = requestUrl.pathname;
    if (requestUrl.hostname === 'images.example') {
      await route.fulfill({
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="#287c73"/></svg>',
      });
      return;
    }
    if (pathname.endsWith('/products')) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: products }) });
      return;
    }
    if (pathname.endsWith('/categories')) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: [] }) });
      return;
    }
    if (pathname.endsWith('/home')) {
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, data: {} }) });
      return;
    }
    await route.continue();
  });

  await page.goto('/');
  const firstProductImageLink = page.locator('a[aria-label="Ver Zapatilla Uno"]').first();
  await expect(firstProductImageLink).toBeVisible();
  await firstProductImageLink.click();

  await expect(page.getByRole('heading', { level: 1, name: 'Zapatilla Uno' })).toBeVisible();
  const desktopImageBox = await page.locator('img[alt="Zapatilla Uno - vista 1"]').boundingBox();
  const desktopInfoBox = await page.getByRole('heading', { level: 1, name: 'Zapatilla Uno' }).boundingBox();
  expect(desktopImageBox).not.toBeNull();
  expect(desktopInfoBox).not.toBeNull();
  expect(desktopInfoBox!.x).toBeGreaterThan(desktopImageBox!.x + desktopImageBox!.width * 0.8);
  expect(new URL(page.url()).searchParams.get('product')).toBe('uno-running');
  await expect(page.getByText('Descripción real de la primera zapatilla.')).toBeVisible();
  await page.getByRole('button', { name: 'Ver imagen 2' }).click();
  await expect(page.locator('img[alt="Zapatilla Uno - vista 2"]')).toHaveAttribute('src', products[0].images[0]);

  await page.getByRole('button', { name: 'Ampliar imagen del producto' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cerrar vista ampliada' })).toBeVisible();
  await expect(dialog.locator('div[tabindex="-1"]')).toBeFocused();
  await dialog.getByRole('button', { name: 'Imagen siguiente' }).click();
  await expect(dialog.locator('img[alt="Zapatilla Uno ampliada"]')).toHaveAttribute('src', products[0].images[1]);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ampliar imagen del producto' })).toBeFocused();

  await page.getByRole('link', { name: 'Zapatilla Dos', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Zapatilla Dos' })).toBeVisible();
  expect(new URL(page.url()).searchParams.get('product')).toBe('product-b');
  await expect(page.locator('img[alt="Zapatilla Dos - vista 1"]')).toHaveAttribute('src', products[1].main_image);

  await page.getByRole('button', { name: 'Volver al catálogo' }).click();
  expect(new URL(page.url()).searchParams.get('product')).toBeNull();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('a[aria-label="Ver Zapatilla Uno"]').first().click();
  await expect(page.getByRole('heading', { level: 1, name: 'Zapatilla Uno' })).toBeVisible();
  const mobileImageBox = await page.locator('img[alt="Zapatilla Uno - vista 1"]').boundingBox();
  const mobileInfoBox = await page.getByRole('heading', { level: 1, name: 'Zapatilla Uno' }).boundingBox();
  expect(mobileImageBox).not.toBeNull();
  expect(mobileInfoBox).not.toBeNull();
  expect(mobileInfoBox!.y).toBeGreaterThan(mobileImageBox!.y + mobileImageBox!.height);
  await page.getByRole('button', { name: 'Volver al catálogo' }).click();

  await page.getByRole('button', { name: 'Agregar Zapatilla Uno a favoritos' }).first().click();
  expect(new URL(page.url()).searchParams.get('product')).toBeNull();
  await page.getByRole('button', { name: 'Agregar al carrito' }).first().click();
  expect(new URL(page.url()).searchParams.get('product')).toBeNull();
});
