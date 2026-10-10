import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../supabase-auth', () => ({
  getAccessToken: vi.fn(),
}));

import { getAccessToken } from '../supabase-auth';
import { createPendingOrder, OrderServiceError } from '../order-service';
import { getMyOrder, listMyOrders } from '../order-service';
import { createWompiPaymentSession } from '../order-service';

const validRequest = {
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
