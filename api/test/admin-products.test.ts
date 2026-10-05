import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  from: vi.fn(),
  maybeSingle: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  insert: vi.fn(),
  storageFrom: vi.fn(),
  storageRemove: vi.fn(),
  productImageRows: [] as Array<{ path: string }>,
  sharedProductImageRows: [] as Array<{ path: string; product_id: string }>,
  otherProductRows: [] as Array<{ main_image?: string | null; images?: string[] | null }>,
  productImageError: null as unknown,
  orderImageRows: [] as Array<{ image_path?: string | null }>,
  orderImageError: null as unknown,
  orderImageRanges: [] as Array<[number, number]>,
  categoryRows: [] as Array<{ image?: string | null; image_url?: string | null }>,
  categoryRanges: [] as Array<[number, number]>,
  authenticate: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock('../../lib/api-helpers/supabase.js', () => ({
  supabaseAdmin: { from: apiMocks.from, storage: { from: apiMocks.storageFrom } },
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

describe('admin product delete endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.authenticate.mockResolvedValue({ id: 'admin-user' });
    apiMocks.requirePermission.mockResolvedValue('ADMIN');
    apiMocks.maybeSingle
      .mockResolvedValueOnce({ data: { id: productId, sku: 'SKU-1', is_active: true }, error: null })
      .mockResolvedValueOnce({ data: { id: productId, sku: 'SKU-1', is_active: false }, error: null });
    apiMocks.update.mockReturnThis();
    apiMocks.insert.mockResolvedValue({ data: null, error: null });
    apiMocks.productImageRows = [];
    apiMocks.sharedProductImageRows = [];
    apiMocks.otherProductRows = [];
    apiMocks.productImageError = null;
    apiMocks.orderImageRows = [];
    apiMocks.orderImageError = null;
    apiMocks.orderImageRanges = [];
    apiMocks.categoryRows = [];
    apiMocks.categoryImageError = null;
    apiMocks.categoryRanges = [];
    apiMocks.storageRemove.mockResolvedValue({ data: [], error: null });
    apiMocks.storageFrom.mockReturnValue({ remove: apiMocks.storageRemove });

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
    apiMocks.delete.mockReturnValue(query);
    const productImagesQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      neq: vi.fn(),
      in: vi.fn(),
      then: (resolve: (value: { data: Array<{ path: string }>; error: unknown }) => unknown) =>
        Promise.resolve({
          data: productImagesQuery.in.mock.calls.length > 0 ? apiMocks.sharedProductImageRows : apiMocks.productImageRows,
          error: apiMocks.productImageError,
        }).then(resolve),
    };
    productImagesQuery.select.mockReturnValue(productImagesQuery);
    productImagesQuery.eq.mockReturnValue(productImagesQuery);
    productImagesQuery.neq.mockReturnValue(productImagesQuery);
    productImagesQuery.in.mockReturnValue(productImagesQuery);
    const orderImagesQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      range: vi.fn().mockImplementation((start: number, end: number) => {
        apiMocks.orderImageRanges.push([start, end]);
        return Promise.resolve({ data: apiMocks.orderImageRows.slice(start, end + 1), error: apiMocks.orderImageError });
      }),
    };
    orderImagesQuery.select.mockReturnValue(orderImagesQuery);
    orderImagesQuery.eq.mockReturnValue(orderImagesQuery);
    orderImagesQuery.order.mockReturnValue(orderImagesQuery);
    const categoriesQuery = {
      select: vi.fn(),
      order: vi.fn(),
      range: vi.fn().mockImplementation((start: number, end: number) => {
        apiMocks.categoryRanges.push([start, end]);
        return Promise.resolve({ data: apiMocks.categoryRows.slice(start, end + 1), error: apiMocks.categoryImageError });
      }),
    };
    categoriesQuery.select.mockReturnValue(categoriesQuery);
    categoriesQuery.order.mockReturnValue(categoriesQuery);
    query.neq = vi.fn().mockReturnValue(query);
    query.order = vi.fn().mockReturnValue(query);
    query.range = vi.fn().mockImplementation(() => Promise.resolve({ data: apiMocks.otherProductRows, error: null }));
    apiMocks.from.mockImplementation((table: string) => {
      if (table === 'products') return query;
      if (table === 'product_images') return productImagesQuery;
      if (table === 'order_items') return orderImagesQuery;
      if (table === 'categories') return categoriesQuery;
      return { insert: apiMocks.insert };
    });
  });

  it('physically deletes only the requested product and records the deletion', async () => {
    const response = createResponse();

    await handler({ method: 'DELETE', url: `/api/admin/products/${productId}` }, response);

    expect(apiMocks.requirePermission).toHaveBeenCalledWith({ id: 'admin-user' }, 'products.archive');
    expect(apiMocks.from).toHaveBeenCalledWith('products');
    expect(apiMocks.from.mock.calls.map(([table]) => table)).toEqual(['products', 'product_images', 'order_items', 'categories', 'products', 'audit_logs']);
    expect(apiMocks.delete).toHaveBeenCalledOnce();
    expect(apiMocks.update).not.toHaveBeenCalled();
    expect(apiMocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      action: 'delete_product',
      entity_id: productId,
      after_data: expect.objectContaining({
        id: productId,
        deleted: true,
        storage_cleanup: expect.objectContaining({ status: 'completed', attempted_paths: [], removed_paths: [] }),
      }),
    }));
    expect(response.statusCode).toBe(204);
    expect(response.body).toBe('');
  });

  it('rejects an invalid UUID and missing product on DELETE', async () => {
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

  it('does not directly mutate Storage or historical order/cart tables during product deletion', async () => {
    const beforeData = {
      id: productId,
      sku: 'SKU-HISTORY',
      is_active: true,
      main_image: 'https://storage.example/main.png',
      images: ['https://storage.example/side.png'],
      created_at: '2026-01-01T00:00:00.000Z',
    };
    apiMocks.maybeSingle.mockReset()
      .mockResolvedValueOnce({ data: beforeData, error: null })
      .mockResolvedValueOnce({ data: { id: productId }, error: null });
    const response = createResponse();

    await handler({ method: 'DELETE', url: `/api/admin/products/${productId}` }, response);

    expect(apiMocks.delete).toHaveBeenCalledOnce();
    expect(apiMocks.update).not.toHaveBeenCalled();
    expect(apiMocks.from.mock.calls.map(([table]) => table)).toEqual(['products', 'product_images', 'order_items', 'categories', 'products', 'audit_logs']);
    expect(apiMocks.insert.mock.calls[0][0].before_data).toEqual({
      ...beforeData,
      product_image_paths: [],
      order_image_paths: [],
      category_image_paths: [],
    });
    expect(response.statusCode).toBe(204);
  });

  it('removes only product-bucket objects referenced by the product and records the attempt', async () => {
    const beforeData = {
      id: productId,
      main_image: 'https://project.supabase.co/storage/v1/object/public/products/products/main.png',
      images: ['products/gallery.png', 'https://cdn.example/external.png'],
    };
    apiMocks.productImageRows = [{ path: 'products/related.png' }];
    apiMocks.maybeSingle.mockReset()
      .mockResolvedValueOnce({ data: beforeData, error: null })
      .mockResolvedValueOnce({ data: { id: productId }, error: null });
    apiMocks.storageRemove.mockResolvedValueOnce({
      data: [{ name: 'products/main.png' }, { name: 'products/gallery.png' }, { name: 'products/related.png' }],
      error: null,
    });
    const response = createResponse();

    await handler({ method: 'DELETE', url: `/api/admin/products/${productId}` }, response);

    expect(apiMocks.storageFrom).toHaveBeenCalledWith('products');
    expect(apiMocks.storageRemove).toHaveBeenCalledWith(['products/main.png', 'products/gallery.png', 'products/related.png']);
    expect(apiMocks.insert).toHaveBeenCalledWith(expect.objectContaining({
      action: 'delete_product',
      after_data: expect.objectContaining({ storage_cleanup: expect.objectContaining({ status: 'completed' }) }),
    }));
    expect(response.statusCode).toBe(204);
  });

  it('keeps Storage objects referenced by another product', async () => {
    const sharedPath = 'products/shared.png';
    const beforeData = { id: productId, main_image: sharedPath };
    apiMocks.maybeSingle.mockReset()
      .mockResolvedValueOnce({ data: beforeData, error: null })
      .mockResolvedValueOnce({ data: { id: productId }, error: null });
    apiMocks.sharedProductImageRows = [{ path: sharedPath, product_id: 'another-product' }];
    const response = createResponse();

    await handler({ method: 'DELETE', url: `/api/admin/products/${productId}` }, response);

    expect(apiMocks.storageRemove).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(207);
    expect(JSON.parse(response.body).data.storage_cleanup.shared_paths).toEqual([sharedPath]);
  });

  it('keeps a Storage object referenced by another product record', async () => {
    const sharedPath = 'products/shared-main.png';
    apiMocks.maybeSingle.mockReset()
      .mockResolvedValueOnce({ data: { id: productId, main_image: sharedPath }, error: null })
      .mockResolvedValueOnce({ data: { id: productId }, error: null });
    apiMocks.otherProductRows = [{ main_image: null, images: [sharedPath] }];
    const response = createResponse();

    await handler({ method: 'DELETE', url: `/api/admin/products/${productId}` }, response);

    expect(apiMocks.storageRemove).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(207);
    expect(JSON.parse(response.body).data.storage_cleanup.shared_paths).toEqual([sharedPath]);
  });

  it('preserves a product image still referenced by a historical order item', async () => {
    const historicalImagePath = 'products/order-snapshot.png';
    apiMocks.maybeSingle.mockReset()
      .mockResolvedValueOnce({ data: { id: productId, main_image: historicalImagePath }, error: null })
      .mockResolvedValueOnce({ data: { id: productId }, error: null });
    apiMocks.orderImageRows = [{ image_path: historicalImagePath }];
    const response = createResponse();

    await handler({ method: 'DELETE', url: `/api/admin/products/${productId}` }, response);

    expect(apiMocks.storageRemove).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(207);
    expect(JSON.parse(response.body).data.storage_cleanup.shared_paths).toContain(historicalImagePath);
    expect(apiMocks.insert.mock.calls[0][0].before_data.order_image_paths).toContain(historicalImagePath);
  });

  it('preserves a product image still used by a category', async () => {
    const categoryImagePath = 'products/category-collection.png';
    apiMocks.maybeSingle.mockReset()
      .mockResolvedValueOnce({ data: { id: productId, main_image: categoryImagePath }, error: null })
      .mockResolvedValueOnce({ data: { id: productId }, error: null });
    apiMocks.categoryRows = [{ image_url: `https://project.supabase.co/storage/v1/object/public/products/${categoryImagePath}` }];
    const response = createResponse();

    await handler({ method: 'DELETE', url: `/api/admin/products/${productId}` }, response);

    expect(apiMocks.storageRemove).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(207);
    expect(JSON.parse(response.body).data.storage_cleanup.shared_paths).toContain(categoryImagePath);
    expect(apiMocks.insert.mock.calls[0][0].before_data.category_image_paths).toContain(categoryImagePath);
  });

  it('checks later pages of orders and categories before removing a Storage path', async () => {
    const sharedPath = 'products/shared-late-page.png';
    apiMocks.maybeSingle.mockReset()
      .mockResolvedValueOnce({ data: { id: productId, main_image: sharedPath }, error: null })
      .mockResolvedValueOnce({ data: { id: productId }, error: null });
    apiMocks.orderImageRows = Array.from({ length: 1001 }, (_, index) => ({ image_path: index === 1000 ? sharedPath : null }));
    apiMocks.categoryRows = Array.from({ length: 1001 }, (_, index) => index === 1000 ? { image: sharedPath } : {});
    const response = createResponse();

    await handler({ method: 'DELETE', url: `/api/admin/products/${productId}` }, response);

    expect(apiMocks.orderImageRanges).toEqual([[0, 999], [1000, 1999]]);
    expect(apiMocks.categoryRanges).toEqual([[0, 999], [1000, 1999]]);
    expect(apiMocks.storageRemove).not.toHaveBeenCalled();
    expect(response.statusCode).toBe(207);
    expect(JSON.parse(response.body).data.storage_cleanup.shared_paths).toEqual([sharedPath]);
  });

  it('does not delete the product if image paths cannot be inventoried', async () => {
    apiMocks.maybeSingle.mockReset().mockResolvedValueOnce({ data: { id: productId }, error: null });
    apiMocks.productImageError = { code: 'XX000', message: 'image lookup failed' };
    const response = createResponse();

    await handler({ method: 'DELETE', url: `/api/admin/products/${productId}` }, response);

    expect(response.statusCode).toBe(500);
    expect(apiMocks.delete).not.toHaveBeenCalled();
    expect(apiMocks.storageRemove).not.toHaveBeenCalled();
  });

  it('reports a partial result with audit data when Storage cleanup fails after row deletion', async () => {
    const beforeData = {
      id: productId,
      main_image: 'https://project.supabase.co/storage/v1/object/public/products/products/main.png',
    };
    apiMocks.maybeSingle.mockReset()
      .mockResolvedValueOnce({ data: beforeData, error: null })
      .mockResolvedValueOnce({ data: { id: productId }, error: null });
    apiMocks.storageRemove.mockResolvedValueOnce({ data: null, error: { message: 'Storage unavailable' } });
    const response = createResponse();

    await handler({ method: 'DELETE', url: `/api/admin/products/${productId}` }, response);

    const result = JSON.parse(response.body).data;
    expect(response.statusCode).toBe(207);
    expect(result.deleted).toBe(true);
    expect(result.storage_cleanup).toMatchObject({
      status: 'failed',
      attempted_paths: ['products/main.png'],
      removed_paths: [],
      error: 'Storage unavailable',
    });
    expect(result.audit_recorded).toBe(true);
    expect(apiMocks.insert).toHaveBeenCalledOnce();
  });

  it('returns 409 with the safe fallback when cart or another foreign key blocks deletion', async () => {
    apiMocks.maybeSingle.mockReset()
      .mockResolvedValueOnce({ data: { id: productId }, error: null })
      .mockResolvedValueOnce({ data: null, error: { code: '23503', message: 'foreign key violation' } });
    const response = createResponse();

    await handler({ method: 'DELETE', url: `/api/admin/products/${productId}` }, response);

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).error.message).toContain('Utiliza "Desactivar producto"');
    expect(apiMocks.insert).not.toHaveBeenCalled();
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