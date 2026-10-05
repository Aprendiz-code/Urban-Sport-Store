import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProductViaAdminApi, deleteProductViaAdminApi, updateProductViaAdminApi } from '../admin-product-fallback';
import adminApi from '../admin-api';
import { uploadProductImage } from '../supabase-store';
import { clearLocalAuthSession, getAccessToken } from '../supabase-auth';

vi.mock('../supabase-auth', () => ({
  clearLocalAuthSession: vi.fn(),
  getAccessToken: vi.fn(),
}));

function successfulResponse(status: number, data: unknown) {
  return {
    ok: true,
    status,
    json: async () => ({ ok: true, data }),
  };
}

describe('authenticated admin API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getAccessToken).mockResolvedValue('current-admin-token');
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('loads the admin products endpoint with the current Bearer token', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(successfulResponse(200, [{ id: 'admin-1' }]) as Response);

    await expect(adminApi.fetchProducts()).resolves.toEqual([{ id: 'admin-1' }]);

    const [url, options] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(new URL(String(url), 'http://localhost').pathname).toBe('/api/admin/products');
    expect(options?.method).toBe('GET');
    expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer current-admin-token');
  });

  it('unwraps the data envelope returned directly by API handlers', async () => {
    const products = [{ id: 'admin-1' }, { id: 'admin-2' }];
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ data: products }),
    } as Response);

    await expect(adminApi.fetchProducts()).resolves.toEqual(products);
  });

  it('uses the authenticated client for create, edit, archive, and image upload', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(successfulResponse(201, { id: 'created-1' }) as Response)
      .mockResolvedValueOnce(successfulResponse(200, { id: 'product-1' }) as Response)
      .mockResolvedValueOnce({ ok: true, status: 204 } as Response)
      .mockResolvedValueOnce(successfulResponse(201, { path: 'products/image.png' }) as Response);
    const image = new Blob(['image'], { type: 'image/png' }) as File;

    await createProductViaAdminApi({ name: 'Producto' });
    await updateProductViaAdminApi('product-1', { name: 'Editado' });
    await deleteProductViaAdminApi('product-1');
    await uploadProductImage(image);

    const requests = vi.mocked(fetch).mock.calls.map(([url, options]) => ({
      path: new URL(String(url), 'http://localhost').pathname,
      method: options?.method,
      headers: new Headers(options?.headers),
    }));
    expect(requests.map(({ method }) => method)).toEqual(['POST', 'PATCH', 'DELETE', 'POST']);
    expect(requests.slice(0, 3).map(({ path }) => path)).toEqual([
      '/api/admin/products',
      '/api/admin/products/product-1',
      '/api/admin/products/product-1',
    ]);
    expect(requests[3].path).toBe('/api/admin/product-images');
    for (const request of requests) {
      expect(request.headers.get('Authorization')).toBe('Bearer current-admin-token');
    }
    expect(requests[3].headers.get('Content-Type')).toBe('image/png');
  });

  it('sends availability changes as an authenticated minimal PATCH payload', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(successfulResponse(200, { id: 'product-1', is_active: false }) as Response);

    await expect(adminApi.updateProductAvailabilityApi('product-1', false)).resolves.toEqual({ id: 'product-1', is_active: false });

    const [url, options] = vi.mocked(fetch).mock.calls[0] ?? [];
    expect(new URL(String(url), 'http://localhost').pathname).toBe('/api/admin/products/product-1');
    expect(options?.method).toBe('PATCH');
    expect(JSON.parse(String(options?.body))).toEqual({ is_active: false });
    expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer current-admin-token');
  });

  it('does not send a request when there is no session', async () => {
    vi.mocked(getAccessToken).mockResolvedValueOnce(null);

    await expect(adminApi.fetchProducts()).rejects.toMatchObject({
      code: 'ADMIN_SESSION_REQUIRED',
      message: expect.stringContaining('Sesión administrativa requerida'),
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('renews after 401 and retries the request once with the renewed token', async () => {
    vi.mocked(getAccessToken)
      .mockResolvedValueOnce('expiring-token')
      .mockResolvedValueOnce('renewed-token');
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'Unauthorized' } as Response)
      .mockResolvedValueOnce(successfulResponse(200, [{ id: 'admin-1' }]) as Response);

    await expect(adminApi.fetchProducts()).resolves.toEqual([{ id: 'admin-1' }]);

    expect(getAccessToken).toHaveBeenNthCalledWith(1);
    expect(getAccessToken).toHaveBeenNthCalledWith(2, true);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer expiring-token');
    expect(new Headers(vi.mocked(fetch).mock.calls[1][1]?.headers).get('Authorization')).toBe('Bearer renewed-token');
  });

  it('requires a session after a persistent 401 and never makes a third request', async () => {
    vi.mocked(getAccessToken)
      .mockResolvedValueOnce('expiring-token')
      .mockResolvedValueOnce('renewed-token');
    vi.mocked(fetch)
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'Unauthorized' } as Response)
      .mockResolvedValueOnce({ ok: false, status: 401, text: async () => 'Unauthorized' } as Response);

    await expect(adminApi.createProductApi({ name: 'Producto' })).rejects.toMatchObject({
      code: 'ADMIN_SESSION_REQUIRED',
      message: expect.stringContaining('Sesión administrativa requerida'),
    });
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(clearLocalAuthSession).toHaveBeenCalledOnce();
  });

  it('reports 403 as a permission error without retrying', async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ error: { code: 'FORBIDDEN', message: 'No autorizado.' } }),
    } as Response);

    await expect(adminApi.fetchProducts()).rejects.toMatchObject({
      code: 'FORBIDDEN',
      message: expect.stringContaining('No tienes permisos'),
    });
    expect(fetch).toHaveBeenCalledOnce();
  });

  it('does not print the access token to logs', async () => {
    const logSpies = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
    ];
    vi.mocked(fetch).mockResolvedValueOnce(successfulResponse(200, []) as Response);

    await adminApi.fetchProducts();

    for (const spy of logSpies) {
      expect(spy.mock.calls.flat().join(' ')).not.toContain('current-admin-token');
      spy.mockRestore();
    }
  });
});