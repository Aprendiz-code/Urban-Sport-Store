import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL in environment.');
}

if (!supabaseAnonKey && !supabaseServiceRoleKey) {
  throw new Error('Missing SUPABASE_ANON_KEY, VITE_SUPABASE_ANON_KEY, or SUPABASE_SERVICE_ROLE_KEY in environment.');
}

if (!supabaseAnonKey && supabaseServiceRoleKey) {
  console.warn('Supabase anon key not configured; falling back to service role key for server-side Supabase auth operations.');
}

const publicClientKey = supabaseAnonKey ?? supabaseServiceRoleKey;

// Public client: uses anon key for RLS-protected public access when available.
// On backend-only paths, service role may be used as a fallback if anon is missing.
export const supabasePublic = createClient(supabaseUrl, publicClientKey, {
  auth: {
    persistSession: false,
  },
});

// Admin client: uses service role key for admin operations
let supabaseAdminClient: any = null;
if (supabaseServiceRoleKey) {
  supabaseAdminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
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
