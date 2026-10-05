import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  from: vi.fn(),
  data: [] as unknown[],
  error: null as unknown,
}));

vi.mock('../../lib/api-helpers/supabase.js', () => ({
  supabasePublic: { from: apiMocks.from },
}));

import handler from '../products.js';

function createResponse() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(name: string, value: string) { this.headers[name] = value; },
    end(body = '') { this.body = body; },
  };
}

describe('public products endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.data = [{ id: 'active-product', is_active: true }];
    apiMocks.error = null;
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      then: (resolve: (value: { data: unknown[]; error: unknown }) => unknown) =>
        Promise.resolve({ data: apiMocks.data, error: apiMocks.error }).then(resolve),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.order.mockReturnValue(query);
    apiMocks.from.mockReturnValue(query);
  });

  it('filters every public product query to active records', async () => {
    const response = createResponse();

    await handler({ method: 'GET', url: '/api/products' }, response);

    const query = apiMocks.from.mock.results[0].value;
    expect(query.eq).toHaveBeenCalledWith('is_active', true);
    expect(JSON.parse(response.body).data).toEqual([{ id: 'active-product', is_active: true }]);
    expect(response.statusCode).toBe(200);
  });

  it('does not expose an inactive product by id', async () => {
    apiMocks.data = [];
    const response = createResponse();

    await handler({ method: 'GET', url: '/api/products?id=inactive-product' }, response);

    const query = apiMocks.from.mock.results[0].value;
    expect(query.eq).toHaveBeenNthCalledWith(1, 'is_active', true);
    expect(query.eq).toHaveBeenNthCalledWith(2, 'id', 'inactive-product');
    expect(response.statusCode).toBe(404);
  });
});