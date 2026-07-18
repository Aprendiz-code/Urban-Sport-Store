import path from 'node:path';
import dotenv from 'dotenv';

export const loadEnvFiles = () => {
  // Try to load from current directory first
  dotenv.config({ path: path.resolve(process.cwd(), '.env') });
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local'), override: true });
  
  // If running from project root and in a monorepo structure, also try api/.env.local
  const apiEnvPath = path.resolve(process.cwd(), 'api', '.env.local');
  if (process.cwd() !== path.resolve(process.cwd(), 'api')) {
    dotenv.config({ path: apiEnvPath, override: true });
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

const parseBoolean = (value: string | undefined, fallback = false): boolean => {
  if (value === undefined) return fallback;
  return value === 'true';
};

export const env = {
  port: Number(getEnv('PORT', '4000')),
  nodeEnv: getEnv('NODE_ENV', 'development'),
  databaseUrl: getEnv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/urbansportstore'),
  jwtSecret: getEnv('JWT_SECRET', 'dev-secret'),
  jwtExpiresIn: getEnv('JWT_EXPIRES_IN', '15m'),
  refreshTokenTtlDays: Number(getEnv('REFRESH_TOKEN_TTL_DAYS', '7')),
  cookieSameSite: getEnv('COOKIE_SAMESITE', 'lax') as 'lax' | 'strict' | 'none',
  corsOrigins: getEnv('CORS_ORIGINS', 'http://localhost:3000').split(','),
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
