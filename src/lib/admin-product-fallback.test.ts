import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProductWithFallback, deleteProductWithFallback, updateProductWithFallback } from './admin-product-fallback';
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
    vi.mocked(supabaseStore.createProductInSupabase).mockResolvedValueOnce({ id: 'p-1', name: 'Zapatilla' } as any);

    const result = await createProductWithFallback({ id: 'p-1', name: 'Zapatilla' } as any);

    expect(supabaseStore.createProductInSupabase).toHaveBeenCalledWith({ id: 'p-1', name: 'Zapatilla' });
    expect(result).toEqual({ id: 'p-1', name: 'Zapatilla' });
  });

  it('does not fall back when admin create fails with 401', async () => {
    vi.mocked(adminApi.createProductApi).mockRejectedValueOnce(new Error('401 Unauthorized'));

    await expect(createProductWithFallback({ id: 'p-1', name: 'Zapatilla' } as any)).rejects.toThrow(/401/);
    expect(supabaseStore.createProductInSupabase).not.toHaveBeenCalled();
  });

  it('does not fall back when admin create fails with 403', async () => {
    vi.mocked(adminApi.createProductApi).mockRejectedValueOnce(new Error('403 Forbidden'));

    await expect(createProductWithFallback({ id: 'p-1', name: 'Zapatilla' } as any)).rejects.toThrow(/403/);
    expect(supabaseStore.createProductInSupabase).not.toHaveBeenCalled();
  });

  it('falls back to Supabase when admin update fails with a fallbackable error', async () => {
    vi.mocked(adminApi.updateProductApi).mockRejectedValueOnce(new Error('backend down'));
    vi.mocked(supabaseStore.updateProductInSupabase).mockResolvedValueOnce({ id: 'p-1', name: 'Nuevo nombre' } as any);

    const result = await updateProductWithFallback('p-1', { name: 'Nuevo nombre' } as any);

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
