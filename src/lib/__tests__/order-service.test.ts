import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../supabase-auth', () => ({
  getAccessToken: vi.fn(),
}));

import { getAccessToken } from '../supabase-auth';
import { createPendingOrder, createShippingQuote, OrderServiceError } from '../order-service';
import { cancelPendingOrder, getMyOrder, listMyOrders } from '../order-service';
import { createWompiPaymentSession } from '../order-service';

const validRequest = {
  shippingQuoteId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  address: {
    recipientName: 'Ana Gómez',
    addressLine1: 'Cra 15 #84-25',
    city: 'Bogotá',
    state: 'Cundinamarca',
    postalCode: '110221',
    country: 'CO',
    phone: '+57 311 234 5678',
  },
  items: [{ productId: '11111111-1111-4111-8111-111111111111', quantity: 1 }],
};
const validQuoteRequest = {
  destinationCode: '11001000',
  address: validRequest.address,
  items: validRequest.items,
};

const persistedOrder = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  orderNumber: 'ORD-20261010-A1B2C3D4',
  userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  email: 'ana@example.test',
  customerName: 'Ana Gómez',
  status: 'pending_payment',
  paymentStatus: 'pending',
  total: 120000,
  items: [],
  shippingAddress: validRequest.address,
  createdAt: '2026-10-10T12:00:00.000Z',
};

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(getAccessToken).mockReset();
});

