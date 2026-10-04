import { describe, expect, it, vi } from 'vitest';

const adminApiMocks = vi.hoisted(() => ({ uploadProductImageApi: vi.fn() }));

vi.mock('../supabase-client', () => ({
  getSupabaseClient: vi.fn(),
}));
vi.mock('../admin-api', () => ({
  uploadProductImageApi: adminApiMocks.uploadProductImageApi,
}));

import { getSupabaseClient } from '../supabase-client';
import { deleteProductImage, resolveStorageBucket, STORAGE_BUCKET, uploadProductImage } from '../supabase-store';

describe('browser image storage writes', () => {
  it('defaults to the existing products bucket but respects an explicit setting', () => {
    expect(resolveStorageBucket()).toBe('products');
    expect(resolveStorageBucket('products')).toBe('products');
    expect(() => resolveStorageBucket('product-images')).toThrow('debe ser products');
    expect(STORAGE_BUCKET).toBe('products');
  });

  it('uploads through the server API without using browser-side storage credentials', async () => {
    const file = { name: 'image.png', type: 'image/png' } as File;
    adminApiMocks.uploadProductImageApi.mockResolvedValueOnce({ path: 'products/image.png' });

    await expect(uploadProductImage(file, 'products/image.png')).resolves.toEqual({ path: 'products/image.png' });
    expect(adminApiMocks.uploadProductImageApi).toHaveBeenCalledWith(file);
    await expect(deleteProductImage('products/image.png')).rejects.toThrow('endpoint server-side');
    expect(getSupabaseClient).not.toHaveBeenCalled();
  });
});
