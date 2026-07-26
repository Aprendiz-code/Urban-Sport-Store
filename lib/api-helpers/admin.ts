import { supabaseAdmin } from './supabase.js';
import { ApiError } from './response.js';

function isAdminMetadata(metadata: Record<string, any> | undefined): boolean {
  return metadata?.role === 'ADMIN' || metadata?.isAdmin === true || metadata?.is_admin === true;
}

export async function requireAdmin(user: { id: string; app_metadata?: Record<string, any> } | string): Promise<void> {
  if (!supabaseAdmin) {
    throw new ApiError(500, 'Admin client not configured');
  }

  const userId = typeof user === 'string' ? user : user.id;
  const metadata = typeof user === 'string' ? undefined : user.app_metadata;

  if (metadata && isAdminMetadata(metadata)) {
    return;
  }

  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data?.user) {
    throw new ApiError(403, 'Admin access required');
  }

  const adminMetadata = data.user.app_metadata as Record<string, any> | undefined;
  if (!isAdminMetadata(adminMetadata)) {
    throw new ApiError(403, 'Admin access required');
  }
}