describe('order service', () => {
  it('requests a server quote using only address and product quantities', async () => {
    vi.mocked(getAccessToken).mockResolvedValue('session-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ ok: true, data: { quote: {
        id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
        provider: 'coordinadora', currency: 'COP', amountCop: 9010, subtotalCop: 1000,
        calculatedBy: 'urban_sport_store',
        coverage: { covered: true, originCode: '11001000', destinationCode: '11001000' },
        destination: { code: '11001000', department: 'Cundinamarca', municipality: 'Bogotá' },
        estimatedDelivery: { minBusinessDays: 1, maxBusinessDays: 1 },
        expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
      } } }),
      { status: 201, headers: { 'Content-Type': 'application/json' } },
    )));

    await expect(createShippingQuote(validQuoteRequest)).resolves.toMatchObject({
      provider: 'coordinadora', amountCop: 9010, subtotalCop: 1000, currency: 'COP',
    });
    const [url, options] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse(String(options?.body));
    expect(String(url)).toContain('/shipping/quotes');
    expect(body).toEqual(validQuoteRequest);
    expect(body).not.toHaveProperty('amountCop');
    expect(body).not.toHaveProperty('shippingAmount');
  });

  it('surfaces a failed quote response for the checkout to block payment', async () => {
    vi.mocked(getAccessToken).mockResolvedValue('session-token');
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ ok: false, error: { code: 422, message: 'No hay cobertura configurada.' } }),
      { status: 422, headers: { 'Content-Type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    await expect(createShippingQuote(validQuoteRequest))
      .rejects.toMatchObject({ status: 422, message: 'No hay cobertura configurada.' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not treat the blocked API response as a persisted order', async () => {
    vi.mocked(getAccessToken).mockResolvedValue('session-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ ok: false, error: { code: 501, message: 'Creación bloqueada.' } }),
      { status: 501, headers: { 'Content-Type': 'application/json' } },
    )));

    await expect(createPendingOrder(validRequest)).rejects.toMatchObject({
      name: 'OrderServiceError',
      status: 501,
      message: 'Creación bloqueada.',
    });
  });

  it('requires a Supabase session and rejects client-controlled totals', async () => {
    vi.mocked(getAccessToken).mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(createPendingOrder(validRequest)).rejects.toBeInstanceOf(OrderServiceError);
    await expect(createPendingOrder({ ...validRequest, total: 1 } as never)).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sends a fresh UUID v4 idempotency key and accepts the persisted pending order', async () => {
    vi.mocked(getAccessToken).mockResolvedValue('session-token');
    const idempotencyKeys = [
      '123e4567-e89b-42d3-a456-426614174000',
      '223e4567-e89b-42d3-a456-426614174000',
    ];
    vi.stubGlobal('crypto', { randomUUID: vi.fn()
      .mockReturnValueOnce(idempotencyKeys[0])
      .mockReturnValueOnce(idempotencyKeys[1]) });
    const makeCreatedResponse = () => new Response(
      JSON.stringify({ ok: true, data: { order: persistedOrder } }),
      { status: 201, headers: { 'Content-Type': 'application/json' } },
    );
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(makeCreatedResponse())
      .mockResolvedValueOnce(makeCreatedResponse());
    vi.stubGlobal('fetch', fetchMock);

    await expect(createPendingOrder(validRequest)).resolves.toMatchObject({
      id: persistedOrder.id,
      status: 'pending_payment',
      paymentStatus: 'pending',
    });
      expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
        shippingQuoteId: validRequest.shippingQuoteId,
      });
    await expect(createPendingOrder(validRequest)).resolves.toMatchObject({ id: persistedOrder.id });
    const sentKeys = fetchMock.mock.calls.map((call) => new Headers(call[1]?.headers).get('Idempotency-Key'));
    expect(sentKeys).toEqual(idempotencyKeys);
    expect(new Set(sentKeys).size).toBe(2);
  });

  it('loads the authenticated user’s order list and detail through the API', async () => {
    vi.mocked(getAccessToken).mockResolvedValue('session-token');
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ ok: true, data: { orders: [persistedOrder] } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ))
      .mockResolvedValueOnce(new Response(
        JSON.stringify({ ok: true, data: { order: persistedOrder } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ));
    vi.stubGlobal('fetch', fetchMock);

    await expect(listMyOrders()).resolves.toMatchObject([{ id: persistedOrder.id, status: 'pending_payment' }]);
    await expect(getMyOrder(persistedOrder.id)).resolves.toMatchObject({ id: persistedOrder.id });
    expect(String(fetchMock.mock.calls[0][0])).toContain('/orders');
    expect(String(fetchMock.mock.calls[1][0])).toContain(`/orders/${persistedOrder.id}`);
  });

  it('cancels one pending order through the existing authenticated endpoint', async () => {
    vi.mocked(getAccessToken).mockResolvedValue('session-token');
    const fetchMock = vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ ok: true, data: { order: { id: persistedOrder.id, status: 'cancelled' } } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);

    await expect(cancelPendingOrder(persistedOrder.id)).resolves.toEqual({
      id: persistedOrder.id,
      status: 'cancelled',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/orders/${persistedOrder.id}/cancel`),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('does not report cancellation when the endpoint returns another state', async () => {
    vi.mocked(getAccessToken).mockResolvedValue('session-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ ok: true, data: { order: { id: persistedOrder.id, status: 'pending_payment' } } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )));

    await expect(cancelPendingOrder(persistedOrder.id)).rejects.toMatchObject({
      status: 503,
      message: 'No se confirmó la cancelación del pedido.',
    });
  });

  it('creates an authenticated Wompi payment session and accepts only a sandbox checkout URL', async () => {
    vi.mocked(getAccessToken).mockResolvedValue('session-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ ok: true, data: {
        checkoutUrl: 'https://checkout.wompi.co/l/sandbox-link',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )));

    await expect(createWompiPaymentSession('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).resolves.toMatchObject({
      checkoutUrl: 'https://checkout.wompi.co/l/sandbox-link',
    });
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/orders/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/payment-session'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('refuses a payment-session response that points outside Wompi checkout', async () => {
    vi.mocked(getAccessToken).mockResolvedValue('session-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ ok: true, data: {
        checkoutUrl: 'https://checkout.attacker.example/l/fake',
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
      } }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    )));

    await expect(createWompiPaymentSession('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa')).rejects.toMatchObject({ status: 503 });
  });
});
