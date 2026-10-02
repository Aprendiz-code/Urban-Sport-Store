import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProductViaAdminApi, deleteProductViaAdminApi, updateProductViaAdminApi } from './admin-product-fallback';
import adminApi from './admin-api';

vi.mock('./admin-api', () => ({
  default: {
    createProductApi: vi.fn(),
    updateProductApi: vi.fn(),
    deleteProductApi: vi.fn(),
  },
}));

describe('admin product API helpers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates through the admin API without a browser-side write fallback', async () => {
    const product = { id: 'p-1', name: 'Zapatilla' };
    vi.mocked(adminApi.createProductApi).mockResolvedValueOnce(product as any);

    await expect(createProductViaAdminApi(product)).resolves.toEqual(product);
    expect(adminApi.createProductApi).toHaveBeenCalledWith(product);
  });

  it('propagates admin API failures without writing directly to Supabase', async () => {
    vi.mocked(adminApi.createProductApi).mockRejectedValueOnce(new Error('backend down'));

    await expect(createProductViaAdminApi({ name: 'Zapatilla' })).rejects.toThrow('backend down');
    expect(adminApi.createProductApi).toHaveBeenCalledOnce();
  });

  it('updates through the admin API without a browser-side write fallback', async () => {
    vi.mocked(adminApi.updateProductApi).mockResolvedValueOnce({ id: 'p-1' } as any);

    await expect(updateProductViaAdminApi('p-1', { name: 'Nuevo nombre' })).resolves.toEqual({ id: 'p-1' });
    expect(adminApi.updateProductApi).toHaveBeenCalledWith('p-1', { name: 'Nuevo nombre' });
  });

  it('deletes through the admin API without a browser-side write fallback', async () => {
    vi.mocked(adminApi.deleteProductApi).mockResolvedValueOnce(undefined);

    await expect(deleteProductViaAdminApi('p-1')).resolves.toBeUndefined();
    expect(adminApi.deleteProductApi).toHaveBeenCalledWith('p-1');
  });
});
