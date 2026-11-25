import { defineConfig } from '@playwright/test';

const localBaseUrl = 'http://localhost:5173';
const syntheticSupabaseUrl = 'https://checkout-test.supabase.test';
const syntheticSupabaseAnonKey = 'phase1-synthetic-anon-key';

process.env.E2E_BASE_URL = localBaseUrl;
process.env.VITE_API_URL = `${localBaseUrl}/api`;
process.env.VITE_SUPABASE_URL = syntheticSupabaseUrl;
process.env.VITE_SUPABASE_ANON_KEY = syntheticSupabaseAnonKey;

export default defineConfig({
  testDir: './tests',
  testIgnore: '**/admin-product-category.spec.ts',
  timeout: 30 * 1000,
  use: {
    headless: true,
    baseURL: localBaseUrl,
  },
  webServer: {
    command: 'npm.cmd run dev -- --host 127.0.0.1 --port 5173 --strictPort',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: false,
    env: {
      VITE_API_URL: `${localBaseUrl}/api`,
      VITE_SUPABASE_URL: syntheticSupabaseUrl,
      VITE_SUPABASE_ANON_KEY: syntheticSupabaseAnonKey,
    },
  },
});
