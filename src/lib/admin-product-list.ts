import type { Product } from '../types/domain';

export type AdminProductStatusFilter = 'all' | 'active' | 'inactive';

export function filterAdminProducts(
  products: Product[],
  searchTerm: string,
  statusFilter: AdminProductStatusFilter,
  categoryIdFilter = 'all',
): Product[] {
  const normalizedSearch = searchTerm.trim().toLowerCase();

  return products.filter((product) => {
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'active' && product.isActive !== false)
      || (statusFilter === 'inactive' && product.isActive === false);
    const matchesSearch = !normalizedSearch || [product.name, product.brand, product.sku, product.category]
      .some((value) => value.toLowerCase().includes(normalizedSearch));
    const matchesCategory = categoryIdFilter === 'all' || product.categoryId === categoryIdFilter;

    return matchesStatus && matchesSearch && matchesCategory;
  });
}