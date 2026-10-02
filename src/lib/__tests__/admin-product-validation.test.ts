import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateProductForm, isValidUuid } from '../admin-product-form';
import adminApi, { parseAdminApiError } from '../admin-api';
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
      sku: 'SKU-1',
      price: 120000,
      stock: 10,
      categoryId: validUuid,
      image: 'https://example.test/image.jpg',
      images: [],
    })).toEqual({});

    expect(validateProductForm({
      name: 'Zapatilla Test',
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
    [401, 'Unauthorized', '[UNAUTHORIZED] No autorizado'],
    [403, 'Forbidden', '[FORBIDDEN] No autorizado'],
    [409, 'Conflict', '[CONFLICT] Ya existe'],
  ])('maps status %i to a clear error', async (status, _label, responseText) => {
    const text = JSON.stringify({ error: { code: String(status).startsWith('4') ? 'BAD_REQUEST' : status === 401 ? 'UNAUTHORIZED' : status === 403 ? 'FORBIDDEN' : 'CONFLICT', message: responseText.replace(/^\[[A-Z_]+\]\s/, '') }, message: responseText });
    const err = parseAdminApiError(Number(status), text);
    expect(err.message).toContain(responseText.replace(/^\[[A-Z_]+\]\s/, ''));
    expect(err.message).toContain('[');
  });

  it('throws a clear network error when the backend is down', async () => {
    vi.mocked(getAccessToken).mockResolvedValue('token-123');
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    await expect(adminApi.createProductApi({ name: 'Zapatilla' })).rejects.toThrow(/Network error/i);
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
});
