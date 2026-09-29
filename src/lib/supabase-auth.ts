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
  // Try direct client signup first (normal flow)
  try {
    const result = await client.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: options?.name ?? '' },
        emailRedirectTo: redirectUrl,
      },
    });

    // If signup succeeded or returned a composed result, return it
    if (!result.error) return result;

    // If Supabase rejects client-side signup due to project settings (anonymous/provider restrictions)
    const msg = String(result.error?.message ?? result.error?.toString() ?? '');
    if (msg.toLowerCase().includes('anonymous') || msg.toLowerCase().includes('disabled') || msg.toLowerCase().includes('not allowed')) {
      // Try server-side register endpoint which can use the service role key
      try {
        const res = await fetch('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password, name: options?.name ?? '' }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          return { data: { user: null }, error: new Error(json?.message || json?.error || msg || 'Signup failed') };
        }
        return { data: { user: json?.user ?? null }, error: null, needsConfirmation: json?.needsConfirmation ?? false } as any;
      } catch (err: any) {
        return { data: { user: null }, error: err } as any;
      }
    }

    return result;
  } catch (err: any) {
    // network or unexpected error - surface it
    return { data: { user: null }, error: err } as any;
  }
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
  const appMetadata = (user as any).app_metadata as Record<string, any> | undefined;
  const userMetadata = (user as any).user_metadata as Record<string, any> | undefined;
  const metadata = { ...(appMetadata || {}), ...(userMetadata || {}) };
  return metadata?.role === 'ADMIN' || metadata?.is_admin === true || metadata?.isAdmin === true;
};

export const requestPasswordRecovery = async (email: string) => {
  const client = getSupabaseClient();
  const redirectUrl = typeof window !== 'undefined'
    ? new URL('/reset-password', window.location.origin).toString()
    : undefined;

  if (!redirectUrl) {
    return { error: new Error('No se pudo determinar la URL de redirección para recuperación de contraseña.') } as any;
  }

  try {
    // Prefer client helper if available
    // @ts-ignore
    if (typeof client.auth.resetPasswordForEmail === 'function') {
      // @ts-ignore
      return await client.auth.resetPasswordForEmail(email, { redirectTo: redirectUrl });
    }

    const url = (import.meta.env.VITE_SUPABASE_URL ?? '') + '/auth/v1/recover';
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';
    if (!key) {
      return { error: new Error('Falta VITE_SUPABASE_ANON_KEY para recuperación de contraseña.') } as any;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify({ email, redirect_to: redirectUrl }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) return { error: new Error(json?.error || json?.message || 'Recovery request failed') } as any;
    return { data: json, error: null } as any;
  } catch (err: any) {
    return { error: err } as any;
  }
};
