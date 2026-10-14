import { expect, test, type Page, type Route } from '@playwright/test';

const localOrigin = process.env.E2E_BASE_URL ?? 'http://localhost:5173';
const productId = '11111111-1111-4111-8111-111111111111';
const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const orderId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const quoteBaseId = 'dddddddd-dddd-4ddd-8ddd-';
const supabaseOrigin = 'https://checkout-test.supabase.test';

const product = {
  id: productId,
  slug: 'tenis-e2e',
  name: 'Tenis E2E',
  brand: 'Urban',
  price: 1000,
  original_price: null,
  discount: null,
  rating: 0,
  reviews: 0,
  image: '',
  main_image: '',
  images: [],
  category: 'Calzado',
  category_id: null,
  subcategory: '',
  stock: 20,
  sku: 'E2E-001',
  description: 'Producto local de prueba',
  colors: [],
  sizes: [],
  specifications: [],
  is_active: true,
  gender: 'Unisex',
  is_new: false,
  is_featured: true,
};

const addresses = [
  {
    id: 'address-home',
    label: 'Casa',
    recipientName: 'Comprador E2E',
    line1: 'Calle 10 #20-30',
    line2: '',
    city: 'Bogotá',
    state: 'Cundinamarca',
    postalCode: '110111',
    country: 'Colombia',
    phone: '+57 300 000 0000',
    isDefault: true,
  },
  {
    id: 'address-office',
    label: 'Oficina',
    recipientName: 'Comprador E2E',
    line1: 'Carrera 1 #2-3',
    line2: '',
    city: 'Medellín',
    state: 'Antioquia',
    postalCode: '050001',
    country: 'Colombia',
    phone: '+57 300 000 0000',
    isDefault: false,
  },
];

interface CheckoutHarnessOptions {
  failFirstQuote?: boolean;
  firstQuoteLifetimeMs?: number;
  quoteDelayMs?: number;
  orderDelayMs?: number;
}

interface CheckoutHarness {
  quoteRequests: Array<{ address: { city: string }; items: Array<{ productId: string; quantity: number }> }>;
  orders: Array<Record<string, unknown>>;
  sessions: string[];
  blockedRequests: string[];
  openCheckout: () => Promise<void>;
}

async function fulfillJson(route: Route, status: number, data: unknown) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(data),
  });
}

