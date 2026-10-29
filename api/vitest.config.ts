import { createRequire } from 'node:module';
import { defineConfig } from 'vitest/config';

const rootRequire = createRequire(new URL('../package.json', import.meta.url));

export default defineConfig({
  // This Vitest-only alias shares the root workspace Supabase client with API helpers.
  resolve: {
    alias: {
      '@supabase/supabase-js': rootRequire.resolve('@supabase/supabase-js'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.ts'],
    exclude: ['node_modules', 'dist'],
  },
});
