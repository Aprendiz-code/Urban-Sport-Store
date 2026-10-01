import { supabaseAdmin } from './supabase.js';
import { ApiError } from './response.js';
import { hasAdminPermission, resolveAdminRole, type AdminPermission } from './admin-rbac.js';

export async function requirePermission(
  user: { id: string; app_metadata?: Record<string, unknown> } | string,
  permission: AdminPermission,
) {
  if (!supabaseAdmin) {
    throw new ApiError(500, 'Admin client not configured');
  }

  const userId = typeof user === 'string' ? user : user.id;
  let role = resolveAdminRole(typeof user === 'string' ? undefined : user.app_metadata);

  if (!role) {
    const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
    if (error || !data?.user) {
      throw new ApiError(403, 'Admin access required');
    }

    role = resolveAdminRole(data.user.app_metadata as Record<string, unknown> | undefined);
  }

  if (!hasAdminPermission(role, permission)) {
    throw new ApiError(403, 'Insufficient permissions');
  }

  return role;
}

export async function requireAdmin(user: { id: string; app_metadata?: Record<string, unknown> } | string): Promise<void> {
  await requirePermission(user, 'admin.access');
}
