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

const productId = '123e4567-e89b-12d3-a456-426614174000';

function createResponse() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(name: string, value: string) { this.headers[name] = value; },
    end(body = '') { this.body = body; },
  };
}

function createJsonRequest(method: string, url: string, body: Record<string, unknown>) {
  return {
    method,
    url,
    on(event: string, listener: (...args: any[]) => void) {
      if (event === 'data') queueMicrotask(() => listener(JSON.stringify(body)));
      if (event === 'end') queueMicrotask(() => listener());
      return this;
    },
  };
}

describe('admin product archive endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.authenticate.mockResolvedValue({ id: 'admin-user' });
    apiMocks.requirePermission.mockResolvedValue('ADMIN');
    apiMocks.maybeSingle
      .mockResolvedValueOnce({ data: { id: productId, sku: 'SKU-1', is_active: true }, error: null })
      .mockResolvedValueOnce({ data: { id: productId, sku: 'SKU-1', is_active: false }, error: null });
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

    await handler({ method: 'DELETE', url: `/api/admin/products/${productId}` }, response);

    expect(apiMocks.requirePermission).toHaveBeenCalledWith({ id: 'admin-user' }, 'products.archive');
    expect(apiMocks.from).toHaveBeenCalledWith('products');
    expect(apiMocks.update).toHaveBeenCalledWith({ is_active: false });
    expect(apiMocks.delete).not.toHaveBeenCalled();
    expect(apiMocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      action: 'soft_delete_product',
      entity_id: productId,
      after_data: { id: productId, sku: 'SKU-1', is_active: false },
    }));
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
  });

  it('passes multiline description and string sizes through an authorized PATCH', async () => {
    const beforeData = { id: productId, main_image: 'https://storage.example/main.png', images: [] };
    const updatedData = {
      ...beforeData,
      description: 'Material resistente\n\nPara entrenamiento.',
      sizes: ['7.5', '40 EU'],
    };
    apiMocks.maybeSingle.mockReset()
      .mockResolvedValueOnce({ data: beforeData, error: null })
      .mockResolvedValueOnce({ data: updatedData, error: null });
    const response = createResponse();

    await handler(createJsonRequest('PATCH', `/api/admin/products/${productId}`, {
      description: updatedData.description,
      sizes: updatedData.sizes,
    }), response);

    expect(apiMocks.requirePermission).toHaveBeenCalledWith({ id: 'admin-user' }, 'products.write');
    expect(apiMocks.update).toHaveBeenCalledWith({
      description: updatedData.description,
      sizes: updatedData.sizes,
    });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).data).toMatchObject({
      description: updatedData.description,
      sizes: updatedData.sizes,
    });
  });

  it('preserves explicit empty description and sizes values for clearing on PATCH', async () => {
    const beforeData = { id: productId, main_image: 'https://storage.example/main.png', images: [] };
    const updatedData = { ...beforeData, description: '', sizes: [] };
    apiMocks.maybeSingle.mockReset()
      .mockResolvedValueOnce({ data: beforeData, error: null })
      .mockResolvedValueOnce({ data: updatedData, error: null });
    const response = createResponse();

    await handler(createJsonRequest('PATCH', `/api/admin/products/${productId}`, {
      description: '',
      sizes: [],
    }), response);

    expect(apiMocks.update).toHaveBeenCalledWith({ description: '', sizes: [] });
    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.body).data).toMatchObject({ description: '', sizes: [] });
  });

  it('rejects an invalid product ID before querying Supabase', async () => {
    const response = createResponse();

    await handler({ method: 'DELETE', url: '/api/admin/products/not-a-uuid' }, response);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error.message).toBe('Invalid productId.');
    expect(apiMocks.from).not.toHaveBeenCalled();
  });
});