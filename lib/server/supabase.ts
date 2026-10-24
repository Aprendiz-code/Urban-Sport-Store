import { createClient } from '@supabase/supabase-js';
import { getSupabaseRuntimeConfig, RuntimeConfigurationError } from '../api-helpers/runtime-config.ts';

const config = getSupabaseRuntimeConfig();

if (!config.serviceRoleKey) {
  throw new RuntimeConfigurationError('Required environment variable SUPABASE_SERVICE_ROLE_KEY is missing or empty.');
}

export const supabase = createClient(config.url, config.serviceRoleKey, {
  auth: { persistSession: false },
});

