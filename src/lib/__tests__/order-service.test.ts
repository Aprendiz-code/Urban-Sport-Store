import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../supabase-auth', () => ({
  getAccessToken: vi.fn(),
}));

import { getAccessToken } from '../supabase-auth';
import { createPendingOrder, OrderServiceError } from '../order-service';

const validRequest = {
  addressId: 'address-1',
  items: [{ productId: 'product-1', quantity: 1 }],
};

beforeEach(() => {
  vi.restoreAllMocks();
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
});
