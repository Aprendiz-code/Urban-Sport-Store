import { defineConfig } from '@playwright/test';

const localBaseUrl = 'http://127.0.0.1:5173';
const syntheticSupabaseUrl = 'https://checkout-test.supabase.test';
const syntheticSupabaseAnonKey = 'phase1-synthetic-anon-key';

process.env.E2E_BASE_URL = localBaseUrl;

export default defineConfig({
  testDir: './tests',
  timeout: 30 * 1000,
  use: {
    headless: true,
    baseURL: localBaseUrl,
  },
  webServer: {
    command: 'pnpm dev --host 127.0.0.1 --port 5173 --strictPort',
    url: localBaseUrl,
    reuseExistingServer: !process.env.CI,
    env: {
      VITE_API_URL: `${localBaseUrl}/api`,
      VITE_SUPABASE_URL: syntheticSupabaseUrl,
      VITE_SUPABASE_ANON_KEY: syntheticSupabaseAnonKey,
    },
  },
});
