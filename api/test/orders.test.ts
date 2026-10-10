import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Readable } from 'node:stream';

vi.mock('../../lib/api-helpers/supabase.js', () => ({
  supabaseAdmin: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

const scopedClientMocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock('@supabase/supabase-js', () => ({
  createClient: scopedClientMocks.createClient,
}));

import { supabaseAdmin } from '../../lib/api-helpers/supabase.js';
import handler from '../orders.js';
import detailHandler from '../orders/[id].js';
import cancelHandler from '../orders/[id]/cancel.js';

const idempotencyKey = '123e4567-e89b-42d3-a456-426614174000';
const orderId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const productId = '11111111-1111-4111-8111-111111111111';
const address = {
  recipientName: 'Ana Gómez',
  addressLine1: 'Cra 15 #84-25',
  city: 'Bogotá',
  state: 'Cundinamarca',
  postalCode: '110221',
  country: 'CO',
  phone: '+57 311 234 5678',
};

function createQuery(result: { data: unknown; error: unknown }) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    order: vi.fn(() => query),
    limit: vi.fn(() => query),
    or: vi.fn(() => query),
    maybeSingle: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return query;
}

function makeResponse() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(name: string, value: string) { this.headers[name] = value; },
    end(body: string) { this.body = body; },
  };
}

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: orderId,
    order_number: 'ORD-20261010-A1B2C3D4',
    user_id: 'user-1',
    email: 'ana@example.test',
    customer_name: 'Ana Gómez',
    phone: address.phone,
    status: 'pending_payment',
    expires_at: '2026-10-11T12:00:00.000Z',
    currency: 'COP',
    subtotal: '120000',
    discount_amount: '0',
    shipping_amount: '0',
    total: '120000',
    payment_provider: 'local',
    shipping_address: address,
    notes: null,
    created_at: '2026-10-10T12:00:00.000Z',
    updated_at: '2026-10-10T12:00:00.000Z',
    order_items: [{
      id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      order_id: orderId,
      product_id: productId,
      product_name: 'Tenis',
      sku: 'TEN-1',
      image_path: null,
      quantity: 1,
      unit_price: '120000',
      total_price: '120000',
      created_at: '2026-10-10T12:00:00.000Z',
    }],
    inventory_reservations: [{ expires_at: '2026-10-10T12:20:00.000Z' }],
    payments: [{ payment_provider: 'local', status: 'pending' }],
    ...overrides,
  };
}

