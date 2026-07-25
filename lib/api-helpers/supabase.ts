import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error('Missing SUPABASE_URL in environment.');
}

if (!supabaseAnonKey) {
  throw new Error('Missing SUPABASE_ANON_KEY in environment.');
}

// Public client: uses anon key for RLS-protected public access
export const supabasePublic = createClient(supabaseUrl, supabaseAnonKey, {
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
