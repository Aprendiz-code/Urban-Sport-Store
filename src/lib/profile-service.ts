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
  if (!isSupabaseEnabled() || !userId) return null;

  try {
    const { data, error } = await getSupabaseClient()
      .from('profiles')
      .select('id, role, is_active, email, first_name, last_name, full_name, phone, created_at, updated_at')
      .eq('id', userId)
      .maybeSingle();

    if (error || !data || typeof data.role !== 'string' || !KNOWN_ROLES.includes(data.role.toUpperCase() as UserRole)) {
      return null;
    }

    return {
      id: data.id,
      role: data.role.toUpperCase() as UserRole,
      isActive: data.is_active === true,
      email: data.email ?? null,
      firstName: data.first_name ?? null,
      lastName: data.last_name ?? null,
      fullName: data.full_name ?? null,
      phone: data.phone ?? null,
      createdAt: data.created_at ?? undefined,
      updatedAt: data.updated_at ?? undefined,
    };
  } catch {
    return null;
  }
}

export async function getProfileAccess(user: Pick<User, 'id'> | null) {
  if (!user) return { role: null, isAdmin: false };

  const profile = await getProfileByUserId(user.id);
  if (!profile || !profile.isActive) return { role: null, isAdmin: false };

  return {
    role: profile.role,
    isAdmin: profile.role !== 'CUSTOMER',
  };
}
