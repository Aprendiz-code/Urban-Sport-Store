import type { RealtimeSubscription, User } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseEnabled } from './supabase-client';

const LOCAL_USER_KEY = 'urbansport_local_user';
const LOCAL_TOKEN = 'local-admin-token';

const adminEmail = import.meta.env.VITE_ADMIN_EMAIL ?? 'admin@urbansportstore.dev';
const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD ?? 'Admin123!';

const getLocalUser = (): User | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(LOCAL_USER_KEY);
    return raw ? JSON.parse(raw) as User : null;
  } catch {
    return null;
  }
};

const setLocalUser = (user: User | null) => {
  if (typeof window === 'undefined') return;
  if (!user) {
    window.localStorage.removeItem(LOCAL_USER_KEY);
  } else {
    window.localStorage.setItem(LOCAL_USER_KEY, JSON.stringify(user));
  }
};

export const signInWithEmail = async (email: string, password: string) => {
  if (!isSupabaseEnabled()) {
    if (email !== adminEmail || password !== adminPassword) {
      return { data: { user: null }, error: new Error('Credenciales inválidas. Usa el admin local.') };
    }
    const user = {
      id: 'local-admin',
      email,
      user_metadata: { full_name: 'Administrador local', role: 'ADMIN', isAdmin: true },
    } as unknown as User;
    setLocalUser(user);
    return { data: { user }, error: null };
  }

  const client = getSupabaseClient();
  return client.auth.signInWithPassword({ email, password });
};

export const signUpWithEmail = async (email: string, password: string, options?: { name?: string }) => {
  if (!isSupabaseEnabled()) {
    const user = {
      id: `local-${Date.now()}`,
      email,
      user_metadata: { full_name: options?.name ?? email, role: 'CUSTOMER' },
    } as unknown as User;
    setLocalUser(user);
    return { data: { user }, error: null };
  }

  const client = getSupabaseClient();
  return client.auth.signUp({ email, password, options: { data: { full_name: options?.name ?? '' } } });
};

export const signOut = async () => {
  if (!isSupabaseEnabled()) {
    setLocalUser(null);
    return { error: null, data: null };
  }

  const client = getSupabaseClient();
  return client.auth.signOut();
};

export const getCurrentUser = async () => {
  if (!isSupabaseEnabled()) {
    return getLocalUser();
  }

  const client = getSupabaseClient();
  const { data: { user } } = await client.auth.getUser();
  return user;
};

export const getAccessToken = async () => {
  if (!isSupabaseEnabled()) {
    return LOCAL_TOKEN;
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

export const isAdminUser = (user: User | null) => {
  if (!user) return false;
  const metadata = (user as any).user_metadata as Record<string, any> | undefined;
  return (
    user.email === adminEmail ||
    metadata?.role === 'ADMIN' ||
    metadata?.is_admin === true ||
    metadata?.isAdmin === true
  );
};
