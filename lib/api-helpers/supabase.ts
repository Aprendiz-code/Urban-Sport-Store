import { createClient } from '@supabase/supabase-js';
import { getSupabaseRuntimeConfig } from './runtime-config.ts';

const config = getSupabaseRuntimeConfig();

// Public client: uses anon key for RLS-protected public access
export const supabasePublic = createClient(config.url, config.anonKey, {
  auth: {
    persistSession: false,
  },
});

// Admin client: uses service role key for admin operations
let supabaseAdminClient: any = null;
if (config.serviceRoleKey) {
  supabaseAdminClient = createClient(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
    },
  });
} else {
  console.warn('SUPABASE_SERVICE_ROLE_KEY not configured; admin operations will be unavailable.');
}

export const supabaseAdmin = supabaseAdminClient;

// Backward compatibility: default export is public client
export const supabase = supabasePublic;
