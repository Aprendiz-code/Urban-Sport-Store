import { createClient } from '@supabase/supabase-js';
import { serverConfig } from '../server/config.js';

// Prefer explicit environment variables, fallback to serverConfig
const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? serverConfig.supabaseUrl;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? serverConfig.supabaseServiceKey;

if (!supabaseUrl || !supabaseServiceKey) {
  // eslint-disable-next-line no-console
  console.warn('Supabase server client not fully configured: some operations may fail.');
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});
