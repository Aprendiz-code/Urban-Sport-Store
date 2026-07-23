export const serverConfig = {
  supabaseUrl: process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL ?? '',
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  nodeEnv: process.env.NODE_ENV ?? 'development',
};

export const isSupabaseConfigured = !!serverConfig.supabaseUrl && !!serverConfig.supabaseServiceKey;
