import type { RealtimeSubscription, User } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabase-client';

export const signInWithEmail = async (email: string, password: string) => {
  const client = getSupabaseClient();
  const result = await client.auth.signInWithPassword({ email, password });

  if (result.error) {
    if (result.error.message?.includes('Email not confirmed') || result.error.code === 'email_not_confirmed') {
      return { data: { user: null }, error: new Error('Debes confirmar tu correo antes de iniciar sesión.') };
    }
    return result;
  }

  return result;
};

export const signUpWithEmail = async (email: string, password: string, options?: { name?: string }) => {
  const client = getSupabaseClient();
  const redirectUrl = typeof window !== 'undefined' ? window.location.origin : undefined;
  const result = await client.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: options?.name ?? '' },
      emailRedirectTo: redirectUrl,
    },
  });

  return result;
};

export const signOut = async () => {
  const client = getSupabaseClient();
  return client.auth.signOut();
};

export const getCurrentUser = async () => {
  const client = getSupabaseClient();
  const { data: { user } } = await client.auth.getUser();
  return user;
};

export const getAccessToken = async () => {
  const client = getSupabaseClient();
  const { data } = await client.auth.getSession();
  const session = (data as any)?.session ?? null;
  console.debug('[supabase-auth] getAccessToken', {
    hasSession: Boolean(session),
    accessTokenLength: session?.access_token?.length,
    looksLikeJwt: typeof session?.access_token === 'string' && session.access_token.split('.').length === 3,
  });
  return session?.access_token ?? null;
};

export const onAuthStateChange = (callback: (event: string, session: { user: User | null } | null) => void) => {
  const client = getSupabaseClient();
  const { data } = client.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  return data.subscription as RealtimeSubscription;
};

export const isAdminUser = (user: User | null) => {
  if (!user) return false;
  const metadata = (user as any).user_metadata as Record<string, any> | undefined;
  return metadata?.role === 'ADMIN' || metadata?.is_admin === true || metadata?.isAdmin === true;
};
