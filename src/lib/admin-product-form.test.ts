import { describe, expect, it } from 'vitest';
import { MAX_PRODUCT_GALLERY_IMAGES, MAX_PRODUCT_TOTAL_IMAGES, validateProductForm } from './admin-product-form';

const validForm = {
  name: 'Zapatilla de entrenamiento',
  brand: 'Urban',
  sku: 'URB-001',
  price: 120000,
  stock: 4,
  categoryId: '123e4567-e89b-12d3-a456-426614174000',
  image: 'https://storage.example/main.jpg',
};

describe('admin product image limits', () => {
  it('counts one main image plus up to ten additional gallery images', () => {
    const gallery = Array.from({ length: MAX_PRODUCT_GALLERY_IMAGES }, (_, index) => `https://storage.example/${index}.jpg`);

    expect(MAX_PRODUCT_TOTAL_IMAGES).toBe(11);
    expect(validateProductForm({ ...validForm, images: gallery })).not.toHaveProperty('gallery');
    expect(validateProductForm({ ...validForm, images: [...gallery, 'https://storage.example/extra.jpg'] }).gallery)
      .toContain('hasta 10 imágenes');
  });

  it('includes pending files in the gallery count without accepting temporary URLs', () => {
    const gallery = Array.from({ length: MAX_PRODUCT_GALLERY_IMAGES - 1 }, (_, index) => `https://storage.example/${index}.jpg`);

    expect(validateProductForm({ ...validForm, images: gallery, pendingImageCount: 1 })).not.toHaveProperty('gallery');
  });
});