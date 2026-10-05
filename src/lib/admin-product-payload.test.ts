import { describe, expect, it, vi } from 'vitest';
import { buildAdminProductPayload, runAdminProductSubmission } from './admin-product-payload';

const product = {
  name: 'Tenis Rápidos',
  brand: 'Marca Test',
  price: 120000,
  originalPrice: 150000,
  stock: 7,
  sku: 'TEST-7',
  category: 'Running',
  categoryId: '11111111-1111-1111-1111-111111111111',
  image: 'https://images.example/main.jpg',
  images: ['https://images.example/main.jpg', 'https://images.example/side.jpg'],
  description: 'Material resistente\nPara entrenamiento.',
  sizes: ['7.5', '40 EU'],
  specifications: [{ name: 'Material', value: 'Cuero sintético' }],
  slug: 'tenis-rapidos-test-7',
};

describe('admin product API payload', () => {
  it('maps form values to database API columns without double-encoding the gallery', () => {
    const payload = buildAdminProductPayload(product, true);

    expect(payload).toMatchObject({
      slug: 'tenis-rapidos-test-7',
      name: 'Tenis Rápidos',
      brand: 'Marca Test',
      price: 120000,
      compare_at_price: 150000,
      stock: 7,
      sku: 'TEST-7',
      category_id: '11111111-1111-1111-1111-111111111111',
      main_image: 'https://images.example/main.jpg',
      images: ['https://images.example/main.jpg', 'https://images.example/side.jpg'],
      description: 'Material resistente\nPara entrenamiento.',
      sizes: ['7.5', '40 EU'],
      specifications: [{ name: 'Material', value: 'Cuero sintético' }],
      is_active: true,
    });
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

  it('omits untouched optional fields from partial updates but keeps explicit clears', () => {
    const untouched = buildAdminProductPayload({ name: product.name, sku: product.sku });
    expect(untouched).not.toHaveProperty('description');
    expect(untouched).not.toHaveProperty('sizes');
    expect(untouched).not.toHaveProperty('specifications');
    expect(untouched).not.toHaveProperty('images');

    const clears = buildAdminProductPayload({ description: '', sizes: [], specifications: [], images: [] });
    expect(clears).toMatchObject({ description: '', sizes: [], specifications: [], images: [] });
  });
});

describe('admin product form submission', () => {
  it('keeps the current form state when the API rejects the save', async () => {
    const uiState = { drawerOpen: true, formName: 'Tenis Rápidos', refreshCount: 0 };
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
    expect(uiState).toEqual({ drawerOpen: true, formName: 'Tenis Rápidos', refreshCount: 0 });
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