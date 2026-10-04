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

import handler from '../admin/products/index.js';

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

    expect(vercelConfig.rewrites).toContainEqual({
      source: '/api/admin/product-images',
      destination: '/api/admin/products?resource=product-image',
    });
    expect(apiRouter).toContain("'/api/admin/product-images': () => import('./admin/products/index.ts')");
    expect(apiRouter).not.toContain("import('./admin/product-images.ts')");
  });
});
