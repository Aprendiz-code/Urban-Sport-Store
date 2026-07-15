import type { RealtimeSubscription, User } from '@supabase/supabase-js';
import { getSupabaseClient } from './supabase-client';

export const signInWithEmail = async (email: string, password: string) => {
  const client = getSupabaseClient();
  return client.auth.signInWithPassword({ email, password });
};

export const signUpWithEmail = async (email: string, password: string, options?: { name?: string }) => {
  const client = getSupabaseClient();
  return client.auth.signUp({ email, password, options: { data: { full_name: options?.name ?? '' } } });
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
  // session may be null
  // access_token is required for backend auth bridging
  // return null when not available
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = (data as any)?.session ?? null;
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
  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL ?? 'admin@urbansportstore.dev';
  const metadata = user.user_metadata as Record<string, any> | undefined;
  return (
    user.email === adminEmail ||
    metadata?.role === 'ADMIN' ||
    metadata?.is_admin === true ||
    metadata?.isAdmin === true
  );
};
