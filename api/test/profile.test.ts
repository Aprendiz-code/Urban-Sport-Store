import { beforeEach, describe, expect, it, vi } from 'vitest';

const profileMocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  selectResults: [] as Array<{ data: unknown; error: unknown }>,
  updates: [] as Array<Record<string, unknown>>,
}));

vi.mock('../../lib/api-helpers/supabase.js', () => ({
  supabaseAdmin: {
    auth: { getUser: profileMocks.getUser },
    from: profileMocks.from,
  },
}));

import handler from '../account/profile.js';

function mockProfiles(results: Array<{ data: unknown; error?: unknown }>) {
  profileMocks.selectResults = results.map((result) => ({ data: result.data, error: result.error ?? null }));
  profileMocks.updates = [];
  profileMocks.from.mockImplementation((table: string) => {
    if (table !== 'profiles') throw new Error('Unexpected table');
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      maybeSingle: vi.fn(() => Promise.resolve(profileMocks.selectResults.shift() ?? { data: null, error: null })),
      update: vi.fn((values: Record<string, unknown>) => {
        profileMocks.updates.push(values);
        return query;
      }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    return query;
  });
}

function createResponse() {
  return { statusCode: 200, headers: {}, body: '', setHeader: vi.fn(), end(value: string) { this.body = value; } };
}

function responseData(response: ReturnType<typeof createResponse>) {
  return JSON.parse(response.body) as { data?: Record<string, unknown>; error?: { message: string } };
}

beforeEach(() => {
  vi.clearAllMocks();
  profileMocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
});

describe('account profile API', () => {
  it('returns only the authenticated user profile fields', async () => {
    mockProfiles([
      { data: { id: 'user-1', role: 'CUSTOMER', is_active: true } },
      { data: { id: 'user-1', role: 'CUSTOMER', is_active: true, email: 'user@example.test', first_name: 'Ana', last_name: null, phone: null } },
    ]);
    const response = createResponse();

    await handler({ method: 'GET', headers: { authorization: 'Bearer token' } }, response);

    expect(response.statusCode).toBe(200);
    expect(responseData(response).data).toEqual({
      id: 'user-1', email: 'user@example.test', firstName: 'Ana', lastName: null,
      fullName: null, phone: null,
    });
  });

  it('updates only whitelisted personal columns and rejects role fields', async () => {
    mockProfiles([
      { data: { id: 'user-1', role: 'CUSTOMER', is_active: true } },
      { data: { id: 'user-1', role: 'CUSTOMER', is_active: true, first_name: 'Ana', last_name: null, phone: null } },
      { data: { id: 'user-1', role: 'CUSTOMER', is_active: true, first_name: 'Bea', last_name: null, phone: null } },
    ]);
    const response = createResponse();

    await handler({ method: 'PATCH', headers: { authorization: 'Bearer token' }, body: { firstName: 'Bea' } }, response);
    expect(response.statusCode).toBe(200);
    expect(profileMocks.updates).toEqual([{ first_name: 'Bea' }]);

    mockProfiles([{ data: { id: 'user-1', role: 'CUSTOMER', is_active: true } }]);
    const rejectedResponse = createResponse();
    await handler({ method: 'PATCH', headers: { authorization: 'Bearer token' }, body: { role: 'ADMIN' } }, rejectedResponse);
    expect(rejectedResponse.statusCode).toBe(400);
    expect(profileMocks.updates).toEqual([]);
  });

  it('denies inactive profiles and users without a profile', async () => {
    mockProfiles([{ data: { id: 'user-1', role: 'ADMIN', is_active: false } }]);
    const inactiveResponse = createResponse();
    await handler({ method: 'GET', headers: { authorization: 'Bearer token' } }, inactiveResponse);
    expect(inactiveResponse.statusCode).toBe(403);

    mockProfiles([{ data: null }]);
    const missingResponse = createResponse();
    await handler({ method: 'GET', headers: { authorization: 'Bearer token' } }, missingResponse);
    expect(missingResponse.statusCode).toBe(403);
  });
});
