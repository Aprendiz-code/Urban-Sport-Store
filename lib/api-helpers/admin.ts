import { supabaseAdmin } from './supabase.js';
import { ApiError } from './response.js';
import { hasAdminPermission, resolveAdminRole, type AdminPermission } from './admin-rbac.js';

export interface CurrentProfile {
  id: string;
  role: string;
  is_active: boolean;
}

export async function getCurrentProfile(userId: string): Promise<CurrentProfile | null> {
  if (!supabaseAdmin) {
    throw new ApiError(500, 'Configuración de permisos incompleta.');
  }

  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, role, is_active')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    throw new ApiError(500, 'Configuración de permisos incompleta.');
  }

  if (!data) {
    return null;
  }

  return {
    id: data.id,
    role: typeof data.role === 'string' ? data.role : '',
    is_active: data.is_active === true,
  };
}

export async function requireActiveProfile(userId: string): Promise<CurrentProfile> {
  const profile = await getCurrentProfile(userId);
  if (!profile) {
    throw new ApiError(403, 'No autorizado.');
  }
  if (!profile.is_active) {
    throw new ApiError(403, 'Cuenta inactiva.');
  }
  return profile;
}

export async function requireRole(userId: string, allowedRoles: readonly string[]): Promise<CurrentProfile> {
  const profile = await requireActiveProfile(userId);
  const role = profile.role.toUpperCase();
  if (!allowedRoles.some((allowedRole) => allowedRole.toUpperCase() === role)) {
    throw new ApiError(403, 'No autorizado.');
  }
  return profile;
}

export async function requirePermission(
  user: { id: string } | string,
  permission: AdminPermission,
) {
  const userId = typeof user === 'string' ? user : user.id;
  const profile = await requireActiveProfile(userId);
  const role = resolveAdminRole(profile.role);
  if (!hasAdminPermission(role, permission)) {
    throw new ApiError(403, 'No autorizado.');
  }

  return role;
}

export async function requireAdmin(user: { id: string } | string): Promise<void> {
  await requirePermission(user, 'admin.access');
}
