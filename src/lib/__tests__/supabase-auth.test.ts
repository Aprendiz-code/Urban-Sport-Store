import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock('../supabase-client', () => ({
  getSupabaseClient: () => ({ auth: authMock }),
  isSupabaseEnabled: () => true,
}));

import { getAccessToken } from '../supabase-auth';

describe('Supabase admin access token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.signOut.mockResolvedValue({ error: null });
  });

  it('returns the token from the active Supabase session', async () => {
    authMock.getSession.mockResolvedValue({
      data: { session: { access_token: 'current-token', expires_at: Math.floor(Date.now() / 1000) + 300 } },
      error: null,
    });

    await expect(getAccessToken()).resolves.toBe('current-token');
    expect(authMock.refreshSession).not.toHaveBeenCalled();
  });

  it('renews an expiring session through Supabase Auth', async () => {
    authMock.getSession.mockResolvedValue({
      data: { session: { access_token: 'expired-token', expires_at: Math.floor(Date.now() / 1000) - 1 } },
      error: null,
    });
    authMock.refreshSession.mockResolvedValue({
      data: { session: { access_token: 'renewed-token' } },
      error: null,
    });

    await expect(getAccessToken()).resolves.toBe('renewed-token');
    expect(authMock.refreshSession).toHaveBeenCalledOnce();
  });

  it('clears the local session when Supabase Auth cannot renew it', async () => {
    authMock.getSession.mockResolvedValue({
      data: { session: { access_token: 'expired-token', expires_at: 0 } },
      error: null,
    });
    authMock.refreshSession.mockResolvedValue({ data: { session: null }, error: new Error('refresh failed') });

    await expect(getAccessToken()).resolves.toBeNull();
    expect(authMock.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('does not return a manually stored token when there is no Supabase session', async () => {
    authMock.getSession.mockResolvedValue({ data: { session: null }, error: null });

    await expect(getAccessToken()).resolves.toBeNull();
    expect(authMock.refreshSession).not.toHaveBeenCalled();
  });
});