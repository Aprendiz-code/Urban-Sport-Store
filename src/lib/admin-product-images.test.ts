import { describe, expect, it, vi } from 'vitest';
import {
  buildImageGalleryState,
  getAdjacentImageIndex,
  getImageSwipeDirection,
  normalizeProductImageList,
  uploadSelectedProductImages,
  uploadQueuedProductImages,
} from './admin-product-images';

describe('queued product image uploads', () => {
  it('keeps a successful upload for retry and preserves the selected primary and gallery order', async () => {
    const savedSelections: Array<{ id: string; src: string; permanentUrl?: string; file?: string }> = [];
    const upload = vi.fn()
      .mockResolvedValueOnce({ path: 'products/one.png' })
      .mockRejectedValueOnce(new Error('Storage unavailable'));
    const selectedImages = [
      { id: 'old-main', src: 'https://storage.example/main.png', permanentUrl: 'https://storage.example/main.png' },
      { id: 'first-new', src: 'blob:first', file: 'first' },
      { id: 'second-new', src: 'blob:second', file: 'second' },
    ];

    await expect(uploadSelectedProductImages(
      selectedImages,
      'second-new',
      upload,
      (path) => `https://storage.example/${path}`,
      (images) => savedSelections.splice(0, savedSelections.length, ...images),
    )).rejects.toThrow('Storage unavailable');

    expect(savedSelections).toEqual([
      { id: 'old-main', src: 'https://storage.example/main.png', permanentUrl: 'https://storage.example/main.png' },
      { id: 'first-new', src: 'https://storage.example/products/one.png', permanentUrl: 'https://storage.example/products/one.png' },
      { id: 'second-new', src: 'blob:second', file: 'second' },
    ]);

    const retryUpload = vi.fn(async (file: string) => ({ path: `products/${file}.png` }));
    const result = await uploadSelectedProductImages(
      savedSelections,
      'second-new',
      retryUpload,
      (path) => `https://storage.example/${path}`,
    );

    expect(retryUpload).toHaveBeenCalledOnce();
    expect(retryUpload).toHaveBeenCalledWith('second');
    expect(result).toEqual({
      mainImage: 'https://storage.example/products/second.png',
      images: ['https://storage.example/main.png', 'https://storage.example/products/one.png'],
    });
  });

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

  it('keeps the first valid image as main and removes duplicates, placeholders, and invalid URLs', () => {
    const state = normalizeProductImageList(
      'https://cdn.example.com/main.jpg',
      ['https://cdn.example.com/main.jpg', '', 'blob:https://cdn.example.com/evil', 'data:image/png;base64,abc', 'https://cdn.example.com/side.jpg', 'https://cdn.example.com/side.jpg'],
      () => 'https://cdn.example.com/fallback.jpg',
    );

    expect(state).toEqual({
      mainImage: 'https://cdn.example.com/main.jpg',
      gallery: ['https://cdn.example.com/side.jpg'],
    });
  });

  it('keeps every available gallery image in its original order', () => {
    const gallery = Array.from({ length: 14 }, (_, index) => `https://storage.example/${index}.jpg`);
    const state = buildImageGalleryState('https://storage.example/main.jpg', gallery);

    expect(state.mainImage).toBe('https://storage.example/main.jpg');
    expect(state.gallery).toEqual(gallery);
  });

  it('accepts a storage path and converts it to a public URL', () => {
    const state = normalizeProductImageList(
      'products/hero.jpg',
      ['products/side.jpg', 'https://cdn.example.com/ok.jpg'],
      (path) => `https://storage.example/${path}`,
    );

    expect(state.mainImage).toBe('https://storage.example/products/hero.jpg');
    expect(state.gallery).toEqual([
      'https://storage.example/products/side.jpg',
      'https://cdn.example.com/ok.jpg',
    ]);
  });

  it('returns a placeholder state when no valid image exists', () => {
    expect(buildImageGalleryState('', [], () => 'https://storage.example/fallback.jpg')).toEqual({
      mainImage: '',
      gallery: [],
      hasImages: false,
    });

    expect(buildImageGalleryState('blob:https://cdn.example.com/evil', ['data:image/png;base64,abc'], () => 'https://storage.example/fallback.jpg')).toEqual({
      mainImage: '',
      gallery: [],
      hasImages: false,
    });
  });

  it('moves through gallery indexes without wrapping past the valid range', () => {
    expect(getAdjacentImageIndex(0, 3, 'next')).toBe(1);
    expect(getAdjacentImageIndex(2, 3, 'next')).toBe(2);
    expect(getAdjacentImageIndex(0, 3, 'previous')).toBe(0);
    expect(getAdjacentImageIndex(2, 3, 'previous')).toBe(1);
  });

  it('detects deliberate horizontal swipes and ignores taps or vertical movement', () => {
    expect(getImageSwipeDirection(120, 40, 60, 45)).toBe('next');
    expect(getImageSwipeDirection(60, 40, 120, 45)).toBe('previous');
    expect(getImageSwipeDirection(100, 40, 80, 42)).toBeNull();
    expect(getImageSwipeDirection(100, 40, 120, 100)).toBeNull();
  });
});