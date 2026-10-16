import { describe, expect, it } from 'vitest';
import type { Product } from '../types/domain';
import { filterAdminProducts } from './admin-product-list';

const products: Product[] = [
  {
    id: 'active-1', name: 'Runner Pro', brand: 'Nike', price: 100, rating: 0, reviews: 0,
    image: '', category: 'Running', categoryId: '11111111-1111-1111-1111-111111111111', catalogSection: 'Tenis Hombre', subcategory: '', stock: 4, sku: 'RUN-001', description: '',
    colors: [], sizes: [], isActive: true,
  },
  {
    id: 'inactive-1', name: 'Classic Tee', brand: 'Urban', price: 50, rating: 0, reviews: 0,
    image: '', category: 'Urbano', categoryId: '22222222-2222-2222-2222-222222222222', catalogSection: 'Ropa Hombre', subcategory: '', stock: 0, sku: 'TEE-002', description: '',
    colors: [], sizes: [], isActive: false,
  },
];

describe('admin product list filters', () => {
  it('searches by product name, SKU, and brand without hiding inactive results by default', () => {
    expect(filterAdminProducts(products, 'runner', 'all').map((product) => product.id)).toEqual(['active-1']);
    expect(filterAdminProducts(products, 'tee-002', 'all').map((product) => product.id)).toEqual(['inactive-1']);
    expect(filterAdminProducts(products, 'urban', 'all').map((product) => product.id)).toEqual(['inactive-1']);
    expect(filterAdminProducts(products, '', 'all')).toHaveLength(2);
  });

  it('filters all, active, and inactive products independently', () => {
    expect(filterAdminProducts(products, '', 'active').map((product) => product.id)).toEqual(['active-1']);
    expect(filterAdminProducts(products, '', 'inactive').map((product) => product.id)).toEqual(['inactive-1']);
    expect(filterAdminProducts(products, 'urban', 'active')).toEqual([]);
  });

  it('filters by sports category ID or catalog section', () => {
    expect(filterAdminProducts(products, '', 'all', 'category:11111111-1111-1111-1111-111111111111').map((product) => product.id)).toEqual(['active-1']);
    expect(filterAdminProducts(products, '', 'all', 'section:Tenis Hombre').map((product) => product.id)).toEqual(['active-1']);
    expect(filterAdminProducts(products, '', 'all', 'category:missing')).toEqual([]);
  });
});