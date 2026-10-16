import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const routeMocks = vi.hoisted(() => ({ handleImageUpload: vi.fn() }));

vi.mock('../../lib/api-helpers/product-image-upload.ts', () => ({
  handleProductImageUpload: routeMocks.handleImageUpload,
}));
vi.mock('../../lib/api-helpers/supabase.ts', () => ({ supabaseAdmin: {} }));
vi.mock('../../lib/api-helpers/auth.ts', () => ({ requireAuthenticatedUser: vi.fn() }));
vi.mock('../../lib/api-helpers/admin.ts', () => ({ requirePermission: vi.fn() }));
vi.mock('../../lib/api-helpers/product-helpers.ts', () => ({ normalizeProductPayload: vi.fn() }));

import handler from '../../lib/api-handlers/admin/products/index.js';

describe('admin product image route consolidation', () => {
  beforeEach(() => vi.clearAllMocks());

  it.each([
    '/api/admin/product-images',
    '/api/admin/products?resource=product-image',
  ])('dispatches %s through the existing products function', async (url) => {
    routeMocks.handleImageUpload.mockResolvedValueOnce('image handler');
    const request = { method: 'POST', url };
    const response = {};

    await expect(handler(request, response)).resolves.toBe('image handler');
    expect(routeMocks.handleImageUpload).toHaveBeenCalledWith(request, response);
  });

  it('rewrites the public upload URL and maps the local API router to the same function', () => {
    const vercelConfig = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
    const apiRouter = readFileSync(new URL('../index.ts', import.meta.url), 'utf8');
    const productsHandler = readFileSync(new URL('../products.ts', import.meta.url), 'utf8');
    const adminDispatcher = readFileSync(new URL('../../lib/api-helpers/admin-dispatch.ts', import.meta.url), 'utf8');
    const ignoreRules = readFileSync(new URL('../../.vercelignore', import.meta.url), 'utf8');
    const routes = vercelConfig.routes as Array<{ src: string; dest: string; transforms: Array<{ args: string }> }>;

    expect(vercelConfig.rewrites).not.toContainEqual(expect.objectContaining({ source: '/api/admin/product-images' }));
    expect(routes).toContainEqual(expect.objectContaining({
      src: '^/api/admin/(.*)$',
      dest: '/api/products',
      transforms: [expect.objectContaining({ args: '/api/admin/$1' })],
    }));
    expect(productsHandler).toContain("import handleAdminRequest from '../lib/api-helpers/admin-dispatch.ts'");
    expect(adminDispatcher).toContain("'product-images': { handler: handleProductImageUpload");
    expect(apiRouter).toContain("import('../lib/api-handlers/admin/products/index.ts')");
    expect(ignoreRules).toContain('api/admin/**');
    expect(ignoreRules).toContain('api/index.ts');
  });
});
