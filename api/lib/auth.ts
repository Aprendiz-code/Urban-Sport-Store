import { supabase } from './supabase.js';
import { ApiError } from './response.js';

export interface AuthUser {
  id: string;
  email: string | null;
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
  const { data, error } = await supabase.auth.getUser(token);

  if (error || !data?.user) {
    throw new ApiError(401, 'Invalid or expired Supabase token');
  }

  return {
    id: data.user.id,
    email: data.user.email ?? null,
  };
}
