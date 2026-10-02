import { describe, expect, it, vi } from 'vitest';

vi.mock('../supabase-client', () => ({
  getSupabaseClient: vi.fn(),
}));

import { getSupabaseClient } from '../supabase-client';
import { deleteProductImage, uploadProductImage } from '../supabase-store';

describe('browser image storage writes', () => {
  it('keeps upload and delete disabled without a server-side storage provider', async () => {
    const file = { name: 'image.png', type: 'image/png' } as File;

    await expect(uploadProductImage(file, 'products/image.png')).rejects.toThrow('server-side');
    await expect(deleteProductImage('products/image.png')).rejects.toThrow('endpoint server-side');
    expect(getSupabaseClient).not.toHaveBeenCalled();
  });
});
