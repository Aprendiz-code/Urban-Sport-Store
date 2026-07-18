import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { SupabaseAdminService } from '../services/supabase-admin.service.js';
import * as supabaseEnv from '../config/supabase-env.js';

describe('SupabaseAdminService', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal('fetch', fetchMock);
    // Mock getSupabaseConfig to return test credentials
    vi.spyOn(supabaseEnv, 'getSupabaseConfig').mockReturnValue({
      url: 'https://example.supabase.co',
      serviceRoleKey: 'service-role-key',
    });
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
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
