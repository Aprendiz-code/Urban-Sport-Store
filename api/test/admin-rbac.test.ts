import { describe, expect, it } from 'vitest';
import { hasAdminPermission, resolveAdminRole } from '../../lib/api-helpers/admin-rbac.js';

describe('admin role permissions', () => {
  it('recognizes only server-controlled admin roles and legacy admin flags', () => {
    expect(resolveAdminRole({ role: 'OWNER' })).toBe('OWNER');
    expect(resolveAdminRole({ role: 'catalog_manager' })).toBe('CATALOG_MANAGER');
    expect(resolveAdminRole({ is_admin: true })).toBe('ADMIN');
    expect(resolveAdminRole({ role: 'CUSTOMER', is_admin: false })).toBeNull();
    expect(resolveAdminRole({})).toBeNull();
  });

  it('grants catalog managers catalog and content access, but not inventory access', () => {
    const role = resolveAdminRole({ role: 'CATALOG_MANAGER' });

    expect(hasAdminPermission(role, 'products.write')).toBe(true);
    expect(hasAdminPermission(role, 'content.write')).toBe(true);
    expect(hasAdminPermission(role, 'inventory.write')).toBe(false);
    expect(hasAdminPermission(role, 'users.manage')).toBe(false);
  });

  it('limits logistics and accounting permissions to their responsibilities', () => {
    const logistics = resolveAdminRole({ role: 'LOGISTICS' });
    const accountant = resolveAdminRole({ role: 'ACCOUNTANT' });

    expect(hasAdminPermission(logistics, 'inventory.write')).toBe(true);
    expect(hasAdminPermission(logistics, 'orders.write')).toBe(true);
    expect(hasAdminPermission(logistics, 'payments.write')).toBe(false);
    expect(hasAdminPermission(accountant, 'reports.read')).toBe(true);
    expect(hasAdminPermission(accountant, 'payments.write')).toBe(true);
    expect(hasAdminPermission(accountant, 'products.write')).toBe(false);
  });

  it('reserves user management and store settings for the owner', () => {
    const admin = resolveAdminRole({ role: 'ADMIN' });
    const owner = resolveAdminRole({ role: 'OWNER' });

    expect(hasAdminPermission(admin, 'users.manage')).toBe(false);
    expect(hasAdminPermission(admin, 'settings.manage')).toBe(false);
    expect(hasAdminPermission(owner, 'users.manage')).toBe(true);
    expect(hasAdminPermission(owner, 'settings.manage')).toBe(true);
  });
});