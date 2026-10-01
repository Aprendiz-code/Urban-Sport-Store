export const ADMIN_ROLES = [
  'OWNER',
  'ADMIN',
  'CATALOG_MANAGER',
  'LOGISTICS',
  'ACCOUNTANT',
] as const;

export type AdminRole = (typeof ADMIN_ROLES)[number];

export const ADMIN_PERMISSIONS = [
  'admin.access',
  'products.read',
  'products.write',
  'products.archive',
  'categories.read',
  'categories.write',
  'categories.archive',
  'inventory.read',
  'inventory.write',
  'orders.read',
  'orders.write',
  'payments.read',
  'payments.write',
  'content.read',
  'content.write',
  'promotions.read',
  'promotions.write',
  'customers.read',
  'reports.read',
  'audit.read',
  'users.manage',
  'settings.manage',
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

const ROLE_PERMISSIONS: Record<AdminRole, ReadonlySet<AdminPermission>> = {
  OWNER: new Set(ADMIN_PERMISSIONS),
  ADMIN: new Set([
    'admin.access',
    'products.read', 'products.write', 'products.archive',
    'categories.read', 'categories.write', 'categories.archive',
    'inventory.read', 'inventory.write',
    'orders.read', 'orders.write',
    'content.read', 'content.write',
    'promotions.read', 'promotions.write',
    'customers.read', 'reports.read', 'audit.read',
  ]),
  CATALOG_MANAGER: new Set([
    'admin.access',
    'products.read', 'products.write', 'products.archive',
    'categories.read', 'categories.write', 'categories.archive',
    'content.read', 'content.write',
    'promotions.read', 'promotions.write',
  ]),
  LOGISTICS: new Set([
    'admin.access', 'products.read',
    'inventory.read', 'inventory.write',
    'orders.read', 'orders.write',
  ]),
  ACCOUNTANT: new Set([
    'admin.access', 'orders.read', 'payments.read', 'payments.write',
    'customers.read', 'reports.read',
  ]),
};

export function resolveAdminRole(metadata?: Record<string, unknown>): AdminRole | null {
  const role = typeof metadata?.role === 'string' ? metadata.role.toUpperCase() : '';
  if ((ADMIN_ROLES as readonly string[]).includes(role)) return role as AdminRole;

  if (metadata?.isAdmin === true || metadata?.is_admin === true) return 'ADMIN';
  return null;
}

export function hasAdminPermission(role: AdminRole | null, permission: AdminPermission): boolean {
  return role !== null && ROLE_PERMISSIONS[role].has(permission);
}