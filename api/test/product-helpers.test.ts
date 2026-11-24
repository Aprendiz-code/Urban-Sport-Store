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
      catalog_section: 'Tenis Hombre',
      image: 'https://storage.test/main.png',
      images: ['https://storage.test/gallery.png'],
      description: 'Calzado deportivo\n\nIdeal para entrenamiento.',
      sizes: [' 7.5 ', '40 EU', '10 US'],
      specifications: [
        { name: ' Material ', value: ' Cuero sintético ' },
        { name: 'Suela', value: 'Caucho' },
      ],
      shipping_weight_grams: '1000',
      shipping_length_cm: '20',
      shipping_width_cm: '20',
      shipping_height_cm: '10',
      shipping_declared_value_cop: '1000',
      shipping_units_per_guide: '1',
    })).resolves.toEqual({
      slug: 'nike-air-force-1-nke-af1-001',
      name: 'Nike Air Force 1',
      brand: 'Nike',
      price: 199900,
      compare_at_price: 229900,
      category_id: categoryId,
      catalog_section: 'Tenis Hombre',
      stock: 12,
      sku: 'NKE-AF1-001',
      main_image: 'https://storage.test/main.png',
      images: ['https://storage.test/gallery.png'],
      description: 'Calzado deportivo\n\nIdeal para entrenamiento.',
      sizes: ['7.5', '40 EU', '10 US'],
      specifications: [
        { name: 'Material', value: 'Cuero sintético' },
        { name: 'Suela', value: 'Caucho' },
      ],
      shipping_weight_grams: 1000,
      shipping_length_cm: 20,
      shipping_width_cm: 20,
      shipping_height_cm: 10,
      shipping_declared_value_cop: 1000,
      shipping_units_per_guide: 1,
    });
    expect(supabaseMocks.from).not.toHaveBeenCalled();
  });

  it('persists color metadata on one product row without conflating its gallery images', async () => {
    await expect(normalizeProductPayload({
      name: 'New Balance 410',
      color_name: 'Gris / Plata',
      color_hex: '#A7ADB4',
      color_hex2: '#D6DADE',
      model_sort_order: '0',
      is_default_color: true,
      images: ['https://storage.test/angle-1.png', 'https://storage.test/angle-2.png'],
    })).resolves.toMatchObject({
      color_name: 'Gris / Plata',
      color_hex: '#A7ADB4',
      color_hex2: '#D6DADE',
      model_sort_order: 0,
      is_default_color: true,
      images: ['https://storage.test/angle-1.png', 'https://storage.test/angle-2.png'],
    });
  });

  it('validates HEX values, sort order, and model UUIDs', async () => {
    await expect(normalizeProductPayload({ name: 'Modelo', color_hex: '#GGGGGG' }))
      .rejects.toThrow('HEX principal');
    await expect(normalizeProductPayload({ name: 'Modelo', model_sort_order: -1 }))
      .rejects.toThrow('entero no negativo');
    await expect(normalizeProductPayload({ name: 'Modelo', model_id: 'not-a-uuid' }))
      .rejects.toThrow('modelo seleccionado');
  });

  it('requires explicit name and HEX when assigning a model_id', async () => {
    await expect(normalizeProductPayload({
      name: 'Modelo',
      model_id: '123e4567-e89b-12d3-a456-426614174001',
      color_name: 'Negro',
    })).rejects.toThrow('nombre comercial y HEX');
  });

  it('maps edits to the same database columns, including empty galleries', async () => {
    await expect(normalizeProductUpdates({
      brand: 'Nike Sportswear',
      image: 'https://storage.test/updated.png',
      images: [],
      description: '',
      sizes: [],
      specifications: [],
      stock: 0,
      shipping_length_cm: 20,
    })).resolves.toEqual({
      brand: 'Nike Sportswear',
      main_image: 'https://storage.test/updated.png',
      images: [],
      description: '',
      sizes: [],
      specifications: [],
      stock: 0,
      shipping_length_cm: 20,
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
      catalog_section: 'Tenis Hombre',
      main_image: 'https://storage.test/main.png',
    };

    await expect(normalizeProductPayload({ ...basePayload, price: -1 })).rejects.toThrow('mayor o igual a 0');
    await expect(normalizeProductPayload({ ...basePayload, stock: 1.5 })).rejects.toThrow('entero');
    await expect(normalizeProductPayload({ ...basePayload, category_id: 'not-a-uuid' })).rejects.toThrow('categoría');
    await expect(normalizeProductPayload({ ...basePayload, catalog_section: 'Infantil' })).rejects.toThrow('sección del catálogo');
    await expect(normalizeProductPayload({ ...basePayload, images: Array.from({ length: 20 }, (_, index) => `image-${index}`) })).rejects.toThrow('hasta 19 imágenes');
    expect(supabaseMocks.from).not.toHaveBeenCalled();
  });

  it('accepts nineteen gallery images plus the main image', async () => {
    const basePayload = {
      name: 'Nike Air Force 1',
      brand: 'Nike',
      price: 199900,
      stock: 12,
      sku: 'NKE-AF1-001',
      category_id: categoryId,
      catalog_section: 'Tenis Hombre',
      main_image: 'https://storage.test/main.png',
    };
    const images = Array.from({ length: 19 }, (_, index) => `https://storage.test/gallery-${index}.png`);
    await expect(normalizeProductPayload({ ...basePayload, images })).resolves.toMatchObject({
      main_image: 'https://storage.test/main.png',
      images,
    });
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

  it('rejects non-text descriptions instead of stringifying untrusted objects', async () => {
    await expect(normalizeProductPayload({ name: 'Producto', description: { html: '<script>' } }))
      .rejects.toThrow('La descripción debe ser texto.');
    expect(supabaseMocks.from).not.toHaveBeenCalled();
  });

  it('rejects invalid shipping dimensions and non-integer mass or guide quantity', async () => {
    await expect(normalizeProductPayload({ shipping_length_cm: 0 })).rejects.toThrow('debe ser un número positivo');
    await expect(normalizeProductPayload({ shipping_weight_grams: 1.2 })).rejects.toThrow('entero');
    await expect(normalizeProductPayload({ shipping_units_per_guide: 1.5 })).rejects.toThrow('entero');
  });

  it('removes blank values from sizes and empty specification rows without reordering', async () => {
    await expect(normalizeProductPayload({
      name: 'Producto',
      sizes: [' 38 ', '', '40 EU'],
      specifications: [
        { name: ' ', value: '' },
        { name: 'Material', value: 'Lona' },
      ],
    })).resolves.toMatchObject({
      sizes: ['38', '40 EU'],
      specifications: [{ name: 'Material', value: 'Lona' }],
    });
  });

  it.each([
    { sizes: ['38', ' 38 '], message: 'tallas duplicadas' },
    { sizes: [38], message: 'Cada talla debe ser texto' },
    { specifications: [{ name: 'Material', value: '' }], message: 'Completa el nombre y el valor' },
    { specifications: [{ name: 'Color', value: 'Blanco' }, { name: ' color ', value: 'Negro' }], message: 'nombres de especificación duplicados' },
  ])('rejects invalid product information: $message', async (fields) => {
    await expect(normalizeProductPayload({ name: 'Producto', ...fields })).rejects.toThrow(fields.message);
  });
});