import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/api-helpers/supabase.js', () => ({
  supabaseAdmin: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
  },
}));

import { supabaseAdmin } from '../../lib/api-helpers/supabase.js';
import handler from '../orders.js';

describe('secure order endpoint', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key');

    const profileQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: 'user-1', role: 'CUSTOMER', is_active: true },
        error: null,
      }),
    };
    profileQuery.select.mockReturnValue(profileQuery);
    profileQuery.eq.mockReturnValue(profileQuery);
    const ordersQuery = {
      select: vi.fn(() => ({ limit: vi.fn().mockResolvedValue({ error: null }) })),
    };
    (supabaseAdmin as any).from = vi.fn((table: string) => table === 'profiles' ? profileQuery : ordersQuery);

    (supabaseAdmin!.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'user-1' } },
      error: null,
    });
  });

  it('rejects unauthenticated requests', async () => {
    const req = { method: 'POST', headers: {}, body: { items: [{ productId: 'p1', quantity: 1 }] } };
    const res = { statusCode: 200, headers: {}, setHeader: vi.fn(), end: vi.fn() };

    await handler(req, res);

    expect(res.statusCode).toBe(401);
  });

  it('rejects frontend-controlled payment fields', async () => {
    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer token' },
      body: {
        address: {
          recipientName: 'Ana Gómez',
          city: 'Bogotá',
          addressLine1: 'Cra 15 #84-25',
          phone: '+57 311 234 5678',
          country: 'CO',
        },
        items: [{ productId: 'p1', quantity: 1 }],
        total: 30000,
      },
    };
    const res = { statusCode: 200, headers: {}, setHeader: vi.fn(), end: vi.fn() };

    await handler(req, res);

    expect(res.statusCode).toBe(400);
  });

  it('blocks creation while the database is not ready for pending orders', async () => {
    const req = {
      method: 'POST',
      headers: { authorization: 'Bearer token' },
      body: {
        address: {
          recipientName: 'Ana Gómez',
          city: 'Bogotá',
          addressLine1: 'Cra 15 #84-25',
          phone: '+57 311 234 5678',
          country: 'CO',
        },
        items: [{ productId: 'product-1', quantity: 1 }],
      },
    };
    const res = { statusCode: 200, headers: {}, setHeader: vi.fn(), end: vi.fn() };

    await handler(req, res);

    expect(res.statusCode).toBe(501);
  });

  it('denies missing or inactive profiles before checking order tables', async () => {
    const profileQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    };
    profileQuery.select.mockReturnValue(profileQuery);
    profileQuery.eq.mockReturnValue(profileQuery);
    const from = vi.fn(() => profileQuery);
    (supabaseAdmin as any).from = from;

    const req = { method: 'POST', headers: { authorization: 'Bearer token' }, body: {} };
    const res = { statusCode: 200, headers: {}, setHeader: vi.fn(), end: vi.fn() };

    await handler(req, res);
    expect(res.statusCode).toBe(403);
    expect(from).toHaveBeenCalledTimes(1);

    profileQuery.maybeSingle.mockResolvedValueOnce({
      data: { id: 'user-1', role: 'ADMIN', is_active: false },
      error: null,
    });
    res.statusCode = 200;
    await handler(req, res);
    expect(res.statusCode).toBe(403);
    expect(from).toHaveBeenCalledTimes(2);
  });
});
