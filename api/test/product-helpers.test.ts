import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseMocks = vi.hoisted(() => ({ from: vi.fn() }));

vi.mock('../../lib/api-helpers/supabase.js', () => ({
  supabaseAdmin: { from: supabaseMocks.from },
}));

import { normalizeProductPayload, normalizeProductUpdates } from '../../lib/api-helpers/product-helpers.js';

const categoryId = '123e4567-e89b-12d3-a456-426614174000';

describe('product payload normalization', () => {
  beforeEach(() => vi.clearAllMocks());

  it('maps create form data to products columns and generates a slug', async () => {
    await expect(normalizeProductPayload({
      name: 'Nike Air Force 1',
      brand: 'Nike',
      price: '199900',
      original_price: '229900',
      stock: '12',
      sku: 'NKE-AF1-001',
      category_id: categoryId,
      image: 'https://storage.test/main.png',
      images: ['https://storage.test/gallery.png'],
      description: 'Calzado deportivo',
    })).resolves.toEqual({
      slug: 'nike-air-force-1-nke-af1-001',
      name: 'Nike Air Force 1',
      brand: 'Nike',
      price: 199900,
      compare_at_price: 229900,
      category_id: categoryId,
      stock: 12,
      sku: 'NKE-AF1-001',
      main_image: 'https://storage.test/main.png',
      images: ['https://storage.test/gallery.png'],
      description: 'Calzado deportivo',
    });
    expect(supabaseMocks.from).not.toHaveBeenCalled();
  });

  it('maps edits to the same database columns, including empty galleries', async () => {
    await expect(normalizeProductUpdates({
      brand: 'Nike Sportswear',
      image: 'https://storage.test/updated.png',
      images: [],
      stock: 0,
    })).resolves.toEqual({
      brand: 'Nike Sportswear',
      main_image: 'https://storage.test/updated.png',
      images: [],
      stock: 0,
    });
    expect(supabaseMocks.from).not.toHaveBeenCalled();
  });

  it('rejects invalid numeric values, malformed category ids, and oversized galleries', async () => {
    const basePayload = {
      name: 'Nike Air Force 1',
      brand: 'Nike',
      price: 0,
      stock: 0,
      sku: 'NKE-AF1-001',
      category_id: categoryId,
      main_image: 'https://storage.test/main.png',
    };

    await expect(normalizeProductPayload({ ...basePayload, price: -1 })).rejects.toThrow('mayor o igual a 0');
    await expect(normalizeProductPayload({ ...basePayload, stock: 1.5 })).rejects.toThrow('entero');
    await expect(normalizeProductPayload({ ...basePayload, category_id: 'not-a-uuid' })).rejects.toThrow('categoría');
    await expect(normalizeProductPayload({ ...basePayload, images: Array.from({ length: 11 }, (_, index) => `image-${index}`) })).rejects.toThrow('hasta 10 imágenes');
    expect(supabaseMocks.from).not.toHaveBeenCalled();
  });

  it.each(['blob:https://shop.example/id', 'data:image/png;base64,abc', 'images/local.png'])('rejects non-permanent image references: %s', async (image) => {
    const payload = {
      name: 'Nike Air Force 1',
      brand: 'Nike',
      price: 1,
      stock: 1,
      sku: 'NKE-AF1-001',
      category_id: categoryId,
      main_image: image,
    };

    await expect(normalizeProductPayload(payload)).rejects.toThrow('URL HTTP o HTTPS permanente');
    expect(supabaseMocks.from).not.toHaveBeenCalled();
  });
});