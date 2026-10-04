import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  from: vi.fn(),
  insert: vi.fn(),
  select: vi.fn(),
  single: vi.fn(),
  auditInsert: vi.fn(),
  authenticate: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock('../../lib/api-helpers/supabase.js', () => ({
  supabaseAdmin: { from: apiMocks.from },
}));
vi.mock('../../lib/api-helpers/auth.js', () => ({
  requireAuthenticatedUser: apiMocks.authenticate,
}));
vi.mock('../../lib/api-helpers/admin.js', () => ({
  requirePermission: apiMocks.requirePermission,
}));

import handler from '../admin/products/index.js';

const categoryId = '11111111-1111-1111-1111-111111111111';
const createBody = () => ({
  name: 'Producto de prueba local',
  brand: 'Marca local',
  price: 1,
  compare_at_price: 2,
  stock: 1,
  sku: 'TEST-LOCAL-1',
  category_id: categoryId,
  main_image: 'https://storage.example/products/main.png',
  images: ['https://storage.example/products/main.png'],
});

function createRequest(body: Record<string, unknown>) {
  return {
    method: 'POST',
    on(event: string, listener: (...args: any[]) => void) {
      if (event === 'data') queueMicrotask(() => listener(JSON.stringify(body)));
      if (event === 'end') queueMicrotask(() => listener());
      return this;
    },
  };
}

function createResponse() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(name: string, value: string) { this.headers[name] = value; },
    end(body = '') { this.body = body; },
  };
}

describe('admin product create endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.authenticate.mockResolvedValue({ id: 'admin-user' });
    apiMocks.requirePermission.mockResolvedValue('ADMIN');
    apiMocks.insert.mockReturnThis();
    apiMocks.select.mockReturnThis();
    apiMocks.single.mockResolvedValue({
      data: {
        id: 'product-created-1',
        name: 'Producto de prueba local',
        brand: 'Marca local',
        price: 1,
        compare_at_price: 2,
        stock: 1,
        sku: 'TEST-LOCAL-1',
        category_id: categoryId,
        main_image: 'https://storage.example/products/main.png',
        images: ['https://storage.example/products/main.png'],
        is_active: true,
        slug: 'producto-de-prueba-local-test-local-1',
      },
      error: null,
    });
    apiMocks.auditInsert.mockResolvedValue({ data: null, error: null });
    apiMocks.from.mockImplementation((table: string) => table === 'products'
      ? { insert: apiMocks.insert, select: apiMocks.select, single: apiMocks.single }
      : { insert: apiMocks.auditInsert });
  });

  it('returns the persisted row and ID for an authorized valid payload', async () => {
    const response = createResponse();

    await handler(createRequest(createBody()), response);

    expect(apiMocks.requirePermission).toHaveBeenCalledWith({ id: 'admin-user' }, 'products.write');
    expect(apiMocks.insert).toHaveBeenCalledWith([expect.objectContaining({
      name: 'Producto de prueba local',
      brand: 'Marca local',
      price: 1,
      compare_at_price: 2,
      stock: 1,
      sku: 'TEST-LOCAL-1',
      category_id: categoryId,
      main_image: 'https://storage.example/products/main.png',
      images: ['https://storage.example/products/main.png'],
    })]);
    expect(Array.isArray(apiMocks.insert.mock.calls[0][0][0].images)).toBe(true);
    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body).data).toMatchObject({ id: 'product-created-1', is_active: true });
  });

  it('rejects a product without a permanent main image before inserting', async () => {
    const response = createResponse();

    await handler(createRequest({ ...createBody(), main_image: 'blob:https://shop.example/temp', images: [] }), response);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error.message).toContain('URL HTTP o HTTPS permanente');
    expect(apiMocks.insert).not.toHaveBeenCalled();
  });

  it('returns structured foreign-key errors without claiming success', async () => {
    apiMocks.single.mockResolvedValueOnce({
      data: null,
      error: { code: '23503', message: 'foreign key violation', details: 'category_id is unknown', hint: 'Select an existing category.' },
    });
    const response = createResponse();

    await handler(createRequest(createBody()), response);

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.body).error).toMatchObject({
      code: '23503',
      message: 'foreign key violation',
      details: 'category_id is unknown',
      hint: 'Select an existing category.',
    });
    expect(apiMocks.auditInsert).not.toHaveBeenCalled();
  });

  it('maps an existing SKU constraint to HTTP 409', async () => {
    apiMocks.single.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint', details: 'SKU already exists', hint: 'Use a unique SKU.' },
    });
    const response = createResponse();

    await handler(createRequest(createBody()), response);

    expect(response.statusCode).toBe(409);
    expect(JSON.parse(response.body).error.code).toBe('23505');
    expect(apiMocks.auditInsert).not.toHaveBeenCalled();
  });
});