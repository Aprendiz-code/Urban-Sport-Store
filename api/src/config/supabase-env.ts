import { env } from './env.js';

export const getSupabaseConfig = () => ({
  url: env.supabaseUrl,
  serviceRoleKey: env.supabaseServiceRoleKey,
});
