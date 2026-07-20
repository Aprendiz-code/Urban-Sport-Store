import path from 'node:path';
import dotenv from 'dotenv';

export const loadEnvFiles = () => {
  const cwd = process.cwd();
  const parentDir = path.resolve(cwd, '..');
  const isApiFolder = path.basename(cwd) === 'api';

  const envPaths = (dir: string) => [
    path.resolve(dir, '.env'),
    path.resolve(dir, '.env.local'),
    path.resolve(dir, '.env.development.local'),
  ];

  const load = (filePath: string, override = false) => dotenv.config({ path: filePath, override });

  if (isApiFolder) {
    // When running from api/, first load root-level env if available, then allow api/.env.* to override it.
    for (const filePath of envPaths(parentDir)) {
      load(filePath);
    }
    for (const filePath of envPaths(cwd)) {
      load(filePath, true);
    }
  } else {
    // Running from project root: load root env, then override with api env files if present.
    for (const filePath of envPaths(cwd)) {
      load(filePath);
    }

    const apiDir = path.resolve(cwd, 'api');
    for (const filePath of envPaths(apiDir)) {
      load(filePath, true);
    }
  }
};

loadEnvFiles();

const getEnv = (key: string, fallback?: string): string => {
  const value = process.env[key];
  if (value === undefined || value === '') {
    return fallback ?? '';
  }
  return value;
};

const normalizeDatabaseUrl = (value: string): string => {
  if (!value) return value;
  try {
    const url = new URL(value);
    if ((url.protocol === 'postgres:' || url.protocol === 'postgresql:') && url.hostname.endsWith('.supabase.co')) {
      if (!url.searchParams.has('sslmode')) {
        url.searchParams.set('sslmode', 'require');
      }
      if (!url.searchParams.has('connect_timeout')) {
        url.searchParams.set('connect_timeout', '5');
      }
      return url.toString();
    }
  } catch {
    // ignore malformed URLs and use the raw value
  }
  return value;
};

const parseBoolean = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined) return fallback;
  return value === 'true';
};

const normalizeOrigin = (value: string): string => {
  const trimmed = value.trim().replace(/\/$/, '');
  if (!trimmed) return '';
  if (trimmed === '*') return '*';

  try {
    const url = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? new URL(trimmed)
      : new URL(`https://${trimmed}`);
    return `${url.protocol}//${url.host}`;
  } catch {
    return trimmed;
  }
};

const rawDatabaseUrl = getEnv('DATABASE_URL', '');

// En desarrollo, si DATABASE_URL es Supabase (no accesible), usar localhost
let databaseUrl = rawDatabaseUrl;
const nodeEnv = getEnv('NODE_ENV', 'development');

if (!databaseUrl) {
  databaseUrl = 'postgresql://postgres:postgres@localhost:5432/urbansportstore';
}

databaseUrl = normalizeDatabaseUrl(databaseUrl);
if (databaseUrl !== rawDatabaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
}

export const env = {
  port: Number(getEnv('PORT', '4000')),
  nodeEnv: getEnv('NODE_ENV', 'development'),
  databaseUrl,
  jwtSecret: getEnv('JWT_SECRET', 'dev-secret'),
  jwtExpiresIn: getEnv('JWT_EXPIRES_IN', '15m'),
  refreshTokenTtlDays: Number(getEnv('REFRESH_TOKEN_TTL_DAYS', '7')),
  cookieSameSite: getEnv('COOKIE_SAMESITE', 'lax') as 'lax' | 'strict' | 'none',
  corsOrigins: getEnv('CORS_ORIGINS', 'http://localhost:3000')
    .split(',')
    .map(normalizeOrigin)
    .filter(Boolean),
  rateLimitWindowMs: Number(getEnv('RATE_LIMIT_WINDOW_MS', '900000')),
  rateLimitMax: Number(getEnv('RATE_LIMIT_MAX', '120')),
  authRateLimitMax: Number(getEnv('AUTH_RATE_LIMIT_MAX', '10')),
  seedAdminEmail: getEnv('SEED_ADMIN_EMAIL', 'admin@urbansportstore.dev'),
  seedAdminPassword: getEnv('SEED_ADMIN_PASSWORD', 'ChangeMe123!'),
  seedAdminName: getEnv('SEED_ADMIN_NAME', 'Admin Urban Sport Store'),
  secureCookies: parseBoolean(getEnv('SECURE_COOKIES', 'false'), false),
  supabaseUrl: getEnv('SUPABASE_URL', ''),
  supabaseServiceRoleKey: getEnv('SUPABASE_SERVICE_ROLE_KEY', ''),
  e2eSecret: getEnv('E2E_SECRET', ''),
};
