import { beforeEach, describe, expect, it, vi } from 'vitest';

const authorizationMocks = vi.hoisted(() => ({
  from: vi.fn(),
  getUser: vi.fn(),
}));

vi.mock('../../lib/api-helpers/supabase.js', () => ({
  supabaseAdmin: {
    from: authorizationMocks.from,
    auth: { getUser: authorizationMocks.getUser },
  },
}));

import { requirePermission } from '../../lib/api-helpers/admin.js';
import { hasAdminPermission, resolveAdminRole } from '../../lib/api-helpers/admin-rbac.js';
import { requireAuthenticatedUser } from '../../lib/api-helpers/auth.js';

function mockProfile(data: unknown, error: unknown = null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  authorizationMocks.from.mockReturnValue(query);
  return query;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('profile-backed admin authorization', () => {
  it('validates the bearer token and returns only the authenticated id', async () => {
    authorizationMocks.getUser.mockResolvedValueOnce({
      data: {
        user: {
          id: 'verified-user',
          app_metadata: { role: 'ADMIN' },
          user_metadata: { isAdmin: true },
        },
      },
      error: null,
    });

    await expect(requireAuthenticatedUser({
      headers: { authorization: 'Bearer verified-token' },
    })).resolves.toEqual({ id: 'verified-user' });
  });

  it('denies app_metadata ADMIN when the profile is CUSTOMER', async () => {
    mockProfile({ id: 'customer', role: 'CUSTOMER', is_active: true });
    const actor = { id: 'customer', app_metadata: { role: 'ADMIN' } };

    await expect(requirePermission(actor, 'products.write')).rejects.toThrow('No autorizado.');
    expect(authorizationMocks.from).toHaveBeenCalledWith('profiles');
  });

  it('denies user_metadata isAdmin when the profile is CUSTOMER', async () => {
    mockProfile({ id: 'customer', role: 'CUSTOMER', is_active: true });
    const actor = { id: 'customer', user_metadata: { isAdmin: true, role: 'OWNER' } };

    await expect(requirePermission(actor, 'products.write')).rejects.toThrow('No autorizado.');
  });

  it('authorizes an active ADMIN only for permissions in the server-side matrix', async () => {
    mockProfile({ id: 'admin', role: 'ADMIN', is_active: true });

    await expect(requirePermission('admin', 'products.write')).resolves.toBe('ADMIN');
    await expect(requirePermission('admin', 'users.manage')).rejects.toThrow('No autorizado.');
  });

  it('denies inactive admins and authenticated users without a profile', async () => {
    mockProfile({ id: 'inactive', role: 'ADMIN', is_active: false });
    await expect(requirePermission('inactive', 'products.write')).rejects.toThrow('Cuenta inactiva.');

    mockProfile(null);
    await expect(requirePermission('missing', 'products.write')).rejects.toThrow('No autorizado.');
  });

  it('denies unauthenticated requests with a consistent message', async () => {
    await expect(requireAuthenticatedUser({ headers: {} })).rejects.toThrow('No autenticado.');
    expect(authorizationMocks.getUser).not.toHaveBeenCalled();
  });
});

describe('profile role permission matrix', () => {
  it('recognizes only explicit administrative profile role values', () => {
    expect(resolveAdminRole('OWNER')).toBe('OWNER');
    expect(resolveAdminRole('catalog_manager')).toBe('CATALOG_MANAGER');
    expect(resolveAdminRole('CUSTOMER')).toBeNull();
    expect(resolveAdminRole({ role: 'ADMIN', isAdmin: true })).toBeNull();
    expect(resolveAdminRole(undefined)).toBeNull();
  });

  it('grants catalog managers catalog and content access, but not inventory access', () => {
    const role = resolveAdminRole('CATALOG_MANAGER');

    expect(hasAdminPermission(role, 'products.write')).toBe(true);
    expect(hasAdminPermission(role, 'content.write')).toBe(true);
    expect(hasAdminPermission(role, 'inventory.write')).toBe(false);
    expect(hasAdminPermission(role, 'users.manage')).toBe(false);
  });

  it('limits logistics and accounting permissions to their responsibilities', () => {
    const logistics = resolveAdminRole('LOGISTICS');
    const accountant = resolveAdminRole('ACCOUNTANT');

    expect(hasAdminPermission(logistics, 'inventory.write')).toBe(true);
    expect(hasAdminPermission(logistics, 'orders.write')).toBe(true);
    expect(hasAdminPermission(logistics, 'payments.write')).toBe(false);
    expect(hasAdminPermission(accountant, 'reports.read')).toBe(true);
    expect(hasAdminPermission(accountant, 'payments.write')).toBe(true);
    expect(hasAdminPermission(accountant, 'products.write')).toBe(false);
  });

  it('reserves user management and store settings for the owner', () => {
    const admin = resolveAdminRole('ADMIN');
    const owner = resolveAdminRole('OWNER');

    expect(hasAdminPermission(admin, 'users.manage')).toBe(false);
    expect(hasAdminPermission(admin, 'settings.manage')).toBe(false);
    expect(hasAdminPermission(owner, 'users.manage')).toBe(true);
    expect(hasAdminPermission(owner, 'settings.manage')).toBe(true);
  });
});
