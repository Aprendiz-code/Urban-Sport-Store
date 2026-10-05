import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseClient, isSupabaseEnabled } from './supabase-client';
import { logAuthDiagnostic } from './supabase-auth';
import { getProfileAccess, ProfileAccessVerificationError } from './profile-service';
import { getAdminPanelMenuLink } from '../app/admin-panel-menu';

vi.mock('./supabase-client', () => ({
  getSupabaseClient: vi.fn(),
  isSupabaseEnabled: vi.fn(),
}));

vi.mock('./supabase-auth', () => ({
  getAccessToken: vi.fn(),
  logAuthDiagnostic: vi.fn(),
}));

function mockProfileQuery(data: unknown, error: unknown = null) {
  const maybeSingle = vi.fn().mockResolvedValue({ data, error });
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));

  vi.mocked(getSupabaseClient).mockReturnValue({ from } as never);
  return { from, select, eq, maybeSingle };
}

describe('getProfileAccess', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(isSupabaseEnabled).mockReturnValue(true);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  it('grants admin access only to an active ADMIN profile', async () => {
    const query = mockProfileQuery({ id: 'user-1', role: 'ADMIN', is_active: true });

    const access = await getProfileAccess({ id: 'user-1' });

    expect(access).toEqual({
      status: 'admin',
      role: 'ADMIN',
      isAdmin: true,
    });
    expect(getAdminPanelMenuLink(access.role, access.isAdmin)).toEqual({
      label: 'Panel de Administración',
      view: 'admin',
      href: '/admin',
    });
    expect(query.select).toHaveBeenCalledWith('id, role, is_active');
  });

  it('does not query permissions before authentication completes', async () => {
    await expect(getProfileAccess(null)).resolves.toEqual({
      status: 'missing',
      role: null,
      isAdmin: false,
    });
    expect(getSupabaseClient).not.toHaveBeenCalled();
  });

  it('returns customer access without admin permissions', async () => {
    mockProfileQuery({ id: 'user-1', role: 'CUSTOMER', is_active: true });

    const access = await getProfileAccess({ id: 'user-1' });

    expect(access).toEqual({
      status: 'customer',
      role: 'CUSTOMER',
      isAdmin: false,
    });
    expect(getAdminPanelMenuLink(access.role, access.isAdmin)).toBeNull();
  });

  it('rejects admin access for an inactive ADMIN profile', async () => {
    mockProfileQuery({ id: 'user-1', role: 'ADMIN', is_active: false });

    const access = await getProfileAccess({ id: 'user-1' });

    expect(access).toEqual({
      status: 'inactive',
      role: null,
      isAdmin: false,
    });
    expect(getAdminPanelMenuLink(access.role, access.isAdmin)).toBeNull();
  });

  it('distinguishes a missing profile from a valid customer', async () => {
    mockProfileQuery(null);

    await expect(getProfileAccess({ id: 'user-1' })).resolves.toEqual({
      status: 'missing',
      role: null,
      isAdmin: false,
    });
  });

  it('denies a padded role instead of treating it as an administrator role', async () => {
    mockProfileQuery({ id: 'user-1', role: ' ADMIN ', is_active: true });

    await expect(getProfileAccess({ id: 'user-1' })).resolves.toEqual({
      status: 'missing',
      role: null,
      isAdmin: false,
    });
  });

  it.each([
    ['401', { status: 401, code: 'PGRST301', message: 'Unauthorized' }],
    ['403', { status: 403, code: '42501', message: 'Permission denied' }],
    ['404', { status: 404, code: 'PGRST116', message: 'Profile not found' }],
    ['network', { code: 'NETWORK_ERROR', message: 'Failed to fetch' }],
    ['database recursion', { status: 500, code: '42P17', message: 'infinite recursion detected in policy for relation "profiles"' }],
  ])('surfaces %s as a safe verification failure, never as customer access', async (_case, error) => {
    mockProfileQuery(null, error);

    await expect(getProfileAccess({ id: 'user-1' })).rejects.toMatchObject({
      name: ProfileAccessVerificationError.name,
      message: 'No fue posible verificar los permisos de tu cuenta. Inténtalo de nuevo más tarde.',
    });
    expect(logAuthDiagnostic).toHaveBeenCalledWith('profile-query.failed', expect.objectContaining({
      code: error.code,
      table: 'profiles',
      rowFound: false,
      message: error.message,
    }));
  });
});