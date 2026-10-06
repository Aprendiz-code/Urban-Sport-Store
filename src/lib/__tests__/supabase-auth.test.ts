import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const authMock = vi.hoisted(() => ({
  getSession: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
  getUser: vi.fn(),
  onAuthStateChange: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock('../supabase-client', () => ({
  getSupabaseClient: () => ({ auth: authMock }),
  isSupabaseEnabled: () => true,
}));

import { getAccessToken, getCurrentUser, logAuthDiagnostic, onAuthStateChange, signInWithEmail, signOut, signUpWithEmail } from '../supabase-auth';

describe('Supabase admin access token', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.signOut.mockResolvedValue({ error: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
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

  it('recovers the authenticated user after a page reload', async () => {
    const user = { id: 'user-1', email: 'admin@example.test' };
    authMock.getUser.mockResolvedValue({ data: { user }, error: null });

    await expect(getCurrentUser()).resolves.toEqual(user);
    expect(authMock.getUser).toHaveBeenCalledOnce();
  });

  it('records a successful email login without logging the password', async () => {
    authMock.signInWithPassword.mockResolvedValue({
      data: { user: { id: 'user-1', email: 'admin@example.test' }, session: { access_token: 'do-not-log' } },
      error: null,
    });
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    const result = await signInWithEmail('admin@example.test', 'never-log-this-password');

    expect(result.data).toHaveProperty('session');
    expect(info).toHaveBeenCalledWith('[auth-diagnostic]', expect.objectContaining({
      event: 'sign-in.result',
      sessionPresent: true,
      userIdPrefix: 'user-1',
      email: 'ad***@example.test',
      httpStatus: 200,
    }));
    expect(JSON.stringify(info.mock.calls)).not.toContain('never-log-this-password');
    expect(JSON.stringify(info.mock.calls)).not.toContain('do-not-log');
  });

  it('forwards sign-in and sign-out session events to the auth listener', () => {
    const subscription = { unsubscribe: vi.fn() };
    authMock.onAuthStateChange.mockImplementation((callback) => {
      callback('SIGNED_IN', { user: { id: 'user-1', email: 'admin@example.test' } });
      return { data: { subscription } };
    });
    const callback = vi.fn();
    const listener = onAuthStateChange(callback);

    expect(callback).toHaveBeenCalledWith('SIGNED_IN', { user: { id: 'user-1', email: 'admin@example.test' } });
    listener.unsubscribe();
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  it('signs out through Supabase Auth', async () => {
    await expect(signOut()).resolves.toEqual({ error: null });
    expect(authMock.signOut).toHaveBeenCalledOnce();
  });

  it('sends signup metadata and returns an authenticated session when email confirmation is disabled', async () => {
    const user = { id: 'user-1', email: 'customer@example.test' };
    authMock.signUp.mockResolvedValue({
      data: { user, session: { access_token: 'signup-token' } },
      error: null,
    });

    const result = await signUpWithEmail('customer@example.test', 'valid-password', { name: '  Ada Lovelace  ' });

    expect(authMock.signUp).toHaveBeenCalledWith({
      email: 'customer@example.test',
      password: 'valid-password',
      options: {
        data: { full_name: 'Ada Lovelace', display_name: 'Ada Lovelace' },
        emailRedirectTo: undefined,
      },
    });
    expect(result.data.user).toEqual(user);
    expect(result.needsConfirmation).toBe(false);
    expect(authMock.signInWithPassword).not.toHaveBeenCalled();
  });

  it('reports required email confirmation without attempting a password sign-in', async () => {
    const user = { id: 'user-2', email: 'pending@example.test' };
    authMock.signUp.mockResolvedValue({ data: { user, session: null }, error: null });

    const result = await signUpWithEmail('pending@example.test', 'valid-password', { name: 'Grace Hopper' });

    expect(result.data.user).toEqual(user);
    expect(result.needsConfirmation).toBe(true);
    expect(authMock.signInWithPassword).not.toHaveBeenCalled();
  });

  it('translates common Supabase signup validation errors', async () => {
    authMock.signUp.mockResolvedValue({
      data: { user: null, session: null },
      error: { code: 'weak_password', message: 'Password should be at least 8 characters.' },
    });

    const result = await signUpWithEmail('customer@example.test', 'short', { name: 'Ada Lovelace' });

    expect(result.error?.message).toBe('La contraseña debe tener al menos 8 caracteres.');
  });

  it('masks identity and strips credentials from development diagnostics', () => {
    vi.stubEnv('DEV', true);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    logAuthDiagnostic('profile-query.failed', {
      userId: '12345678-1234-1234-1234-123456789012',
      email: 'admin@example.test',
      message: 'Bearer hidden-token eyJheader.payload.signature admin@example.test',
    });

    const [, details] = info.mock.calls[0];
    expect(details).toMatchObject({ userIdPrefix: '12345678', email: 'ad***@example.test' });
    expect(details.message).toBe('Bearer [redacted] [redacted] [email]');
    expect(JSON.stringify(details)).not.toContain('hidden-token');
    expect(JSON.stringify(details)).not.toContain('admin@example.test');
  });

  it('does not emit authentication diagnostics in production mode', () => {
    vi.stubEnv('DEV', false);
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    logAuthDiagnostic('sign-in.result', { sessionPresent: true });

    expect(info).not.toHaveBeenCalled();
  });
});