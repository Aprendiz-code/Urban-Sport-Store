import { supabaseAdmin } from './supabase.js';
import { ApiError } from './response.js';

export interface AuthUser {
  id: string;
  email: string | null;
  app_metadata?: Record<string, any>;
  user_metadata?: Record<string, any>;
}

export async function getBearerToken(req: any): Promise<string> {
  const authHeader = req.headers?.authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    throw new ApiError(401, 'Missing Authorization header');
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new ApiError(401, 'Invalid Authorization header format');
  }

  return match[1];
}

export async function validateSupabaseToken(req: any): Promise<AuthUser> {
  const token = await getBearerToken(req);
  if (!supabaseAdmin) {
    throw new ApiError(500, 'Admin client not configured');
  }
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data?.user) {
    throw new ApiError(401, 'Invalid or expired Supabase token');
  }

  return {
    id: data.user.id,
    email: data.user.email ?? null,
    app_metadata: data.user.app_metadata as Record<string, any> | undefined,
    user_metadata: data.user.user_metadata as Record<string, any> | undefined,
  };
}
