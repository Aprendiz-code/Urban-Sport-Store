import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  audit: vi.fn(),
  dashboard: vi.fn(),
  homeContent: vi.fn(),
  categories: vi.fn(),
  category: vi.fn(),
  products: vi.fn(),
  product: vi.fn(),
  productImages: vi.fn(),
}));

vi.mock('../../lib/api-handlers/admin/audit.ts', () => ({ default: mocks.audit }));
vi.mock('../../lib/api-handlers/admin/dashboard.ts', () => ({ default: mocks.dashboard }));
vi.mock('../../lib/api-handlers/admin/home-content.ts', () => ({ default: mocks.homeContent }));
vi.mock('../../lib/api-handlers/admin/categories/index.ts', () => ({ default: mocks.categories }));
vi.mock('../../lib/api-handlers/admin/categories/[categoryId].ts', () => ({ default: mocks.category }));
vi.mock('../../lib/api-handlers/admin/products/index.ts', () => ({ default: mocks.products }));
vi.mock('../../lib/api-handlers/admin/products/[productId].ts', () => ({ default: mocks.product }));
vi.mock('../../lib/api-helpers/product-image-upload.ts', () => ({ handleProductImageUpload: mocks.productImages }));

import adminHandler from '../../lib/api-helpers/admin-dispatch.js';

function createRequest(method: string, url: string, body?: unknown, query: Record<string, string | string[]> = {}) {
  return {
    method,
    url,
    headers: { authorization: 'Bearer local-test-token', 'content-type': 'application/json' },
    body,
    query,
    on: vi.fn(),
  } as unknown as Parameters<typeof adminHandler>[0];
}

function createResponse() {
  const headers = new Map<string, string>();
  const response = {
    statusCode: 200,
    headers,
    body: undefined as string | undefined,
    setHeader(name: string, value: string) { headers.set(name.toLowerCase(), value); },
    end(body?: string) { this.body = body; },
  };
  return { response: response as unknown as Parameters<typeof adminHandler>[1], ...response };
}

beforeEach(() => Object.values(mocks).forEach((mock) => mock.mockReset()));

describe('admin route dispatcher', () => {
  it.each([
    ['/api/admin/audit', 'GET', mocks.audit],
    ['/api/admin/dashboard', 'GET', mocks.dashboard],
    ['/api/admin/home-content', 'PATCH', mocks.homeContent],
    ['/api/admin/categories', 'GET', mocks.categories],
    ['/api/admin/categories/category-1', 'PATCH', mocks.category],
    ['/api/admin/products', 'GET', mocks.products],
    ['/api/admin/products/product-1', 'PATCH', mocks.product],
  ])('dispatches %s by pathname', async (url, method, target) => {
    const request = createRequest(method, url);
    const { response } = createResponse();

    await adminHandler(request, response);

    expect(target).toHaveBeenCalledWith(request, response);
  });

  it('keeps path routing authoritative over query values and preserves request data', async () => {
    const body = { category_id: 'body-id' };
    const query = { id: 'query-id', __adminRoute: 'dashboard', filter: ['active', 'inactive'] };
    const url = '/api/admin/products/path-id?id=query-id&__adminRoute=dashboard&filter=active&filter=inactive';
    const request = createRequest('PATCH', url, body, query);
    const { response } = createResponse();

    await adminHandler(request, response);

    expect(mocks.product).toHaveBeenCalledWith(request, response);
    expect(mocks.dashboard).not.toHaveBeenCalled();
    expect(request.url).toBe(url);
    expect(request.query).toBe(query);
    expect(request.body).toBe(body);
    expect(request.headers.authorization).toBe('Bearer local-test-token');
  });

  it('dispatches the product image alias without consuming the request body', async () => {
    const body = Buffer.from('synthetic image stream');
    const request = createRequest('POST', '/api/admin/product-images', body);
    const { response } = createResponse();

    await adminHandler(request, response);

    expect(mocks.productImages).toHaveBeenCalledWith(request, response);
    expect(request.body).toBe(body);
    expect(request.on).not.toHaveBeenCalled();
  });

  it('rejects product DELETE before invoking a handler', async () => {
    const { response, headers } = createResponse();
    await adminHandler(createRequest('DELETE', '/api/admin/products/product-1'), response);

    expect(response.statusCode).toBe(405);
    expect(headers.get('allow')).toBe('PATCH');
    expect(mocks.product).not.toHaveBeenCalled();
    expect(mocks.products).not.toHaveBeenCalled();
  });

  it.each(['/api/admin/_root', '/api/admin/unknown', '/api/admin/products/id/extra'])('returns JSON 404 for %s', async (url) => {
    const { response, headers } = createResponse();
    await adminHandler(createRequest('GET', url), response);

    expect(response.statusCode).toBe(404);
    expect(headers.get('content-type')).toBe('application/json');
  });
});