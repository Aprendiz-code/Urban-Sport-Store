import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  authenticate: vi.fn(),
  respondWithOrderError: vi.fn(),
}));

vi.mock('../../lib/api-helpers/supabase.js', () => ({
  supabaseAdmin: { rpc: mocks.rpc },
}));

vi.mock('../orders.js', () => ({
  authenticateOrderRequest: mocks.authenticate,
  respondWithOrderError: mocks.respondWithOrderError,
}));

import handler from '../orders/[id]/requote.js';

const orderId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const quoteId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const productId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const body = {
  shippingQuoteId: quoteId,
  destinationCode: '11001000',
  address: {
    recipientName: 'Persona sintética',
    addressLine1: 'Calle sintética 1',
    city: 'Bogotá',
    state: 'Cundinamarca',
    postalCode: '110111',
    country: 'CO',
    phone: '+573000000000',
  },
  items: [{ productId, quantity: 1 }],
  confirmedTotal: 10010,
  expectedUpdatedAt: '2026-10-18T12:00:00.000Z',
};

function response() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(name: string, value: string) { this.headers[name] = value; },
    end(bodyText: string) { this.body = bodyText; },
  };
}

async function invoke(payload: unknown = body) {
  const res = response();
  await handler({
    method: 'POST',
    headers: { authorization: 'Bearer synthetic-session' },
    query: { id: orderId },
    body: payload,
  }, res);
  return res;
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.authenticate.mockResolvedValue({ id: 'synthetic-user' });
  mocks.respondWithOrderError.mockImplementation((_context: string, _message: string, error: any) => {
    throw error;
  });
});

describe('POST /api/orders/:id/requote', () => {
  it.each([
    ['created/pending attempt', 'attempt_not_terminal'],
    ['creating or outcome_unknown session', 'attempt_not_terminal'],
    ['foreign quote', 'quote_unavailable'],
    ['changed product/price snapshot', 'product_changed'],
    ['insufficient available stock', 'inventory_unavailable'],
  ])('returns a conflict for %s', async (_case, reason) => {
    mocks.rpc.mockResolvedValueOnce({
      data: { status: 'conflict', reason },
      error: null,
    });

    const res = await invoke();

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.code).toBe(reason);
  });

  it('returns the server proposal and does not perform any session operation when total needs confirmation', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        status: 'confirmation_required',
        previous_total: 9000,
        subtotal: 1000,
        shipping: 9010,
        total: 10010,
      },
      error: null,
    });

    const res = await invoke({ ...body, confirmedTotal: 9000 });

    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body)).toMatchObject({
      error: { code: 'confirmation_required' },
      data: { previousTotal: 9000, subtotal: 1000, shipping: 9010, total: 10010 },
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
    expect(mocks.rpc).toHaveBeenCalledWith('confirm_pending_order_requote', expect.objectContaining({
      p_order_id: orderId,
      p_user_id: 'synthetic-user',
      p_confirmed_total: 9000,
    }));
  });

  it('forwards sorted items and explicit confirmation to the transaction RPC', async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        status: 'updated',
        order_id: orderId,
        total: 10010,
        shipping_quote_id: quoteId,
      },
      error: null,
    });

    const res = await invoke();

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toMatchObject({ status: 'updated', orderId, total: 10010 });
    expect(mocks.rpc).toHaveBeenCalledWith('confirm_pending_order_requote', {
      p_order_id: orderId,
      p_user_id: 'synthetic-user',
      p_shipping_quote_id: quoteId,
      p_destination_code: '11001000',
      p_address: body.address,
      p_items: body.items,
      p_confirmed_total: 10010,
      p_expected_updated_at: body.expectedUpdatedAt,
    });
    expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });

  it('forwards the normalized request in canonical item order', async () => {
    const lowerProductId = '11111111-1111-4111-8111-111111111111';
    mocks.rpc.mockResolvedValueOnce({
      data: { status: 'confirmation_required', previous_total: 9000, subtotal: 2000, shipping: 9010, total: 11010 },
      error: null,
    });

    const res = await invoke({
      ...body,
      items: [
        { productId, quantity: 1 },
        { productId: lowerProductId, quantity: 1 },
      ],
    });

    expect(res.statusCode).toBe(409);
    expect(mocks.rpc).toHaveBeenCalledWith('confirm_pending_order_requote', expect.objectContaining({
      p_items: [
        { productId: lowerProductId, quantity: 1 },
        { productId, quantity: 1 },
      ],
    }));
  });

  it('rejects malformed IDs and bodies before invoking the RPC', async () => {
    const invalidId = response();
    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer synthetic-session' },
      query: { id: 'not-a-uuid' },
      body,
    }, invalidId);
    expect(invalidId.statusCode).toBe(400);

    const invalidBody = await invoke({ ...body, destinationCode: 'bogota' });
    expect(invalidBody.statusCode).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});