describe('secure orders endpoints', () => {
  let profileQuery: ReturnType<typeof createQuery>;
  let ordersQuery: ReturnType<typeof createQuery>;

  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');

    profileQuery = createQuery({ data: { id: 'user-1', role: 'CUSTOMER', is_active: true }, error: null });
    ordersQuery = createQuery({ data: [], error: null });
    (supabaseAdmin as any).from = vi.fn((table: string) => table === 'profiles' ? profileQuery : ordersQuery);
    scopedClientMocks.createClient.mockReturnValue({
      from: vi.fn(() => ordersQuery),
    });
    (supabaseAdmin as any).rpc = vi.fn().mockResolvedValue({
      data: { order: { id: orderId, status: 'pending_payment', items: [] } },
      error: null,
    });
    (supabaseAdmin!.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
  });

  it('rejects unauthenticated requests', async () => {
    (supabaseAdmin!.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      data: { user: null },
      error: new Error('invalid token'),
    });
    const req = { method: 'POST', headers: { 'idempotency-key': idempotencyKey }, body: {} };
    const res = makeResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(401);
  });

  it('rejects malformed requests and frontend-controlled payment fields', async () => {
    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer test-access-token', 'idempotency-key': idempotencyKey },
      body: {
        address,
        items: [{ productId, quantity: 1 }],
        total: 30000,
      },
    };
    const res = makeResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(400);
    expect(supabaseAdmin!.rpc).not.toHaveBeenCalled();
  });

  it('requires a UUID v4 idempotency key before accessing the creation RPC', async () => {
    const res = makeResponse();

    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer test-access-token', 'idempotency-key': 'not-a-uuid' },
      body: { address, items: [{ productId, quantity: 1 }] },
    }, res);

    expect(res.statusCode).toBe(400);
    expect(supabaseAdmin!.rpc).not.toHaveBeenCalled();
  });

  it('creates a pending order only through the transactional RPC', async () => {
    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer test-access-token', 'idempotency-key': idempotencyKey },
      body: { address, items: [{ productId, quantity: 1 }] },
    };
    const res = makeResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(201);
    expect(supabaseAdmin!.rpc).toHaveBeenCalledWith('create_pending_order', {
      p_user_id: 'user-1',
      p_idempotency_key: idempotencyKey,
      p_request: req.body,
    });
    expect(JSON.parse(res.body).data.order.status).toBe('pending_payment');
  });

  it('parses a Node request stream when creating an order', async () => {
    const req = Readable.from([JSON.stringify({ address, items: [{ productId, quantity: 1 }] })]) as any;
    req.method = 'POST';
    req.headers = { authorization: 'Bearer test-access-token', 'idempotency-key': idempotencyKey };
    const res = makeResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(201);
    expect(supabaseAdmin!.rpc).toHaveBeenCalledWith('create_pending_order', {
      p_user_id: 'user-1',
      p_idempotency_key: idempotencyKey,
      p_request: { address, items: [{ productId, quantity: 1 }] },
    });
  });

  it('does not permit reusing an idempotency key', async () => {
    (supabaseAdmin as any).rpc.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'duplicate key violates orders_idempotency_key_key' },
    });
    const res = makeResponse();

    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer test-access-token', 'idempotency-key': idempotencyKey },
      body: { address, items: [{ productId, quantity: 1 }] },
    }, res);

    expect(res.statusCode).toBe(409);
  });

  it('lists only the authenticated user’s persisted orders', async () => {
    ordersQuery = createQuery({ data: [orderRow()], error: null });
    (supabaseAdmin as any).from = vi.fn((table: string) => table === 'profiles' ? profileQuery : ordersQuery);
    const res = makeResponse();

    await handler({ method: 'GET', headers: { authorization: 'Bearer test-access-token' } }, res);

    expect(scopedClientMocks.createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'anon-key',
      expect.objectContaining({
        global: { headers: { Authorization: 'Bearer test-access-token' } },
      }),
    );
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.orders[0]).toMatchObject({
      id: orderId,
      status: 'pending_payment',
      paymentStatus: 'pending',
      paymentProvider: 'local',
      expiresAt: '2026-10-11T12:00:00.000Z',
    });
    expect(JSON.parse(res.body).data.orders[0]).not.toHaveProperty('reservationExpiresAt');
    expect(JSON.parse(res.body).data.orders[0]).not.toHaveProperty('request_hash');
  });

  it('returns an order detail only when it belongs to the authenticated user', async () => {
    ordersQuery = createQuery({ data: orderRow(), error: null });
    (supabaseAdmin as any).from = vi.fn((table: string) => table === 'profiles' ? profileQuery : ordersQuery);
    const res = makeResponse();

    await detailHandler({
      method: 'GET',
      headers: { authorization: 'Bearer test-access-token' },
      query: { id: orderId },
    }, res);

    expect(ordersQuery.eq).toHaveBeenCalledWith('id', orderId);
    expect(JSON.parse(res.body).data.order.items[0].productId).toBe(productId);
  });

  it('does not reveal missing or another user’s order', async () => {
    ordersQuery = createQuery({ data: null, error: null });
    (supabaseAdmin as any).from = vi.fn((table: string) => table === 'profiles' ? profileQuery : ordersQuery);
    const res = makeResponse();

    await detailHandler({
      method: 'GET',
      headers: { authorization: 'Bearer test-access-token' },
      query: { id: orderId },
    }, res);

    expect(res.statusCode).toBe(404);
  });

  it('denies missing or inactive profiles before accessing orders', async () => {
    profileQuery = createQuery({ data: null, error: null });
    const from = vi.fn(() => profileQuery);
    (supabaseAdmin as any).from = from;
    const res = makeResponse();

    await handler({ method: 'GET', headers: { authorization: 'Bearer test-access-token' } }, res);
    expect(res.statusCode).toBe(403);
    expect(from).toHaveBeenCalledTimes(1);

    profileQuery.maybeSingle.mockResolvedValueOnce({
      data: { id: 'user-1', role: 'CUSTOMER', is_active: false },
      error: null,
    });
    res.statusCode = 200;
    await handler({ method: 'GET', headers: { authorization: 'Bearer test-access-token' } }, res);
    expect(res.statusCode).toBe(403);
    expect(from).toHaveBeenCalledTimes(2);
  });

  it('uses a stable descending cursor and bounded page size', async () => {
    ordersQuery = createQuery({ data: [orderRow(), orderRow({
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      created_at: '2026-10-10T11:00:00.000Z',
    })], error: null });
    const res = makeResponse();

    await handler({
      method: 'GET',
      headers: { authorization: 'Bearer test-access-token' },
      query: { limit: '1' },
    }, res);

    expect(ordersQuery.order).toHaveBeenNthCalledWith(1, 'created_at', { ascending: false });
    expect(ordersQuery.order).toHaveBeenNthCalledWith(2, 'id', { ascending: false });
    expect(ordersQuery.limit).toHaveBeenCalledWith(2);
    expect(JSON.parse(res.body).data.orders).toHaveLength(1);
    expect(typeof JSON.parse(res.body).data.nextCursor).toBe('string');
  });

  it('rejects an out-of-range page size', async () => {
    const res = makeResponse();

    await handler({
      method: 'GET',
      headers: { authorization: 'Bearer test-access-token' },
      query: { limit: '101' },
    }, res);

    expect(res.statusCode).toBe(400);
  });

  it('cancels only an owned pending order through the backend RPC', async () => {
    (supabaseAdmin as any).from = vi.fn((table: string) => table === 'profiles'
      ? profileQuery
      : createQuery({ data: { id: orderId, user_id: 'user-1', status: 'pending_payment' }, error: null }));
    (supabaseAdmin as any).rpc.mockResolvedValueOnce({
      data: { id: orderId, status: 'cancelled' },
      error: null,
    });
    const res = makeResponse();

    await cancelHandler({
      method: 'POST',
      headers: { authorization: 'Bearer test-access-token' },
      query: { id: orderId },
    }, res);

    expect(supabaseAdmin!.rpc).toHaveBeenCalledWith('cancel_pending_order', { p_order_id: orderId });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.order).toEqual({ id: orderId, status: 'cancelled' });
  });

  it('does not reveal or cancel another user’s order', async () => {
    (supabaseAdmin as any).from = vi.fn((table: string) => table === 'profiles'
      ? profileQuery
      : createQuery({ data: { id: orderId, user_id: 'other-user', status: 'pending_payment' }, error: null }));
    const res = makeResponse();

    await cancelHandler({
      method: 'POST',
      headers: { authorization: 'Bearer test-access-token' },
      query: { id: orderId },
    }, res);

    expect(res.statusCode).toBe(404);
    expect(supabaseAdmin!.rpc).not.toHaveBeenCalled();
  });
});
