import type { User } from '@supabase/supabase-js';
import { getSupabaseClient, isSupabaseEnabled } from './supabase-client';

type RealtimeSubscription = { unsubscribe: () => void };

type AuthDiagnosticFields = {
  userId?: string | null;
  email?: string | null;
  sessionPresent?: boolean;
  httpStatus?: number | null;
  code?: string | null;
  message?: string | null;
  table?: string;
  rowFound?: boolean;
  role?: string | null;
  isAdmin?: boolean;
  authEvent?: string;
  redirectTo?: string;
  itemCount?: number;
};

export const logAuthDiagnostic = (event: string, fields: AuthDiagnosticFields = {}) => {
  if (!import.meta.env.DEV) return;

  const email = fields.email?.trim();
  const emailMask = email && email.includes('@')
    ? `${email.slice(0, 2)}***@${email.split('@').at(-1)}`
    : email ? '[email]' : undefined;
  const code = fields.code && /^[A-Za-z0-9_.-]{1,40}$/.test(fields.code) ? fields.code : undefined;
  const message = fields.message
    ?.replace(/\bBearer\s+[^\s,;]+/gi, 'Bearer [redacted]')
    .replace(/\beyJ[A-Za-z0-9_.-]+/g, '[redacted]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]')
    .slice(0, 240);

  console.info('[auth-diagnostic]', {
    event,
    ...(fields.userId ? { userIdPrefix: fields.userId.slice(0, 8) } : {}),
    ...(emailMask ? { email: emailMask } : {}),
    ...(typeof fields.sessionPresent === 'boolean' ? { sessionPresent: fields.sessionPresent } : {}),
    ...(fields.httpStatus !== undefined ? { httpStatus: fields.httpStatus } : {}),
    ...(code ? { code } : {}),
    ...(message ? { message } : {}),
    ...(fields.table ? { table: fields.table } : {}),
    ...(typeof fields.rowFound === 'boolean' ? { rowFound: fields.rowFound } : {}),
    ...(fields.role ? { role: fields.role.trim().slice(0, 40) } : {}),
    ...(typeof fields.isAdmin === 'boolean' ? { isAdmin: fields.isAdmin } : {}),
    ...(fields.authEvent ? { authEvent: fields.authEvent.slice(0, 40) } : {}),
    ...(fields.redirectTo ? { redirectTo: fields.redirectTo.slice(0, 40) } : {}),
    ...(typeof fields.itemCount === 'number' ? { itemCount: fields.itemCount } : {}),
  });
};

export const signInWithEmail = async (email: string, password: string) => {
  if (!isSupabaseEnabled()) {
    logAuthDiagnostic('sign-in.unavailable', { email, sessionPresent: false });
    return {
      data: { user: null },
      error: new Error('El inicio de sesión requiere configurar Supabase. No hay credenciales demo activas en producción.'),
    };
  }

  const client = getSupabaseClient();
  const result = await client.auth.signInWithPassword({ email, password });
  logAuthDiagnostic('sign-in.result', {
    email: result.data.user?.email ?? email,
    userId: result.data.user?.id,
    sessionPresent: Boolean(result.data.session),
    httpStatus: result.error?.status ?? (result.error ? null : 200),
    code: result.error?.code,
    message: result.error?.message,
  });

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

const signUpMessages = {
  emailExists: 'Ya existe una cuenta registrada con este correo electrónico. Inicia sesión o usa otro correo.',
  invalidEmail: 'Ingresa un correo electrónico válido.',
  invalidPassword: 'La contraseña no cumple los requisitos de seguridad.',
  passwordMismatch: 'Las contraseñas no coinciden.',
  termsNotAccepted: 'Debes aceptar los Términos y Condiciones y la Política de Privacidad para crear tu cuenta.',
  network: 'No pudimos conectarnos con el servidor. Revisa tu conexión e inténtalo nuevamente.',
  server: 'No fue posible crear tu cuenta en este momento. Inténtalo de nuevo más tarde.',
  unknown: 'Ocurrió un problema al crear tu cuenta. Inténtalo nuevamente.',
} as const;

export function getSignUpErrorMessage(error: unknown): string {
  const details = error && typeof error === 'object'
    ? error as { code?: unknown; status?: unknown; message?: unknown }
    : {};
  const code = typeof details.code === 'string' ? details.code.toLowerCase() : '';
  const status = typeof details.status === 'number' ? details.status : undefined;
  const message = typeof details.message === 'string' ? details.message.trim() : '';
  const normalizedMessage = message.toLowerCase();

  if (Object.values(signUpMessages).includes(message as typeof signUpMessages[keyof typeof signUpMessages])) {
    return message;
  }
  if (['user_already_exists', 'email_exists', 'email_already_exists'].includes(code)
    || normalizedMessage.includes('already registered')
    || normalizedMessage.includes('already exists')) {
    return signUpMessages.emailExists;
  }
  if (['email_address_invalid', 'invalid_email'].includes(code) || normalizedMessage.includes('invalid email')) {
    return signUpMessages.invalidEmail;
  }
  if (['weak_password', 'password_too_short'].includes(code)
    || (normalizedMessage.includes('password') && normalizedMessage.includes('at least'))) {
    const minimumLength = message.match(/at least\s+(\d+)\s+characters?/i)?.[1];
    return minimumLength
      ? `Usa una contraseña de al menos ${minimumLength} caracteres.`
      : signUpMessages.invalidPassword;
  }
  if (code === 'password_mismatch') return signUpMessages.passwordMismatch;
  if (status === 429 || code.includes('rate_limit') || /rate limit|too many requests/i.test(message)) {
    return signUpMessages.server;
  }
  if (/failed to fetch|network error|fetch failed/i.test(message)) return signUpMessages.network;
  if ((status !== undefined && status >= 500) || /database error|internal server error/i.test(message)) {
    return signUpMessages.server;
  }

  return signUpMessages.unknown;
}

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
  const fullName = options?.name?.trim() ?? '';
  const result = await client.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, display_name: fullName },
      emailRedirectTo: redirectUrl,
    },
  });

  if (result.error) {
    return { ...result, error: new Error(getSignUpErrorMessage(result.error)) };
  }

  return {
    ...result,
    data: { ...result.data, user: result.data.user },
    needsConfirmation: Boolean(result.data.user && !result.data.session),
  };
};

