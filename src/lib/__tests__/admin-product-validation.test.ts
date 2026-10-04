import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateProductForm, isValidUuid, submitAdminProductForm } from '../admin-product-form';
import adminApi, { formatAdminApiError, parseAdminApiError } from '../admin-api';
import { getAccessToken } from '../supabase-auth';

vi.mock('../supabase-auth', () => ({
  getAccessToken: vi.fn(),
  clearLocalAuthSession: vi.fn(),
}));

describe('admin product validation', () => {
  it('accepts a valid category_id UUID and rejects an empty category selection', () => {
    const validUuid = '123e4567-e89b-12d3-a456-426614174000';

    expect(isValidUuid(validUuid)).toBe(true);
    expect(validateProductForm({
      name: 'Zapatilla Test',
      brand: 'Marca Test',
      sku: 'SKU-1',
      price: 120000,
      stock: 10,
      categoryId: validUuid,
      image: 'https://example.test/image.jpg',
      images: [],
    })).toEqual({});

    expect(validateProductForm({
      name: 'Zapatilla Test',
      brand: 'Marca Test',
      sku: 'SKU-1',
      price: 120000,
      stock: 10,
      categoryId: '',
      image: '',
      images: [],
    })).toMatchObject({
      category: 'Selecciona una categoría válida.',
    });
  });

  it('accepts zero price and rejects negative price, fractional stock, and oversized galleries', () => {
    const validProduct = {
      name: 'Zapatilla Test',
      brand: 'Marca Test',
      sku: 'SKU-1',
      price: 0,
      stock: 0,
      categoryId: '123e4567-e89b-12d3-a456-426614174000',
      image: 'https://example.test/image.jpg',
      images: [],
    };

    expect(validateProductForm(validProduct)).toEqual({});
    expect(validateProductForm({ ...validProduct, price: -1 })).toHaveProperty('price');
    expect(validateProductForm({ ...validProduct, stock: 1.5 })).toHaveProperty('stock');
    expect(validateProductForm({ ...validProduct, images: Array.from({ length: 11 }, (_, index) => `image-${index}`) })).toHaveProperty('gallery');
  });

  it.each(['blob:https://shop.example/id', 'data:image/png;base64,abc', 'images/local.png'])('rejects non-permanent main image references: %s', (image) => {
    expect(validateProductForm({
      name: 'Zapatilla Test',
      brand: 'Marca Test',
      sku: 'SKU-1',
      price: 1,
      stock: 1,
      categoryId: '123e4567-e89b-12d3-a456-426614174000',
      image,
      images: [],
    })).toHaveProperty('image');
  });

  it('accepts queued local images before upload and enforces the gallery limit', () => {
    const localImageDraft = {
      name: 'Zapatilla Test',
      brand: 'Marca Test',
      sku: 'SKU-1',
      price: 1,
      stock: 1,
      categoryId: '123e4567-e89b-12d3-a456-426614174000',
      image: '',
      images: [],
      pendingImageCount: 1,
    };

    expect(validateProductForm(localImageDraft)).toEqual({});
    expect(validateProductForm({ ...localImageDraft, pendingImageCount: 12 })).toHaveProperty('gallery');
  });

  it('does not reset the product form when an admin save fails with 401', async () => {
    const resetForm = vi.fn();
    const unauthorized = Object.assign(new Error('Sesión administrativa requerida'), { status: 401 });

    await expect(submitAdminProductForm(async () => { throw unauthorized; }, resetForm)).rejects.toMatchObject({ status: 401 });
    expect(resetForm).not.toHaveBeenCalled();
  });
});

