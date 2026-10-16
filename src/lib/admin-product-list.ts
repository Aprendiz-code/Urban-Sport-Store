import type { Product } from '../types/domain';

export type AdminProductStatusFilter = 'all' | 'active' | 'inactive';

export function filterAdminProducts(
  products: Product[],
  searchTerm: string,
  statusFilter: AdminProductStatusFilter,
  categoryFilter = 'all',
): Product[] {
  const normalizedSearch = searchTerm.trim().toLowerCase();

  return products.filter((product) => {
    const matchesStatus = statusFilter === 'all'
      || (statusFilter === 'active' && product.isActive !== false)
      || (statusFilter === 'inactive' && product.isActive === false);
    const matchesSearch = !normalizedSearch || [product.name, product.brand, product.sku, product.category]
      .some((value) => value.toLowerCase().includes(normalizedSearch));
    const matchesCategory = categoryFilter === 'all'
      || product.category === categoryFilter
      || product.catalogSection === categoryFilter;

    return matchesStatus && matchesSearch && matchesCategory;
  });
}