async function installCheckoutHarness(page: Page, options: CheckoutHarnessOptions = {}): Promise<CheckoutHarness> {
  const quoteRequests: CheckoutHarness['quoteRequests'] = [];
  const orders: CheckoutHarness['orders'] = [];
  const sessions: string[] = [];
  const blockedRequests: string[] = [];

  await page.route('**/*', async (route) => {
    const requestUrl = new URL(route.request().url());
    const pathname = requestUrl.pathname;

    if (requestUrl.origin === supabaseOrigin) {
      if (pathname === '/auth/v1/user') {
        await fulfillJson(route, 200, {
          id: userId,
          aud: 'authenticated',
          role: 'authenticated',
          email: 'checkout@example.test',
          app_metadata: { provider: 'email', providers: ['email'] },
          user_metadata: {},
          created_at: '2026-10-14T00:00:00.000Z',
        });
        return;
      }
      if (pathname === '/rest/v1/profiles') {
        await fulfillJson(route, 200, { id: userId, role: 'CUSTOMER', is_active: true });
        return;
      }
      blockedRequests.push(requestUrl.href);
      await route.abort('blockedbyclient');
      return;
    }

    if (requestUrl.origin === new URL(localOrigin).origin && pathname.startsWith('/api/')) {
      if (pathname === '/api/products' && route.request().method() === 'GET') {
        await fulfillJson(route, 200, { ok: true, data: [product] });
        return;
      }
      if (pathname === '/api/categories' && route.request().method() === 'GET') {
        await fulfillJson(route, 200, { ok: true, data: [] });
        return;
      }
      if (pathname === '/api/home' && route.request().method() === 'GET') {
        await fulfillJson(route, 200, { ok: true, data: {} });
        return;
      }
      if (pathname === '/api/shipping/quotes' && route.request().method() === 'POST') {
        const body = route.request().postDataJSON() as CheckoutHarness['quoteRequests'][number];
        quoteRequests.push(body);
        if (options.quoteDelayMs) await new Promise((resolve) => setTimeout(resolve, options.quoteDelayMs));
        if (options.failFirstQuote && quoteRequests.length === 1) {
          await fulfillJson(route, 422, { ok: false, error: { code: 422, message: 'No hay cobertura configurada.' } });
          return;
        }
        const expiresIn = quoteRequests.length === 1
          ? options.firstQuoteLifetimeMs ?? 300_000
          : 300_000;
        const quoteId = `${quoteBaseId}${String(quoteRequests.length).padStart(12, '0')}`;
        await fulfillJson(route, 201, {
          ok: true,
          data: {
            quote: {
              id: quoteId,
              provider: 'coordinadora',
              currency: 'COP',
              amountCop: 9010 + quoteRequests.length - 1,
              subtotalCop: 1000 * body.items.reduce((total, item) => total + item.quantity, 0),
              coverage: { covered: true, originCode: '11001000', destinationCode: '05001000' },
              estimatedDelivery: { minBusinessDays: 2, maxBusinessDays: 4 },
              expiresAt: new Date(Date.now() + expiresIn).toISOString(),
            },
          },
        });
        return;
      }
      if (pathname === '/api/orders' && route.request().method() === 'POST') {
        orders.push(route.request().postDataJSON() as Record<string, unknown>);
        if (options.orderDelayMs) await new Promise((resolve) => setTimeout(resolve, options.orderDelayMs));
        await fulfillJson(route, 201, {
          ok: true,
          data: {
            order: {
              id: orderId,
              orderNumber: 'ORD-E2E-1',
              userId,
              email: 'checkout@example.test',
              customerName: 'Comprador E2E',
              status: 'pending_payment',
              paymentStatus: 'pending',
              shipmentStatus: 'pending',
              currency: 'COP',
              subtotal: 1000,
              discountAmount: 0,
              shippingAmount: 9010,
              total: 10010,
              shippingQuoteId: (orders[0]?.shippingQuoteId as string | undefined) ?? null,
              shippingAddress: addresses[0],
              items: [],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          },
        });
        return;
      }
      if (/^\/api\/orders\/[^/]+\/payment-session$/.test(pathname) && route.request().method() === 'POST') {
        sessions.push(pathname);
        await fulfillJson(route, 200, {
          ok: true,
          data: {
            checkoutUrl: 'https://checkout.wompi.co/l/e2e-synthetic-link',
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
          },
        });
        return;
      }
      blockedRequests.push(requestUrl.href);
      await route.abort('blockedbyclient');
      return;
    }

    if (requestUrl.origin === new URL(localOrigin).origin) {
      await route.continue();
      return;
    }

    if (requestUrl.hostname === 'images.unsplash.com') {
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#fff"/></svg>',
      });
      return;
    }

    if (requestUrl.hostname === 'fonts.googleapis.com') {
      await route.fulfill({ status: 200, contentType: 'text/css', body: '' });
      return;
    }

    if (requestUrl.hostname === 'checkout.wompi.co') {
      await route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Mock checkout</title>' });
      return;
    }

    blockedRequests.push(requestUrl.href);
    await route.abort('blockedbyclient');
  });

  await page.addInitScript(({ addressList, session }) => {
    localStorage.setItem('urbansport_cart_v1', JSON.stringify([{
      productId: '11111111-1111-4111-8111-111111111111',
      quantity: 1,
      selectedSize: 'Talla única',
      selectedColor: '',
    }]));
    localStorage.setItem('urbansport_addresses', JSON.stringify(addressList));
    localStorage.setItem('sb-checkout-test-auth-token', JSON.stringify(session));
  }, {
    addressList: addresses,
    session: {
      access_token: 'synthetic-e2e-access-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: 'synthetic-e2e-refresh-token',
      user: {
        id: userId,
        aud: 'authenticated',
        role: 'authenticated',
        email: 'checkout@example.test',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: '2026-10-14T00:00:00.000Z',
      },
    },
  });

  return {
    quoteRequests,
    orders,
    sessions,
    blockedRequests,
    openCheckout: async () => {
      await page.goto('/');
      const cartButton = page.getByRole('button', { name: /Abrir carrito, 1 artículos/ });
      await expect(cartButton).toBeVisible();
      await cartButton.click();
      await page.getByRole('button', { name: 'Revisar disponibilidad' }).click();
      await expect(page.getByRole('heading', { name: 'Dirección de entrega' })).toBeVisible();
    },
  };
}

