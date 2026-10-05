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
});