describe('admin API response handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    [400, '[BAD_REQUEST] Petición inválida', 'Petición inválida'],
    [401, '[UNAUTHORIZED] No autorizado', 'Sesión administrativa requerida'],
    [403, '[FORBIDDEN] No autorizado', 'No tienes permisos para esta operación.'],
    [409, '[CONFLICT] Ya existe', 'Ya existe'],
  ])('maps status %i to a clear error', async (status, responseText, expectedMessage) => {
    const text = JSON.stringify({ error: { code: String(status).startsWith('4') ? 'BAD_REQUEST' : status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : 'CONFLICT', message: responseText.replace(/^\[[A-Z_]+\]\s/, '') }, message: responseText });
    const err = parseAdminApiError(Number(status), text);
    expect(err.message).toContain(expectedMessage);
    expect(err.message).toContain('[');
  });

  it('preserves Supabase code, details, and hint for UI diagnostics', () => {
    const err = parseAdminApiError(400, JSON.stringify({
      error: {
        code: '23514',
        message: 'new row violates check constraint',
        details: 'Failing row contains an invalid value.',
        hint: 'Check stock is an integer.',
      },
    }));

    expect(err.message).toContain('[23514]');
    expect(err.message).toContain('Failing row contains an invalid value.');
    expect(err.message).toContain('Check stock is an integer.');
    expect(err).toMatchObject({
      status: 400,
      code: '23514',
      apiMessage: 'new row violates check constraint',
      details: 'Failing row contains an invalid value.',
      hint: 'Check stock is an integer.',
    });
    expect(formatAdminApiError(err, 'Error al guardar.')).toContain('HTTP 400 [23514] new row violates check constraint');
    expect(formatAdminApiError(err, 'Error al guardar.')).toContain('Failing row contains an invalid value.');
    expect(formatAdminApiError(err, 'Error al guardar.')).toContain('Check stock is an integer.');
  });

  it('throws a clear network error when the backend is down', async () => {
    vi.mocked(getAccessToken).mockResolvedValue('token-123');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    await expect(adminApi.createProductApi({ name: 'Zapatilla' })).rejects.toThrow(/Error de red/i);
  });

  it('returns the created product payload when the API responds 201', async () => {
    vi.mocked(getAccessToken).mockResolvedValue('token-123');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ ok: true, data: { id: 'product-1', name: 'Zapatilla' } }),
    }));

    await expect(adminApi.createProductApi({ name: 'Zapatilla' })).resolves.toEqual({
      id: 'product-1',
      name: 'Zapatilla',
    });

    const requestInit = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(requestInit?.method).toBe('POST');
    expect(new Headers(requestInit?.headers).get('Authorization')).toBe('Bearer token-123');
  });

  it('loads the admin product table from the protected products endpoint', async () => {
    vi.mocked(getAccessToken).mockResolvedValue('admin-session-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: [{ id: 'admin-product-1', name: 'Producto privado' }] }),
    }));

    await expect(adminApi.fetchProducts()).resolves.toEqual([{ id: 'admin-product-1', name: 'Producto privado' }]);

    const [url, requestInit] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(new URL(String(url), 'http://localhost').pathname).toBe('/api/admin/products');
    expect(requestInit?.method).toBe('GET');
    expect(new Headers(requestInit?.headers).get('Authorization')).toBe('Bearer admin-session-token');
  });

  it('sends Authorization on PATCH admin product requests', async () => {
    vi.mocked(getAccessToken).mockResolvedValue('admin-session-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: { id: 'product-1' } }),
    }));

    await adminApi.updateProductApi('product-1', { name: 'Editado' });

    const requestInit = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(requestInit?.method).toBe('PATCH');
    expect(new Headers(requestInit?.headers).get('Authorization')).toBe('Bearer admin-session-token');
  });

  it('sends Authorization on DELETE admin product requests', async () => {
    vi.mocked(getAccessToken).mockResolvedValue('admin-session-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 204 }));

    await adminApi.deleteProductApi('product-1');

    const requestInit = vi.mocked(fetch).mock.calls[0]?.[1];
    expect(requestInit?.method).toBe('DELETE');
    expect(new Headers(requestInit?.headers).get('Authorization')).toBe('Bearer admin-session-token');
  });

  it('blocks admin requests without a session and does not call fetch', async () => {
    vi.mocked(getAccessToken).mockResolvedValue(null);

    await expect(adminApi.fetchProducts()).rejects.toThrow('Sesión administrativa requerida');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('does not retry a write when 401 is followed by a failed session refresh', async () => {
    vi.mocked(getAccessToken)
      .mockResolvedValueOnce('expired-session-token')
      .mockResolvedValueOnce(null);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'No autenticado.' } }),
    }));

    await expect(adminApi.createProductApi({ name: 'Producto' })).rejects.toThrow('Sesión administrativa requerida');
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('reports 403 as a permissions error', async () => {
    vi.mocked(getAccessToken).mockResolvedValue('admin-session-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ error: { code: 'FORBIDDEN', message: 'No autorizado.' } }),
    }));

    await expect(adminApi.fetchProducts()).rejects.toMatchObject({
      status: 403,
      message: expect.stringContaining('No tienes permisos'),
    });
  });

  it('never writes the access token to console logs', async () => {
    const token = 'secret-session-token';
    vi.mocked(getAccessToken).mockResolvedValue(token);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, data: [] }),
    }));
    const consoleSpies = [vi.spyOn(console, 'log').mockImplementation(() => {}), vi.spyOn(console, 'warn').mockImplementation(() => {}), vi.spyOn(console, 'error').mockImplementation(() => {})];

    await adminApi.fetchProducts();

    for (const spy of consoleSpies) {
      expect(spy.mock.calls.flat().join(' ')).not.toContain(token);
      spy.mockRestore();
    }
  });

  it('keeps the session bearer when uploading a file with its image content type', async () => {
    vi.mocked(getAccessToken).mockResolvedValue('upload-session-token');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ ok: true, data: { path: 'products/test.png' } }),
    }));
    const file = new Blob(['image-bytes'], { type: 'image/png' }) as File;

    await expect(adminApi.uploadProductImageApi(file)).resolves.toEqual({ path: 'products/test.png' });

    const requestInit = vi.mocked(fetch).mock.calls[0]?.[1];
    const headers = new Headers(requestInit?.headers);
    expect(headers.get('Authorization')).toBe('Bearer upload-session-token');
    expect(headers.get('Content-Type')).toBe('image/png');
  });
});
