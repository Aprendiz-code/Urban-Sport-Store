import { beforeEach, describe, expect, it, vi } from 'vitest';

const prismaMock = vi.hoisted(() => ({
  product: {
    findFirst: vi.fn(),
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('../db/prisma.js', () => ({ prisma: prismaMock }));

import { ProductService } from '../services/product.service.js';

describe('ProductService fallback mode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prismaMock.product.findFirst.mockRejectedValue(new Error('connect ECONNREFUSED'));
    prismaMock.product.create.mockRejectedValue(new Error('connect ECONNREFUSED'));
    prismaMock.product.findMany.mockRejectedValue(new Error('connect ECONNREFUSED'));
    prismaMock.product.count.mockRejectedValue(new Error('connect ECONNREFUSED'));
    prismaMock.product.update.mockRejectedValue(new Error('connect ECONNREFUSED'));
  });

  it('returns products from memory when the database is unavailable', async () => {
    const service = new ProductService();
    const created = await service.create({
      name: 'Fallback Product',
      slug: 'fallback-product',
      sku: 'FB-001',
      price: 129000,
      stock: 5,
      status: 'ACTIVE',
      categoryId: 'cat-1',
      brandId: 'brand-1',
    });

    const result = await service.list({ page: 1, limit: 10 });

    expect(created).toBeDefined();
    expect(result.data.some((product: any) => product.name === 'Fallback Product')).toBe(true);
  });
});
