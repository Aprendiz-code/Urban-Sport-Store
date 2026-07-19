import { Prisma } from '@prisma/client';
import { prisma } from '../db/prisma.js';
import { HttpError } from '../middlewares/error-handler.js';
import { buildPaginationMeta } from '../utils/pagination.js';
import { ProductMemoryService } from './product-memory.service.js';

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
  private shouldUseFallback(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error ?? '');
    return /econnrefused|timeout|p1001|p1002|p1003|connect|network|fetch failed|database|prisma/i.test(message);
  }

  private async useDatabaseOrFallback<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (this.shouldUseFallback(error)) {
        throw new Error('FALLBACK_REQUIRED');
      }
      throw error;
    }
  }

  private normalizeFallbackProduct(product: any) {
    return {
      ...product,
      category: product.category ? { name: product.category, slug: String(product.category).toLowerCase() } : null,
      brand: product.brand ? { name: product.brand, slug: String(product.brand).toLowerCase() } : null,
      images: product.images ?? [],
    };
  }

  private async listFromFallback(filters: ProductFilters) {
    const { data, total } = ProductMemoryService.findAll(filters.limit, (filters.page - 1) * filters.limit);
    const filtered = data.filter((product) => {
      const productName = product.name?.toLowerCase() ?? '';
      const productCategory = product.category?.toLowerCase() ?? '';
      const productBrand = product.brand?.toLowerCase() ?? '';
      const matchesSearch = !filters.search || productName.includes(filters.search.toLowerCase());
      const matchesCategory = !filters.category || productCategory === filters.category.toLowerCase();
      const matchesBrand = !filters.brand || productBrand === filters.brand.toLowerCase();
      const matchesPrice = (filters.minPrice === undefined || product.price >= filters.minPrice) &&
        (filters.maxPrice === undefined || product.price <= filters.maxPrice);
      const matchesStock = !filters.inStock || (product.stock ?? 0) > 0;
      const matchesSale = !filters.onSale || Boolean(product.compareAtPrice);
      return matchesSearch && matchesCategory && matchesBrand && matchesPrice && matchesStock && matchesSale;
    });

    return {
      data: filtered.map((product) => this.normalizeFallbackProduct(product)),
      meta: buildPaginationMeta(filters.page, filters.limit, total),
    };
  }

  async list(filters: ProductFilters) {
    try {
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
    } catch (error) {
      if (this.shouldUseFallback(error) || (error instanceof Error && error.message === 'FALLBACK_REQUIRED')) {
        return this.listFromFallback(filters);
      }
      throw error;
    }
  }

  async getBySlug(slug: string) {
    try {
      const product = await this.useDatabaseOrFallback(() => prisma.product.findFirst({
        where: { slug, deletedAt: null, status: 'ACTIVE' },
        include: { category: true, brand: true, images: true, variants: true },
      }));

      if (!product) {
        throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
      }

      return product;
    } catch (error) {
      if (this.shouldUseFallback(error) || (error instanceof Error && error.message === 'FALLBACK_REQUIRED')) {
        const fallbackProduct = ProductMemoryService.findBySlug(slug);
        if (!fallbackProduct) {
          throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
        }
        return this.normalizeFallbackProduct(fallbackProduct);
      }
      throw error;
    }
  }

  async getFeatured() {
    try {
      return await this.useDatabaseOrFallback(() => prisma.product.findMany({
        where: { deletedAt: null, status: 'ACTIVE' },
        include: { category: true, brand: true, images: true },
        take: 8,
        orderBy: { createdAt: 'desc' },
      }));
    } catch (error) {
      if (this.shouldUseFallback(error) || (error instanceof Error && error.message === 'FALLBACK_REQUIRED')) {
        const { data } = ProductMemoryService.findAll(8, 0);
        return data.map((product) => this.normalizeFallbackProduct(product));
      }
      throw error;
    }
  }

  async create(payload: { name: string; slug: string; sku: string; description?: string; price: number; compareAtPrice?: number; status: string; stock: number; categoryId: string; brandId: string }) {
    try {
      const existing = await this.useDatabaseOrFallback(() => prisma.product.findFirst({ where: { OR: [{ slug: payload.slug }, { sku: payload.sku }] } }));
      if (existing) {
        throw new HttpError(409, 'PRODUCT_EXISTS', 'Product with same slug or SKU already exists');
      }

      return await this.useDatabaseOrFallback(() => prisma.product.create({
        data: {
          ...payload,
          price: payload.price,
          compareAtPrice: payload.compareAtPrice ?? null,
          status: payload.status as 'ACTIVE' | 'INACTIVE' | 'DRAFT',
          stock: payload.stock,
        },
      }));
    } catch (error) {
      if (this.shouldUseFallback(error) || (error instanceof Error && error.message === 'FALLBACK_REQUIRED')) {
        return ProductMemoryService.create({
          name: payload.name,
          slug: payload.slug,
          sku: payload.sku,
          description: payload.description ?? '',
          price: payload.price,
          compareAtPrice: payload.compareAtPrice ?? null,
          stock: payload.stock,
          status: payload.status ?? 'ACTIVE',
          categoryId: payload.categoryId,
          brandId: payload.brandId,
          category: payload.categoryId ? `category-${payload.categoryId}` : undefined,
          brand: payload.brandId ? `brand-${payload.brandId}` : undefined,
        });
      }
      throw error;
    }
  }

  async update(productId: string, payload: Record<string, unknown>) {
    try {
      return await this.useDatabaseOrFallback(() => prisma.product.update({ where: { id: productId }, data: payload }));
    } catch (error) {
      if (this.shouldUseFallback(error) || (error instanceof Error && error.message === 'FALLBACK_REQUIRED')) {
        const updated = ProductMemoryService.update(productId, payload as any);
        if (!updated) {
          throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
        }
        return updated;
      }
      throw error;
    }
  }

  async remove(productId: string) {
    try {
      return await this.useDatabaseOrFallback(() => prisma.product.update({ where: { id: productId }, data: { deletedAt: new Date() } }));
    } catch (error) {
      if (this.shouldUseFallback(error) || (error instanceof Error && error.message === 'FALLBACK_REQUIRED')) {
        const removed = ProductMemoryService.delete(productId);
        if (!removed) {
          throw new HttpError(404, 'PRODUCT_NOT_FOUND', 'Product not found');
        }
        return { id: productId, deletedAt: new Date() };
      }
      throw error;
    }
  }
}
