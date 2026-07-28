import { supabaseAdmin } from './supabase.js';
import { ApiError } from './response.js';

function isAdminMetadata(metadata: Record<string, any> | undefined): boolean {
  return metadata?.role === 'ADMIN' || metadata?.isAdmin === true || metadata?.is_admin === true;
}

export async function requireAdmin(user: { id: string; app_metadata?: Record<string, any>; user_metadata?: Record<string, any> } | string): Promise<void> {
  if (!supabaseAdmin) {
    throw new ApiError(500, 'Admin client not configured');
  }

  const userId = typeof user === 'string' ? user : user.id;
  const metadata = typeof user === 'string'
    ? undefined
    : {
        ...(user.app_metadata || {}),
        ...(user.user_metadata || {}),
      };

  if (metadata && isAdminMetadata(metadata)) {
    return;
  }

  const { data, error } = await supabaseAdmin.auth.admin.getUserById(userId);
  if (error || !data?.user) {
    throw new ApiError(403, 'Admin access required');
  }

  const adminMetadata = {
    ...(data.user.app_metadata as Record<string, any> | undefined),
    ...(data.user.user_metadata as Record<string, any> | undefined),
  };
  if (!isAdminMetadata(adminMetadata)) {
    // Fallback: only trust raw_app_meta_data stored by the server (not raw_user_meta_data which may be user-editable)
    try {
      const { data: userRow, error: userRowError } = await supabaseAdmin.from('auth.users').select('raw_app_meta_data').eq('id', userId).maybeSingle();
      if (!userRowError && userRow) {
        const rawApp = (userRow as any).raw_app_meta_data;
        let parsedApp: Record<string, any> = {};
        try { parsedApp = typeof rawApp === 'string' ? JSON.parse(rawApp) : (rawApp || {}); } catch {}
        if (isAdminMetadata(parsedApp)) return;
      }
    } catch (_) {
      // ignore and fallthrough to throw
    }
    throw new ApiError(403, 'Admin access required');
  }
}
