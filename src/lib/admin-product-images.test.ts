import { describe, expect, it, vi } from 'vitest';
import { uploadQueuedProductImages } from './admin-product-images';

describe('queued product image uploads', () => {
  it('uploads sequentially and assigns the first URL as main, the rest as gallery', async () => {
    const events: string[] = [];
    const upload = vi.fn(async (file: string) => {
      events.push(`upload:${file}`);
      return { path: `products/${file}.png` };
    });
    const getPublicUrl = vi.fn((path: string) => {
      events.push(`url:${path}`);
      return `https://storage.example/${path}`;
    });
    const onUploaded = vi.fn();

    const urls = await uploadQueuedProductImages(['front', 'side', 'back'], { mainImage: '', gallery: [] }, upload, getPublicUrl, onUploaded);

    expect(urls).toEqual({
      mainImage: 'https://storage.example/products/front.png',
      gallery: ['https://storage.example/products/side.png', 'https://storage.example/products/back.png'],
    });
    expect(events).toEqual([
      'upload:front', 'url:products/front.png',
      'upload:side', 'url:products/side.png',
      'upload:back', 'url:products/back.png',
    ]);
    expect(onUploaded).toHaveBeenCalledTimes(3);
  });

  it('preserves the existing main image and stops immediately on Storage failure', async () => {
    const upload = vi.fn()
      .mockResolvedValueOnce({ path: 'products/new.png' })
      .mockRejectedValueOnce(new Error('Storage upload failed'));

    await expect(uploadQueuedProductImages(
      ['one', 'two'],
      { mainImage: 'https://storage.example/existing.png', gallery: [] },
      upload,
      (path) => `https://storage.example/${path}`,
    )).rejects.toThrow('Storage upload failed');
    expect(upload).toHaveBeenCalledTimes(2);
  });
});