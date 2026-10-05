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
import { ApiError } from '../../lib/api-helpers/response.js';

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
    expect(apiMocks.from.mock.calls.map(([table]) => table)).toEqual(['products', 'products', 'audit_logs']);
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

  it('rejects an invalid UUID and missing product on logical DELETE', async () => {
    const invalidResponse = createResponse();
    await handler({ method: 'DELETE', url: '/api/admin/products/not-a-uuid' }, invalidResponse);
    expect(invalidResponse.statusCode).toBe(400);
    expect(apiMocks.from).not.toHaveBeenCalled();

    apiMocks.maybeSingle.mockReset().mockResolvedValueOnce({ data: null, error: null });
    const missingResponse = createResponse();
    await handler({ method: 'DELETE', url: `/api/admin/products/${productId}` }, missingResponse);
    expect(missingResponse.statusCode).toBe(404);
    expect(apiMocks.update).not.toHaveBeenCalled();
    expect(apiMocks.insert).not.toHaveBeenCalled();
  });

  it('preserves product image references and historical relations by never issuing physical deletes', async () => {
    const beforeData = {
      id: productId,
      sku: 'SKU-HISTORY',
      is_active: true,
      main_image: 'https://storage.example/main.png',
      images: ['https://storage.example/side.png'],
      created_at: '2026-01-01T00:00:00.000Z',
    };
    const afterData = { ...beforeData, is_active: false };
    apiMocks.maybeSingle.mockReset()
      .mockResolvedValueOnce({ data: beforeData, error: null })
      .mockResolvedValueOnce({ data: afterData, error: null });
    const response = createResponse();

    await handler({ method: 'DELETE', url: `/api/admin/products/${productId}` }, response);

    expect(apiMocks.update).toHaveBeenCalledOnce();
    expect(apiMocks.update).toHaveBeenCalledWith({ is_active: false });
    expect(apiMocks.delete).not.toHaveBeenCalled();
    expect(apiMocks.from.mock.calls.map(([table]) => table)).toEqual(['products', 'products', 'audit_logs']);
    expect(JSON.parse(JSON.stringify(apiMocks.insert.mock.calls[0][0].after_data))).toEqual(afterData);
    expect(response.statusCode).toBe(204);
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

  it('updates availability through PATCH without changing other product fields', async () => {
    const beforeData = {
      id: productId,
      is_active: true,
      price: 19900,
      stock: 15,
      main_image: 'https://storage.example/main.png',
      images: ['https://storage.example/gallery.png'],
    };
    const updatedData = { ...beforeData, is_active: false };
    apiMocks.maybeSingle.mockReset()
      .mockResolvedValueOnce({ data: beforeData, error: null })
      .mockResolvedValueOnce({ data: updatedData, error: null });
    const response = createResponse();

    await handler(createJsonRequest('PATCH', `/api/admin/products/${productId}`, { is_active: false }), response);

    expect(apiMocks.requirePermission).toHaveBeenCalledWith({ id: 'admin-user' }, 'products.write');
    expect(apiMocks.update).toHaveBeenCalledOnce();
    expect(apiMocks.update).toHaveBeenCalledWith({ is_active: false });
    expect(apiMocks.delete).not.toHaveBeenCalled();
    expect(apiMocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      action: 'deactivate_product',
      before_data: beforeData,
      after_data: updatedData,
    }));
    expect(apiMocks.from.mock.calls.map(([table]) => table)).toEqual(['products', 'products', 'audit_logs']);
    expect(JSON.parse(response.body).data).toEqual(updatedData);
    expect(response.statusCode).toBe(200);
  });

  it('reactivates an inactive product through the same single-column update', async () => {
    const beforeData = { id: productId, is_active: false };
    const updatedData = { id: productId, is_active: true };
    apiMocks.maybeSingle.mockReset()
      .mockResolvedValueOnce({ data: beforeData, error: null })
      .mockResolvedValueOnce({ data: updatedData, error: null });
    const response = createResponse();

    await handler(createJsonRequest('PATCH', `/api/admin/products/${productId}`, { is_active: true }), response);

    expect(apiMocks.update).toHaveBeenCalledOnce();
    expect(apiMocks.update).toHaveBeenCalledWith({ is_active: true });
    expect(apiMocks.insert).toHaveBeenCalledWith(expect.objectContaining({ action: 'activate_product' }));
    expect(JSON.parse(response.body).data).toEqual(updatedData);
    expect(response.statusCode).toBe(200);
  });

  it('rejects availability PATCH payloads containing other fields or a non-boolean value', async () => {
    for (const body of [{ is_active: false, price: 1 }, { is_active: 'false' }]) {
      const response = createResponse();

      await handler(createJsonRequest('PATCH', `/api/admin/products/${productId}`, body), response);

      expect(response.statusCode).toBe(400);
      expect(apiMocks.update).not.toHaveBeenCalled();
    }
    expect(apiMocks.from).not.toHaveBeenCalled();
  });

  it('rejects an invalid product ID before querying Supabase', async () => {
    const response = createResponse();

    await handler(createJsonRequest('PATCH', '/api/admin/products/not-a-uuid', { is_active: false }), response);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error.message).toBe('Invalid productId.');
    expect(apiMocks.from).not.toHaveBeenCalled();
  });

  it('returns 401 when the request has no authenticated session', async () => {
    apiMocks.authenticate.mockRejectedValueOnce(new ApiError(401, 'Authentication required.'));
    const response = createResponse();

    await handler(createJsonRequest('PATCH', `/api/admin/products/${productId}`, { is_active: false }), response);

    expect(response.statusCode).toBe(401);
    expect(apiMocks.requirePermission).not.toHaveBeenCalled();
    expect(apiMocks.from).not.toHaveBeenCalled();
  });

  it('returns 403 when the authenticated user lacks product permissions', async () => {
    apiMocks.requirePermission.mockRejectedValueOnce(new ApiError(403, 'No autorizado.'));
    const response = createResponse();

    await handler(createJsonRequest('PATCH', `/api/admin/products/${productId}`, { is_active: false }), response);

    expect(response.statusCode).toBe(403);
    expect(apiMocks.from).not.toHaveBeenCalled();
  });

  it('returns 404 without writing when the product does not exist', async () => {
    apiMocks.maybeSingle.mockReset().mockResolvedValueOnce({ data: null, error: null });
    const response = createResponse();

    await handler(createJsonRequest('PATCH', `/api/admin/products/${productId}`, { is_active: false }), response);

    expect(response.statusCode).toBe(404);
    expect(apiMocks.update).not.toHaveBeenCalled();
    expect(apiMocks.insert).not.toHaveBeenCalled();
  });

  it('returns 401 and 403 for safe-delete requests before querying product data', async () => {
    apiMocks.authenticate.mockRejectedValueOnce(new ApiError(401, 'Authentication required.'));
    const unauthenticatedResponse = createResponse();
    await handler({ method: 'DELETE', url: `/api/admin/products/${productId}` }, unauthenticatedResponse);
    expect(unauthenticatedResponse.statusCode).toBe(401);
    expect(apiMocks.from).not.toHaveBeenCalled();

    apiMocks.authenticate.mockResolvedValueOnce({ id: 'customer-user' });
    apiMocks.requirePermission.mockRejectedValueOnce(new ApiError(403, 'No autorizado.'));
    const forbiddenResponse = createResponse();
    await handler({ method: 'DELETE', url: `/api/admin/products/${productId}` }, forbiddenResponse);
    expect(forbiddenResponse.statusCode).toBe(403);
    expect(apiMocks.requirePermission).toHaveBeenCalledWith({ id: 'customer-user' }, 'products.archive');
    expect(apiMocks.from).not.toHaveBeenCalled();
  });
});