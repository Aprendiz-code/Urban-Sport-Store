import { supabaseAdmin } from './supabase.js';
import { ApiError } from './response.js';

export interface AuthUser {
  id: string;
}

export async function getBearerToken(req: any): Promise<string> {
  const authHeader = req.headers?.authorization;
  if (!authHeader || typeof authHeader !== 'string') {
    throw new ApiError(401, 'No autenticado.');
  }

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) {
    throw new ApiError(401, 'No autenticado.');
  }

  return match[1];
}

export async function requireAuthenticatedUser(req: any): Promise<AuthUser> {
  const token = await getBearerToken(req);
  if (!supabaseAdmin) {
    throw new ApiError(500, 'Configuración de permisos incompleta.');
  }
  const { data, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !data?.user) {
    throw new ApiError(401, 'No autenticado.');
  }

  return { id: data.user.id };
}

export const validateSupabaseToken = requireAuthenticatedUser;
