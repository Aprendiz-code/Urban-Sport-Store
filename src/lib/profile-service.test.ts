import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSupabaseClient, isSupabaseEnabled } from './supabase-client';
import { getProfileAccess, ProfileAccessVerificationError } from './profile-service';

vi.mock('./supabase-client', () => ({
  getSupabaseClient: vi.fn(),
  isSupabaseEnabled: vi.fn(),
}));

vi.mock('./supabase-auth', () => ({
  getAccessToken: vi.fn(),
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

    await expect(getProfileAccess({ id: 'user-1' })).resolves.toEqual({
      status: 'admin',
      role: 'ADMIN',
      isAdmin: true,
    });
    expect(query.select).toHaveBeenCalledWith('id, role, is_active');
  });

  it('returns customer access without admin permissions', async () => {
    mockProfileQuery({ id: 'user-1', role: 'CUSTOMER', is_active: true });

    await expect(getProfileAccess({ id: 'user-1' })).resolves.toEqual({
      status: 'customer',
      role: 'CUSTOMER',
      isAdmin: false,
    });
  });

  it('rejects admin access for an inactive ADMIN profile', async () => {
    mockProfileQuery({ id: 'user-1', role: 'ADMIN', is_active: false });

    await expect(getProfileAccess({ id: 'user-1' })).resolves.toEqual({
      status: 'inactive',
      role: null,
      isAdmin: false,
    });
  });

  it('distinguishes a missing profile from a valid customer', async () => {
    mockProfileQuery(null);

    await expect(getProfileAccess({ id: 'user-1' })).resolves.toEqual({
      status: 'missing',
      role: null,
      isAdmin: false,
    });
  });

  it('surfaces query errors as a safe verification failure, never as customer access', async () => {
    mockProfileQuery(null, { code: '42703', message: 'sensitive database detail' });

    await expect(getProfileAccess({ id: 'user-1' })).rejects.toMatchObject({
      name: ProfileAccessVerificationError.name,
      message: 'No fue posible verificar los permisos de tu cuenta. Inténtalo de nuevo más tarde.',
    });
    expect(console.warn).toHaveBeenCalledWith('Profile access verification failed.', { code: '42703' });
    expect(console.warn).not.toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ message: expect.any(String) }));
  });
});