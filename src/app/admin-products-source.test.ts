import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('./App.tsx', import.meta.url), 'utf8');

describe('admin products table data source', () => {
  it('waits for session recovery before applying the admin route guard', () => {
    expect(appSource).toContain('void syncSession();');
    expect(appSource).toContain('subscription = onAuthStateChange');
    expect(appSource).toContain('if (!authReady) return;');
  });

  it('routes only after profile access has been resolved and clears admin state on logout', () => {
    expect(appSource).toContain('onNavigate(profileAccess.isAdmin ? "admin" : "home")');
    expect(appSource).toContain('if (!isAdmin && view === "admin")');
    expect(appSource).toContain('setAuthUser(null);');
    expect(appSource).toContain('setIsAdmin(false);');
  });

  it('passes only the protected admin product state to AdminDashboard', () => {
    const dashboard = appSource.match(/<AdminDashboard\b([\s\S]*?)\/>/);

    expect(dashboard?.[1]).toContain('products={adminProducts}');
    expect(dashboard?.[1]).not.toContain('products={products}');
  });

  it('loads and refreshes the table through the admin API, not the public catalog', () => {
    const adminLoader = appSource.match(/if \(!authReady \|\| !isAdmin \|\| view !== "admin"\) return;([\s\S]*?)\}, \[authReady, isAdmin, view, productRefresh, categoryOptions\]\);/);

    expect(adminLoader?.[1]).toContain('adminApi.fetchProducts()');
    expect(adminLoader?.[1]).toContain('setAdminProducts([])');
    expect(adminLoader?.[1]).toContain('setAdminProductsStatus("error")');
    expect(adminLoader?.[1]).not.toContain('fetch(`${apiUrl}/products`)');
  });

  it('has explicit loading, error, retry, and empty states', () => {
    expect(appSource).toContain('productsStatus === "loading"');
    expect(appSource).toContain('productsError ??');
    expect(appSource).toContain('onRetryProducts');
    expect(appSource).toContain('paginatedProducts.length === 0 ?');
  });

  it('maps availability and exposes status filters and row actions', () => {
    expect(appSource).toContain('isActive: record.is_active !== false');
    expect(appSource).toContain('<option value="all">Todos</option>');
    expect(appSource).toContain('<option value="active">Activos</option>');
    expect(appSource).toContain('<option value="inactive">Inactivos</option>');
    expect(appSource).toContain("'Estado'");
    expect(appSource).toContain('Desactivar producto');
    expect(appSource).toContain('Activar producto');
    expect(appSource).toContain('window.confirm(`${action}');
    expect(appSource).toContain('Producto desactivado correctamente');
    expect(appSource).toContain('Producto activado correctamente');
  });

  it('updates the admin row locally through the minimal status API', () => {
    const statusUpdater = appSource.match(/const setProductActive = async[\s\S]*?\n  };/);

    expect(statusUpdater?.[0]).toContain('updateProductAvailabilityApi(productId, isActive)');
    expect(statusUpdater?.[0]).toContain('setAdminProducts((current) => current.map');
    expect(statusUpdater?.[0]).not.toContain('refreshProducts()');
  });

  it('shows category and creation date while using a no-overflow mobile card layout', () => {
    expect(appSource).toContain("['Imagen', 'Nombre', 'Marca', 'Categoría', 'Precio', 'Stock', 'Estado', 'Creado', 'Acciones']");
    expect(appSource).toContain('createdAt: record.created_at ?? record.updated_at ?? undefined');
    expect(appSource).toContain('2xl:hidden');
    expect(appSource).toContain('<article key={p.id} className="min-w-0 rounded-lg');
    expect(appSource).toContain('break-words text-xs text-slate-600">{p.brand} · {p.category');
  });

  it('offers safe logical deletion with an explicit relationship warning and pending state', () => {
    expect(appSource).toContain('handleSafeProductDelete');
    expect(appSource).toContain('softDeleteProduct(product.id)');
    expect(appSource).toContain('imágenes, las variantes y las referencias de carritos y pedidos');
    expect(appSource).toContain('Eliminar de forma segura');
    expect(appSource).toContain('Eliminando…');
    expect(appSource).toContain('Producto eliminado de forma segura y conservado como inactivo.');
    expect(appSource).toContain('adminApi.deleteProductApi(productId)');
  });

  it('marks an authenticated admin avatar with A while preserving the regular user initial', () => {
    expect(appSource).toContain('{isAdmin ? "A" : "V"}');
  });
});