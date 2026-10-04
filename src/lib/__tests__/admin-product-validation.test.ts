import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateProductForm, isValidUuid } from '../admin-product-form';
import adminApi, { formatAdminApiError, parseAdminApiError } from '../admin-api';
import { getAccessToken } from '../supabase-auth';

vi.mock('../supabase-auth', () => ({
  getAccessToken: vi.fn(),
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
    [400, 'Bad Request', '[BAD_REQUEST] Petición inválida'],
    [401, 'Unauthorized', '[UNAUTHORIZED] Sesión administrativa requerida'],
    [403, 'Forbidden', '[FORBIDDEN] No tienes permisos para esta operación.'],
    [409, 'Conflict', '[CONFLICT] Ya existe'],
  ])('maps status %i to a clear error', async (status, _label, responseText) => {
    const text = JSON.stringify({ error: { code: String(status).startsWith('4') ? 'BAD_REQUEST' : status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : 'CONFLICT', message: responseText.replace(/^\[[A-Z_]+\]\s/, '') }, message: responseText });
    const err = parseAdminApiError(Number(status), text);
    expect(err.message).toContain(responseText.replace(/^\[[A-Z_]+\]\s/, ''));
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
