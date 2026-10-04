import type { User } from '@supabase/supabase-js';
import type { UserProfile, UserRole } from '../types/domain';
import { getSupabaseClient, isSupabaseEnabled } from './supabase-client';
import { getAccessToken } from './supabase-auth';
import { resolveApiBaseUrl } from './api-config';

export interface PersonalProfileUpdate {
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export class ProfileServiceError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ProfileServiceError';
  }
}

const PROFILE_ACCESS_ERROR_MESSAGE = 'No fue posible verificar los permisos de tu cuenta. Inténtalo de nuevo más tarde.';

export class ProfileAccessVerificationError extends Error {
  constructor() {
    super(PROFILE_ACCESS_ERROR_MESSAGE);
    this.name = 'ProfileAccessVerificationError';
  }
}

const API_ROOT = resolveApiBaseUrl(import.meta.env.VITE_API_URL);

async function requestMyProfile(method: 'GET' | 'PATCH', body?: PersonalProfileUpdate): Promise<{
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  fullName: string | null;
  phone: string | null;
}> {
  const token = await getAccessToken();
  if (!token) throw new ProfileServiceError(401, 'Inicia sesión para consultar tu perfil.');

  const response = await fetch(`${API_ROOT}/account/profile`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const payload = await response.json().catch(() => null) as {
    data?: unknown;
    error?: { message?: string };
  } | null;

  if (!response.ok || !payload?.data || typeof payload.data !== 'object') {
    throw new ProfileServiceError(response.status, payload?.error?.message ?? 'El perfil no está disponible.');
  }
  return payload.data as Awaited<ReturnType<typeof requestMyProfile>>;
}

export const getMyProfile = () => requestMyProfile('GET');
export const updateMyProfile = (updates: PersonalProfileUpdate) => requestMyProfile('PATCH', updates);

const KNOWN_ROLES: readonly UserRole[] = [
  'CUSTOMER',
  'OWNER',
  'ADMIN',
  'CATALOG_MANAGER',
  'LOGISTICS',
  'ACCOUNTANT',
];

export async function getProfileByUserId(userId: string): Promise<UserProfile | null> {
  if (!userId) return null;
  if (!isSupabaseEnabled()) {
    console.warn('Profile access verification failed.', { reason: 'supabase_unavailable' });
    throw new ProfileAccessVerificationError();
  }

  try {
    const { data, error } = await getSupabaseClient()
      .from('profiles')
      .select('id, role, is_active')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!data || typeof data.role !== 'string' || !KNOWN_ROLES.includes(data.role.toUpperCase() as UserRole)) {
      return null;
    }

    return {
      id: data.id,
      role: data.role.toUpperCase() as UserRole,
      isActive: data.is_active === true,
    };
  } catch (error) {
    const errorCode = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'PROFILE_QUERY_FAILED';
    const safeCode = /^[A-Z0-9_]{1,32}$/.test(errorCode) ? errorCode : 'PROFILE_QUERY_FAILED';
    console.warn('Profile access verification failed.', { code: safeCode });
    throw new ProfileAccessVerificationError();
  }
}

export async function getProfileAccess(user: Pick<User, 'id'> | null) {
  if (!user) return { status: 'missing' as const, role: null, isAdmin: false };

  const profile = await getProfileByUserId(user.id);
  if (!profile) return { status: 'missing' as const, role: null, isAdmin: false };
  if (!profile.isActive) return { status: 'inactive' as const, role: null, isAdmin: false };

  return profile.role === 'CUSTOMER'
    ? { status: 'customer' as const, role: profile.role, isAdmin: false }
    : { status: 'admin' as const, role: profile.role, isAdmin: true };
}
