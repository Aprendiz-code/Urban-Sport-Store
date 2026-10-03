import type { User } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseEnabled } from './supabase-client';

type RealtimeSubscription = { unsubscribe: () => void };

export const signInWithEmail = async (email: string, password: string) => {
  if (!isSupabaseEnabled()) {
    return {
      data: { user: null },
      error: new Error('El inicio de sesión requiere configurar Supabase. No hay credenciales demo activas en producción.'),
    };
  }

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

export const requestPasswordRecovery = async (email: string) => {
  if (!isSupabaseEnabled()) {
    throw new Error('La recuperación requiere configurar Supabase.');
  }

  const client = getSupabaseClient();
  const { error } = await client.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw error;
};

export const updatePassword = async (password: string) => {
  if (!isSupabaseEnabled()) {
    throw new Error('El cambio de contraseña requiere configurar Supabase.');
  }

  const client = getSupabaseClient();
  const { error } = await client.auth.updateUser({ password });
  if (error) throw error;
};

export const signUpWithEmail = async (email: string, password: string, options?: { name?: string }) => {
  if (!isSupabaseEnabled()) {
    return {
      data: { user: null },
      error: new Error('El registro requiere configurar Supabase. La autenticación demo no está habilitada.'),
      needsConfirmation: false,
    };
  }

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

  if (!result.error && result.data.user && !result.data.session) {
    const { error: signInError } = await client.auth.signInWithPassword({ email, password });
    if (!signInError) {
      const refreshedUser = await client.auth.getUser();
      return { ...result, data: { ...result.data, user: refreshedUser.data.user ?? result.data.user }, needsConfirmation: false };
    }
  }

  if (!result.error && result.data.user) {
    return { ...result, data: { ...result.data, user: result.data.user }, needsConfirmation: !result.data.session };
  }

  return result;
};

export const signOut = async () => {
  if (!isSupabaseEnabled()) {
    return { error: null, data: null };
  }

  const client = getSupabaseClient();
  return client.auth.signOut();
};

export const getCurrentUser = async () => {
  if (!isSupabaseEnabled()) {
    return null;
  }

  const client = getSupabaseClient();
  const { data: { user } } = await client.auth.getUser();
  return user;
};

export const getAccessToken = async () => {
  if (!isSupabaseEnabled()) {
    return null;
  }

  const client = getSupabaseClient();
  const { data } = await client.auth.getSession();
  // session may be null
  // access_token is required for backend auth bridging
  // return null when not available
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = (data as any)?.session ?? null;
  return session?.access_token ?? null;
};

export const onAuthStateChange = (callback: (event: string, session: { user: User | null } | null) => void) => {
  if (!isSupabaseEnabled()) {
    return { unsubscribe: () => { /* no-op */ } } as RealtimeSubscription;
  }

  const client = getSupabaseClient();
  const { data } = client.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
  return data.subscription as RealtimeSubscription;
};