export const signOut = async () => {
  if (!isSupabaseEnabled()) {
    return { error: null, data: null };
  }

  const client = getSupabaseClient();
  const result = await client.auth.signOut();
  logAuthDiagnostic('sign-out.result', {
    sessionPresent: false,
    httpStatus: result.error?.status ?? (result.error ? null : 204),
    code: result.error?.code,
    message: result.error?.message,
  });
  return result;
};

export const getCurrentUser = async () => {
  if (!isSupabaseEnabled()) {
    return null;
  }

  const client = getSupabaseClient();
  const { data: { user }, error } = await client.auth.getUser();
  logAuthDiagnostic('session.restore.result', {
    userId: user?.id,
    email: user?.email,
    sessionPresent: Boolean(user),
    httpStatus: error?.status ?? (error ? null : 200),
    code: error?.code,
    message: error?.message,
  });
  return user;
};

export const clearLocalAuthSession = async () => {
  if (!isSupabaseEnabled()) return;

  const client = getSupabaseClient();
  await client.auth.signOut({ scope: 'local' });
};

export const getAccessToken = async (forceRefresh = false) => {
  if (!isSupabaseEnabled()) {
    return null;
  }

  const client = getSupabaseClient();
  const { data, error } = await client.auth.getSession();
  if (error) {
    logAuthDiagnostic('session.read.failed', { httpStatus: error.status, code: error.code, message: error.message });
    return null;
  }

  const session = data.session;
  if (!session?.access_token) {
    logAuthDiagnostic('session.read.empty', { sessionPresent: false });
    return null;
  }

  const refreshThreshold = Math.floor(Date.now() / 1000) + 30;
  const shouldRefresh = forceRefresh || (typeof session.expires_at === 'number' && session.expires_at <= refreshThreshold);
  if (!shouldRefresh) return session.access_token;

  const refreshed = await client.auth.refreshSession();
  if (refreshed.error || !refreshed.data.session?.access_token) {
    logAuthDiagnostic('session.refresh.failed', {
      sessionPresent: false,
      httpStatus: refreshed.error?.status,
      code: refreshed.error?.code,
      message: refreshed.error?.message,
    });
    try {
      await clearLocalAuthSession();
    } catch {}
    return null;
  }

  logAuthDiagnostic('session.refresh.succeeded', { sessionPresent: true, httpStatus: 200 });
  return refreshed.data.session.access_token;
};

export const onAuthStateChange = (callback: (event: string, session: { user: User | null } | null) => void) => {
  if (!isSupabaseEnabled()) {
    return { unsubscribe: () => { /* no-op */ } } as RealtimeSubscription;
  }

  const client = getSupabaseClient();
  const { data } = client.auth.onAuthStateChange((event, session) => {
    logAuthDiagnostic('auth-state.changed', {
      authEvent: event,
      userId: session?.user.id,
      email: session?.user.email,
      sessionPresent: Boolean(session),
    });
    callback(event, session);
  });
  return data.subscription as RealtimeSubscription;
};
