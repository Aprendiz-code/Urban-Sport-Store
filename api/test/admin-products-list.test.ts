import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  from: vi.fn(),
  authenticate: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock('../../lib/api-helpers/supabase.js', () => ({
  supabaseAdmin: { from: apiMocks.from },
}));
vi.mock('../../lib/api-helpers/auth.js', () => ({
  requireAuthenticatedUser: apiMocks.authenticate,
}));
vi.mock('../../lib/api-helpers/admin.js', () => ({
  requirePermission: apiMocks.requirePermission,
}));

import handler from '../admin/products/index.js';
import { ApiError } from '../../lib/api-helpers/response.js';

function createResponse() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(name: string, value: string) { this.headers[name] = value; },
    end(body = '') { this.body = body; },
  };
}

describe('admin product list endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.authenticate.mockResolvedValue({ id: 'admin-user' });
    apiMocks.requirePermission.mockResolvedValue('ADMIN');
  });

  it('returns active and inactive products across REST result pages', async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      id: `product-${index}`,
      is_active: index % 2 === 0,
    }));
    const secondPage = [{ id: 'inactive-last-page', is_active: false }];
    const query = {
      select: vi.fn(),
      order: vi.fn(),
      range: vi.fn(),
    };
    query.select.mockReturnValue(query);
    query.order.mockReturnValue(query);
    query.range.mockImplementation((start: number) => Promise.resolve({
      data: start === 0 ? firstPage : secondPage,
      error: null,
    }));
    apiMocks.from.mockReturnValue(query);
    const response = createResponse();

    await handler({ method: 'GET', url: '/api/admin/products' }, response);

    const result = JSON.parse(response.body).data;
    expect(apiMocks.requirePermission).toHaveBeenCalledWith({ id: 'admin-user' }, 'products.read');
    expect(query.range.mock.calls).toEqual([[0, 999], [1000, 1999]]);
    expect(result).toHaveLength(1001);
    expect(result.at(-1)).toEqual({ id: 'inactive-last-page', is_active: false });
    expect(result.some((product: { is_active: boolean }) => !product.is_active)).toBe(true);
    expect(response.statusCode).toBe(200);
  });

  it('requires an authenticated session and products.read permission', async () => {
    apiMocks.authenticate.mockRejectedValueOnce(new ApiError(401, 'Authentication required.'));
    const unauthenticatedResponse = createResponse();
    await handler({ method: 'GET', url: '/api/admin/products' }, unauthenticatedResponse);
    expect(unauthenticatedResponse.statusCode).toBe(401);
    expect(apiMocks.from).not.toHaveBeenCalled();

    apiMocks.authenticate.mockResolvedValueOnce({ id: 'customer-user' });
    apiMocks.requirePermission.mockRejectedValueOnce(new ApiError(403, 'No autorizado.'));
    const forbiddenResponse = createResponse();
    await handler({ method: 'GET', url: '/api/admin/products' }, forbiddenResponse);
    expect(forbiddenResponse.statusCode).toBe(403);
    expect(apiMocks.requirePermission).toHaveBeenCalledWith({ id: 'customer-user' }, 'products.read');
    expect(apiMocks.from).not.toHaveBeenCalled();
  });
});