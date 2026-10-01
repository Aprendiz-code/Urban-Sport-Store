import type { RealtimeSubscription, User } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseEnabled } from './supabase-client';

export const DEMO_ADMIN_EMAIL = 'admin@urbansport.test';
export const DEMO_ADMIN_PASSWORD = 'Admin123!';
const DEMO_ADMIN_STORAGE_KEY = 'demo-admin-user';

const readStoredDemoUser = (): User | null => {
  if (typeof window === 'undefined') return null;

  try {
    const raw = window.localStorage.getItem(DEMO_ADMIN_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as User | null;
    return parsed && parsed.email === DEMO_ADMIN_EMAIL ? parsed : null;
  } catch {
    return null;
  }
};

const saveDemoUser = (user: User) => {
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(DEMO_ADMIN_STORAGE_KEY, JSON.stringify(user));
  }
};

const clearDemoUser = () => {
  if (typeof window !== 'undefined') {
    window.localStorage.removeItem(DEMO_ADMIN_STORAGE_KEY);
  }
};

export const getDemoAdminUser = (email: string, password: string): User | null => {
  if (email.trim().toLowerCase() !== DEMO_ADMIN_EMAIL.toLowerCase()) return null;
  if (password !== DEMO_ADMIN_PASSWORD) return null;

  const now = new Date().toISOString();

  return {
    id: 'demo-admin-user',
    email: DEMO_ADMIN_EMAIL,
    created_at: now,
    updated_at: now,
    last_sign_in_at: now,
    app_metadata: {
      role: 'ADMIN',
      isAdmin: true,
      provider: 'demo',
    },
    user_metadata: {
      full_name: 'Admin Demo',
      role: 'ADMIN',
      isAdmin: true,
    },
    aud: 'authenticated',
    role: 'authenticated',
  } as User;
};

export const signInWithEmail = async (email: string, password: string) => {
  const demoUser = getDemoAdminUser(email, password);
  if (demoUser) {
    saveDemoUser(demoUser);
    return { data: { user: demoUser }, error: null };
  }

  if (!isSupabaseEnabled()) {
    return { data: { user: null }, error: new Error('El inicio de sesión requiere configurar Supabase.') };
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

export const signUpWithEmail = async (email: string, password: string, options?: { name?: string }) => {
  const demoUser = getDemoAdminUser(email, password);
  if (demoUser) {
    saveDemoUser(demoUser);
    return { data: { user: demoUser }, error: null, needsConfirmation: false };
  }

  if (!isSupabaseEnabled()) {
    return { data: { user: null }, error: new Error('El registro requiere configurar Supabase.'), needsConfirmation: false };
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
  clearDemoUser();

  if (!isSupabaseEnabled()) {
    return { error: null, data: null };
  }

  const client = getSupabaseClient();
  return client.auth.signOut();
};

export const getCurrentUser = async () => {
  const storedDemoUser = readStoredDemoUser();
  if (storedDemoUser) {
    return storedDemoUser;
  }

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
  const storedDemoUser = readStoredDemoUser();
  if (storedDemoUser) {
    callback('SIGNED_IN', { user: storedDemoUser });
    return { unsubscribe: () => { /* no-op */ } } as RealtimeSubscription;
  }

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
  const metadata = user.app_metadata as Record<string, unknown> | undefined;
  const role = typeof metadata?.role === 'string' ? metadata.role.toUpperCase() : '';
  return (
    ['OWNER', 'ADMIN', 'CATALOG_MANAGER', 'LOGISTICS', 'ACCOUNTANT'].includes(role) ||
    metadata?.isAdmin === true ||
    metadata?.is_admin === true
  );
};
