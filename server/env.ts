import { serverConfig } from './config.js';

export function requireSupabaseConfig() {
  if (!serverConfig.supabaseUrl || !serverConfig.supabaseServiceKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in environment.');
  }
}