async function expectNoExternalRequests(harness: CheckoutHarness) {
  expect(harness.blockedRequests).toEqual([]);
}

test('blocks order and session creation when the shipping quote fails', async ({ page }) => {
  const harness = await installCheckoutHarness(page, { failFirstQuote: true });
  await harness.openCheckout();

  await expect(page.getByRole('alert')).toContainText('No hay cobertura configurada.');
  await expect(page.getByRole('button', { name: 'Continuar' })).toBeDisabled();
  expect(harness.orders).toHaveLength(0);
  expect(harness.sessions).toHaveLength(0);
  await expectNoExternalRequests(harness);
});

test('shows the quote returned by the backend before payment and sends its exact ID', async ({ page }) => {
  const harness = await installCheckoutHarness(page);
  await harness.openCheckout();

  await expect(page.getByText(/Envío Coordinadora cotizado: \$9\.010 COP/)).toBeVisible();
  await expect(page.getByText(/entrega estimada en 2 día/)).toBeVisible();
  await expect(page.getByText(/\$10\.010 COP/)).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText(/Entrega estimada: 2–4 días hábiles/)).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByRole('heading', { name: 'Pago con Wompi Sandbox' })).toBeVisible();
  await page.getByRole('button', { name: /Pagar con Wompi/ }).evaluate((button: HTMLButtonElement) => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });

  await expect.poll(() => harness.sessions.length).toBe(1);
  expect(harness.orders).toHaveLength(1);
  expect(harness.orders[0].shippingQuoteId).toBe(`${quoteBaseId}000000000001`);
  await expectNoExternalRequests(harness);
});

test('invalidates the prior quote when the address and cart quantity change', async ({ page }) => {
  const harness = await installCheckoutHarness(page, { quoteDelayMs: 250 });
  await harness.openCheckout();
  await expect(page.getByText(/Envío Coordinadora cotizado/)).toBeVisible();

  await page.getByRole('radio', { name: /Oficina/ }).check();
  await expect(page.getByText('Cotizando envío Coordinadora…', { exact: true })).toBeVisible();
  await expect(page.getByText('$9.011 COP', { exact: true })).toBeVisible();
  expect(harness.quoteRequests[1].address.city).toBe('Medellín');

  await page.getByRole('button', { name: /Abrir carrito, 1 artículos/ }).click();
  await page.getByRole('button', { name: 'Aumentar cantidad de Tenis E2E' }).click();
  await expect(page.getByText('Cotizando envío Coordinadora…', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar carrito' }).click();
  await expect(page.getByText('$9.012 COP', { exact: true })).toBeVisible();
  expect(harness.quoteRequests[2].items).toEqual([{ productId, quantity: 2 }]);
  await expectNoExternalRequests(harness);
});

test('renews a quote after it expires from the address step', async ({ page }) => {
  const harness = await installCheckoutHarness(page, { firstQuoteLifetimeMs: 2500 });
  await harness.openCheckout();

  await expect(page.getByRole('alert')).toContainText('La cotización venció.');
  await expect(page.getByRole('button', { name: 'Volver a cotizar' })).toBeVisible();
  await page.getByRole('button', { name: 'Volver a cotizar' }).click();
  await expect(page.getByText(/Envío Coordinadora cotizado: \$9\.011 COP/)).toBeVisible();
  expect(harness.quoteRequests).toHaveLength(2);
  expect(harness.orders).toHaveLength(0);
  expect(harness.sessions).toHaveLength(0);
  await expectNoExternalRequests(harness);
});

test('a rapid double click creates one order and one payment session', async ({ page }) => {
  const harness = await installCheckoutHarness(page, { orderDelayMs: 250 });
  await harness.openCheckout();
  await expect(page.getByText(/Envío Coordinadora cotizado/)).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('button', { name: 'Continuar' }).click();

  const payButton = page.getByRole('button', { name: /Pagar con Wompi/ });
  await payButton.evaluate((button: HTMLButtonElement) => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));
    button.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));
  });

  await expect.poll(() => harness.orders.length).toBe(1);
  await expect.poll(() => harness.sessions.length).toBe(1);
  expect(harness.orders[0].shippingQuoteId).toBe(`${quoteBaseId}000000000001`);
  await expectNoExternalRequests(harness);
});