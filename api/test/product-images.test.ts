import { beforeEach, describe, expect, it, vi } from 'vitest';

const apiMocks = vi.hoisted(() => ({
  from: vi.fn(),
  upload: vi.fn(),
  authenticate: vi.fn(),
  requirePermission: vi.fn(),
}));

vi.mock('../../lib/api-helpers/supabase.js', () => ({
  supabaseAdmin: { storage: { from: apiMocks.from } },
}));
vi.mock('../../lib/api-helpers/auth.js', () => ({
  requireAuthenticatedUser: apiMocks.authenticate,
}));
vi.mock('../../lib/api-helpers/admin.js', () => ({
  requirePermission: apiMocks.requirePermission,
}));

import { handleProductImageUpload as handler, resolveProductStorageBucket } from '../../lib/api-helpers/product-image-upload.js';

function createRequest(contentType: string, bytes: Buffer) {
  return {
    method: 'POST',
    headers: { 'content-type': contentType },
    on(event: string, listener: (...args: any[]) => void) {
      if (event === 'data') queueMicrotask(() => listener(bytes));
      if (event === 'end') queueMicrotask(() => listener());
      return this;
    },
  };
}

function createResponse() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(name: string, value: string) { this.headers[name] = value; },
    end(body = '') { this.body = body; },
  };
}

describe('admin product image upload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    apiMocks.authenticate.mockResolvedValue({ id: 'admin-user' });
    apiMocks.requirePermission.mockResolvedValue('ADMIN');
    apiMocks.from.mockReturnValue({ upload: apiMocks.upload });
    apiMocks.upload.mockResolvedValue({ data: { path: 'products/stored.png' }, error: null });
  });

  it('authorizes catalog writes and uploads image bytes to the configured bucket', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const response = createResponse();

    await handler(createRequest('image/png', bytes), response);

    expect(apiMocks.requirePermission).toHaveBeenCalledWith({ id: 'admin-user' }, 'products.write');
    expect(apiMocks.from).toHaveBeenCalledWith('products');
    expect(apiMocks.from).not.toHaveBeenCalledWith('product-images');
    expect(apiMocks.upload).toHaveBeenCalledWith(expect.stringMatching(/^products\/[0-9a-f-]+\.png$/), bytes, expect.objectContaining({ contentType: 'image/png', upsert: false }));
    expect(response.statusCode).toBe(201);
    expect(JSON.parse(response.body)).toEqual({ data: { path: 'products/stored.png' } });
  });

  it('uses only products and rejects a divergent bucket setting', () => {
    expect(resolveProductStorageBucket()).toBe('products');
    expect(resolveProductStorageBucket('products')).toBe('products');
    expect(() => resolveProductStorageBucket('product-images')).toThrow('debe ser products');
  });

  it('rejects unsupported content types without writing to Storage', async () => {
    const response = createResponse();

    await handler(createRequest('text/plain', Buffer.from('not an image')), response);

    expect(response.statusCode).toBe(415);
    expect(apiMocks.from).not.toHaveBeenCalled();
  });

  it('returns structured Storage permission errors without exposing credentials', async () => {
    apiMocks.upload.mockResolvedValueOnce({
      data: null,
      error: {
        code: '42501',
        message: 'new row violates row-level security policy',
        details: 'The role cannot insert into storage.objects.',
        hint: 'Check service role configuration.',
      },
    });
    const response = createResponse();
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await handler(createRequest('image/png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), response);

    expect(response.statusCode).toBe(403);
    expect(JSON.parse(response.body).error).toMatchObject({
      code: '42501',
      details: 'The role cannot insert into storage.objects.',
      hint: 'Check service role configuration.',
    });
    expect(consoleError).toHaveBeenCalledWith('[Admin Products] Storage upload failed', expect.objectContaining({ code: '42501' }));
    consoleError.mockRestore();
  });
});