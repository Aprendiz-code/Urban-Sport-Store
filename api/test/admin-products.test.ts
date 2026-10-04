import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  from: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  insert: vi.fn(),
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

import handler from '../admin/products/[productId].js';

function createResponse() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(name: string, value: string) { this.headers[name] = value; },
    end(body = '') { this.body = body; },
  };
}

describe('admin product archive endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.authenticate.mockResolvedValue({ id: 'admin-user' });
    apiMocks.requirePermission.mockResolvedValue('ADMIN');
    apiMocks.maybeSingle
      .mockResolvedValueOnce({ data: { id: 'product-1', sku: 'SKU-1', is_active: true }, error: null })
      .mockResolvedValueOnce({ data: { id: 'product-1', sku: 'SKU-1', is_active: false }, error: null });
    apiMocks.update.mockReturnThis();
    apiMocks.insert.mockResolvedValue({ data: null, error: null });

    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: apiMocks.maybeSingle,
      update: apiMocks.update,
      delete: apiMocks.delete,
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    query.update.mockReturnValue(query);
    apiMocks.from.mockImplementation((table: string) => table === 'products' ? query : { insert: apiMocks.insert });
  });

  it('archives only the requested product and does not physically delete rows', async () => {
    const response = createResponse();

    await handler({ method: 'DELETE', url: '/api/admin/products/product-1' }, response);

    expect(apiMocks.requirePermission).toHaveBeenCalledWith({ id: 'admin-user' }, 'products.archive');
    expect(apiMocks.from).toHaveBeenCalledWith('products');
    expect(apiMocks.update).toHaveBeenCalledWith({ is_active: false });
    expect(apiMocks.delete).not.toHaveBeenCalled();
    expect(apiMocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      action: 'soft_delete_product',
      entity_id: 'product-1',
      after_data: { id: 'product-1', sku: 'SKU-1', is_active: false },
    }));
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
  });
});