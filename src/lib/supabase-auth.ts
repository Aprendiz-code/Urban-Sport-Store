import type { RealtimeSubscription, User } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseEnabled } from './supabase-client';

const LOCAL_USER_KEY = 'urbansport_local_user';
const LOCAL_TOKEN = 'local-admin-token';

const adminEmail = (import.meta.env.VITE_ADMIN_EMAIL ?? 'Urbansportstore@outlook.com').toLowerCase();
const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD ?? 'bM4_tX!8wK2#vP7$qR';
const adminMetadata = { full_name: 'Administrador', role: 'ADMIN', isAdmin: true };

const getUserMetadata = (email: string, name?: string) => {
  const isAdmin = email.toLowerCase() === adminEmail;
  return {
    full_name: name ?? (isAdmin ? 'Administrador' : email),
    role: isAdmin ? 'ADMIN' : 'CUSTOMER',
    isAdmin: isAdmin,
  };
};

const isAdminCredentials = (email: string, password: string) => {
  const isAdmin = email.toLowerCase() === adminEmail && password === adminPassword;
  // Debug log to help troubleshoot
  if (!isAdmin && email.toLowerCase().includes('urban')) {
    console.debug('[Admin Auth Debug]', {
      inputEmail: email.toLowerCase(),
      expectedEmail: adminEmail,
      emailMatch: email.toLowerCase() === adminEmail,
      inputPassword: `${password.substring(0, 3)}...${password.substring(password.length - 3)}`,
      expectedPassword: `${adminPassword.substring(0, 3)}...${adminPassword.substring(password.length - 3)}`,
      passwordMatch: password === adminPassword,
      passwordLength: { input: password.length, expected: adminPassword.length }
    });
  }
  return isAdmin;
};

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
    if (isAdminCredentials(email, password)) {
      const user = {
        id: 'local-admin',
        email,
        user_metadata: adminMetadata,
      } as unknown as User;
      setLocalUser(user);
      return { data: { user }, error: null };
    }

    const user = {
      id: `local-${Date.now()}`,
      email,
      user_metadata: { full_name: email, role: 'CUSTOMER' },
    } as unknown as User;
    setLocalUser(user);
    return { data: { user }, error: null };
  }

  const client = getSupabaseClient();
  const result = await client.auth.signInWithPassword({ email, password });

  if (result.error) {
    if (result.error.message?.includes('Email not confirmed') || result.error.code === 'email_not_confirmed') {
      return { data: { user: null }, error: new Error('Debes confirmar tu correo antes de iniciar sesión.') };
    }
    return result;
  }

  if (result.data.user) {
    setLocalUser(result.data.user);
  }

  return result;
};

export const signUpWithEmail = async (email: string, password: string, options?: { name?: string }) => {
  if (!isSupabaseEnabled()) {
    const user = {
      id: `local-${Date.now()}`,
      email,
      user_metadata: getUserMetadata(email, options?.name),
    } as unknown as User;
    setLocalUser(user);
    return { data: { user }, error: null, needsConfirmation: false };
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
      if (refreshedUser.data.user) {
        setLocalUser(refreshedUser.data.user);
      }
      return { ...result, data: { ...result.data, user: refreshedUser.data.user ?? result.data.user }, needsConfirmation: false };
    }
  }

  if (!result.error && result.data.user) {
    setLocalUser(result.data.user);
    return { ...result, data: { ...result.data, user: result.data.user }, needsConfirmation: !result.data.session };
  }

  return result;
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
    user.email?.toLowerCase() === adminEmail ||
    metadata?.role === 'ADMIN' ||
    metadata?.is_admin === true ||
    metadata?.isAdmin === true
  );
};
