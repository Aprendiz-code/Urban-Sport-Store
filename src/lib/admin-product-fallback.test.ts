import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildAdminProductPayload, createProductWithFallback, deleteProductWithFallback, updateProductWithFallback } from './admin-product-fallback';
import adminApi from './admin-api';
import * as supabaseStore from './supabase-store';

vi.mock('./admin-api', () => ({
  default: {
    createProductApi: vi.fn(),
    updateProductApi: vi.fn(),
    deleteProductApi: vi.fn(),
  },
}));

vi.mock('./supabase-store', () => ({
  createProductInSupabase: vi.fn(),
  updateProductInSupabase: vi.fn(),
  deleteProductInSupabase: vi.fn(),
}));

describe('admin product fallback helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to Supabase when admin create fails with a fallbackable error', async () => {
    vi.mocked(adminApi.createProductApi).mockRejectedValueOnce(new Error('backend down'));
    vi.mocked(supabaseStore.createProductInSupabase).mockResolvedValueOnce({ id: 'p-1', name: 'Zapatilla', slug: 'zapatilla' } as any);

    const result = await createProductWithFallback(
      { id: 'p-1', name: 'Zapatilla', category_id: '11111111-1111-1111-1111-111111111111' } as any,
      { id: 'p-1', name: 'Zapatilla', category_id: '11111111-1111-1111-1111-111111111111', slug: 'zapatilla' } as any,
    );

    expect(supabaseStore.createProductInSupabase).toHaveBeenCalledWith({
      id: 'p-1',
      name: 'Zapatilla',
      slug: 'zapatilla',
      category_id: '11111111-1111-1111-1111-111111111111',
    });
    expect(result).toEqual({ id: 'p-1', name: 'Zapatilla', slug: 'zapatilla' });
  });

  it('builds an admin payload with required fields even when the source payload is sparse', () => {
    const payload = buildAdminProductPayload({ name: 'Zapatilla', price: '180000', category: 'Zapatos' }, { id: 'p-1' } as any);

    expect(payload.slug).toBe('zapatilla');
    expect(payload.name).toBe('Zapatilla');
    expect(payload.price).toBe(180000);
    expect(payload.category_id).toBe('11111111-1111-1111-1111-111111111111');
  });

  it('does not fall back when admin create fails with 401', async () => {
    vi.mocked(adminApi.createProductApi).mockRejectedValueOnce(new Error('401 Unauthorized'));

    await expect(createProductWithFallback({ id: 'p-1', name: 'Zapatilla' } as any, { id: 'p-1', name: 'Zapatilla' } as any)).rejects.toThrow(/401/);
    expect(supabaseStore.createProductInSupabase).not.toHaveBeenCalled();
  });

  it('does not fall back when admin create fails with 403', async () => {
    vi.mocked(adminApi.createProductApi).mockRejectedValueOnce(new Error('403 Forbidden'));

    await expect(createProductWithFallback({ id: 'p-1', name: 'Zapatilla' } as any, { id: 'p-1', name: 'Zapatilla' } as any)).rejects.toThrow(/403/);
    expect(supabaseStore.createProductInSupabase).not.toHaveBeenCalled();
  });

  it('falls back to Supabase when admin create fails with missing required fields', async () => {
    vi.mocked(adminApi.createProductApi).mockRejectedValueOnce(new Error('400 Missing required fields: slug, name, price, category_id'));
    vi.mocked(supabaseStore.createProductInSupabase).mockResolvedValueOnce({ id: 'p-2', name: 'Zapatilla', slug: 'zapatilla' } as any);

    const result = await createProductWithFallback(
      { name: 'Zapatilla', price: 150000, category_id: '11111111-1111-1111-1111-111111111111' } as any,
      { id: 'p-2', name: 'Zapatilla', slug: 'zapatilla', category_id: '11111111-1111-1111-1111-111111111111' } as any,
    );

    expect(supabaseStore.createProductInSupabase).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Zapatilla',
      slug: 'zapatilla',
      price: 150000,
      category_id: '11111111-1111-1111-1111-111111111111',
    }));
    expect(result).toEqual({ id: 'p-2', name: 'Zapatilla', slug: 'zapatilla' });
  });

  it('falls back to Supabase when admin update fails with a fallbackable error', async () => {
    vi.mocked(adminApi.updateProductApi).mockRejectedValueOnce(new Error('backend down'));
    vi.mocked(supabaseStore.updateProductInSupabase).mockResolvedValueOnce({ id: 'p-1', name: 'Nuevo nombre' } as any);

    const result = await updateProductWithFallback('p-1', { name: 'Nuevo nombre' } as any, { name: 'Nuevo nombre' } as any);

    expect(supabaseStore.updateProductInSupabase).toHaveBeenCalledWith('p-1', { name: 'Nuevo nombre' });
    expect(result).toEqual({ id: 'p-1', name: 'Nuevo nombre' });
  });

  it('falls back to Supabase when admin delete fails with a fallbackable error', async () => {
    vi.mocked(adminApi.deleteProductApi).mockRejectedValueOnce(new Error('backend down'));
    vi.mocked(supabaseStore.deleteProductInSupabase).mockResolvedValueOnce(undefined);

    await expect(deleteProductWithFallback('p-1')).resolves.toBeUndefined();
    expect(supabaseStore.deleteProductInSupabase).toHaveBeenCalledWith('p-1');
  });
});
