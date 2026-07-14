import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { HttpError } from '../middlewares/error-handler.js';
import { buildPaginationMeta } from '../utils/pagination.js';

export interface ProductFilters {
  search?: string;
  category?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  onSale?: boolean;
  rating?: number;
  sortBy?: 'name' | 'price' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
  page: number;
  limit: number;
}

export class ProductService {
  async list(filters: ProductFilters) {
    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      status: 'ACTIVE',
      ...(filters.search ? { name: { contains: filters.search, mode: 'insensitive' } } : {}),
      ...(filters.category ? { category: { slug: filters.category } } : {}),
      ...(filters.brand ? { brand: { slug: filters.brand } } : {}),
      ...(filters.minPrice !== undefined || filters.maxPrice !== undefined ? {
        price: {
          ...(filters.minPrice !== undefined ? { gte: filters.minPrice } : {}),
          ...(filters.maxPrice !== undefined ? { lte: filters.maxPrice } : {}),
        },
      } : {}),
      ...(filters.inStock ? { stock: { gt: 0 } } : {}),
      ...(filters.onSale ? { compareAtPrice: { not: null } } : {}),
    };

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: { category: true, brand: true, images: true },
        orderBy: filters.sortBy ? { [filters.sortBy]: filters.sortOrder ?? 'desc' } as Prisma.ProductOrderByWithRelationInput : { createdAt: 'desc' },
        skip: (filters.page - 1) * filters.limit,
        take: filters.limit,
      }),
      prisma.product.count({ where }),
    ]);

    return {
      data: products,
      meta: buildPaginationMeta(filters.page, filters.limit, total),
    };
  }

  async getBySlug(slug: string) {
    const product = await prisma.product.findFirst({
      where: { slug, deletedAt: null, status: 'ACTIVE' },
      include: { category: true, brand: true, images: true, variants: true },
    });

    if (!product) {
      throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
    }

    return product;
  }

  async getFeatured() {
    return prisma.product.findMany({
      where: { deletedAt: null, status: 'ACTIVE' },
      include: { category: true, brand: true, images: true },
      take: 8,
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(payload: { name: string; slug: string; sku: string; description?: string; price: number; compareAtPrice?: number; status: string; stock: number; categoryId: string; brandId: string }) {
    const existing = await prisma.product.findFirst({ where: { OR: [{ slug: payload.slug }, { sku: payload.sku }] } });
    if (existing) {
      throw new HttpError(409, 'PRODUCT_EXISTS', 'Product with same slug or SKU already exists');
    }

    return prisma.product.create({
      data: {
        ...payload,
        price: payload.price,
        compareAtPrice: payload.compareAtPrice ?? null,
        status: payload.status as 'ACTIVE' | 'INACTIVE' | 'DRAFT',
        stock: payload.stock,
      },
    });
  }

  async update(productId: string, payload: Record<string, unknown>) {
    return prisma.product.update({ where: { id: productId }, data: payload });
  }

  async remove(productId: string) {
    return prisma.product.update({ where: { id: productId }, data: { deletedAt: new Date() } });
  }
}
