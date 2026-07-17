import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { SupabaseAdminService } from '../services/supabase-admin.service.js';

describe('SupabaseAdminService', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    process.env.SUPABASE_URL = 'https://example.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it('creates products through the service-role endpoint', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => [{ id: 'prod-1', name: 'Zapatilla' }],
    });

    const service = new SupabaseAdminService();
    const result = await service.createProduct({ name: 'Zapatilla', price: 120 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toContain('/rest/v1/products');
    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      apikey: 'service-role-key',
      Authorization: 'Bearer service-role-key',
    });
    expect(result).toEqual([{ id: 'prod-1', name: 'Zapatilla' }]);
  });
});
