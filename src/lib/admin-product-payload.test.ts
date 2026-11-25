import { describe, expect, it, vi } from 'vitest';
import { buildAdminProductPayload, runAdminProductSubmission } from './admin-product-payload';

const product = {
  name: 'Tenis Rapidos',
  brand: 'Marca Test',
  price: 120000,
  originalPrice: 150000,
  stock: 7,
  sku: 'TEST-7',
  category: 'Running',
  categoryId: '11111111-1111-1111-1111-111111111111',
  catalogSection: 'Tenis Hombre',
  image: 'https://images.example/main.jpg',
  images: ['https://images.example/main.jpg', 'https://images.example/side.jpg'],
  description: 'Material resistente\nPara entrenamiento.',
  sizes: ['7.5', '40 EU'],
  specifications: [{ name: 'Material', value: 'Cuero sintetico' }],
  shippingWeightGrams: 1000,
  shippingLengthCm: 20,
  shippingWidthCm: 20,
  shippingHeightCm: 10,
  shippingDeclaredValueCop: 1000,
  shippingUnitsPerGuide: 1,
  slug: 'tenis-rapidos-test-7',
};

describe('admin product API payload', () => {
  it('maps form values to database API columns without double-encoding the gallery', () => {
    const payload = buildAdminProductPayload({
      ...product,
      slug: undefined,
      modelId: '22222222-2222-2222-2222-222222222222',
      colorHex: '#A7ADB4',
      colorHex2: '#D6DADE',
      modelSortOrder: 2,
      isDefaultColor: true,
    }, true);

    expect(payload).toMatchObject({
      slug: 'tenis-rapidos-test-7-color-a7adb4',
      name: 'Tenis Rapidos',
      brand: 'Marca Test',
      price: 120000,
      compare_at_price: 150000,
      stock: 7,
      sku: 'TEST-7',
      model_id: '22222222-2222-2222-2222-222222222222',
      color_hex: '#A7ADB4',
      color_hex2: '#D6DADE',
      model_sort_order: 2,
      is_default_color: true,
      category_id: '11111111-1111-1111-1111-111111111111',
      catalog_section: 'Tenis Hombre',
      main_image: 'https://images.example/main.jpg',
      images: ['https://images.example/main.jpg', 'https://images.example/side.jpg'],
      description: 'Material resistente\nPara entrenamiento.',
      sizes: ['7.5', '40 EU'],
      specifications: [{ name: 'Material', value: 'Cuero sintetico' }],
      shipping_weight_grams: 1000,
      shipping_length_cm: 20,
      shipping_width_cm: 20,
      shipping_height_cm: 10,
      shipping_declared_value_cop: 1000,
      shipping_units_per_guide: 1,
      is_active: true,
    });
    expect(payload).not.toHaveProperty('color_name');
    expect(Array.isArray(payload.images)).toBe(true);
    expect(Array.isArray(payload.sizes)).toBe(true);
    expect(Array.isArray(payload.specifications)).toBe(true);
    expect((payload.images as unknown[]).every((image) => typeof image === 'string')).toBe(true);
    expect(typeof payload.images).not.toBe('string');
  });

  it('sends multiline description and string sizes on product creation', () => {
    const payload = buildAdminProductPayload(product, true);

    expect(payload.description).toBe('Material resistente\nPara entrenamiento.');
    expect(payload.sizes).toEqual(['7.5', '40 EU']);
    expect(Array.isArray(payload.sizes)).toBe(true);
  });

  it('builds a slug when creating a product whose form has no slug field', () => {
    expect(buildAdminProductPayload({ ...product, slug: undefined }).slug).toBe('tenis-rapidos-test-7');
  });

  it('uses HEX token for variant slug uniqueness when a model is linked', () => {
    expect(buildAdminProductPayload({
      ...product,
      slug: undefined,
      modelId: '22222222-2222-2222-2222-222222222222',
      colorHex: '#A7ADB4',
    }).slug).toContain('color-a7adb4');
  });

  it('omits untouched optional fields from partial updates but keeps explicit clears', () => {
    const untouched = buildAdminProductPayload({ name: product.name, sku: product.sku });
    expect(untouched).not.toHaveProperty('description');
    expect(untouched).not.toHaveProperty('sizes');
    expect(untouched).not.toHaveProperty('specifications');
    expect(untouched).not.toHaveProperty('images');
    expect(untouched).not.toHaveProperty('model_id');
    expect(untouched).not.toHaveProperty('color_name');
    expect(untouched).not.toHaveProperty('color_hex');
    expect(untouched).not.toHaveProperty('is_default_color');

    const clears = buildAdminProductPayload({ description: '', sizes: [], specifications: [], images: [] });
    expect(clears).toMatchObject({ description: '', sizes: [], specifications: [], images: [] });
  });
});

describe('admin product form submission', () => {
  it('keeps the current form state when the API rejects the save', async () => {
    const uiState = { drawerOpen: true, formName: 'Tenis Rapidos', refreshCount: 0 };
    const apiError = Object.assign(new Error('API rejected'), { code: '23514', details: 'Constraint details', hint: 'Check payload' });
    const save = vi.fn().mockRejectedValue(apiError);
    const onSuccess = vi.fn(() => {
      uiState.drawerOpen = false;
      uiState.formName = '';
      uiState.refreshCount++;
    });
    const onError = vi.fn();

    await runAdminProductSubmission(save, onSuccess, onError);

    expect(onSuccess).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledWith(apiError);
    expect(uiState).toEqual({ drawerOpen: true, formName: 'Tenis Rapidos', refreshCount: 0 });
  });

  it('runs refresh and close actions only after the API confirms success', async () => {
    const savedProduct = { id: 'product-1' };
    const save = vi.fn().mockResolvedValue(savedProduct);
    const onSuccess = vi.fn();
    const onError = vi.fn();

    await runAdminProductSubmission(save, onSuccess, onError);

    expect(save).toHaveBeenCalledOnce();
    expect(onSuccess).toHaveBeenCalledWith(savedProduct);
    expect(onError).not.toHaveBeenCalled();
  });
});
