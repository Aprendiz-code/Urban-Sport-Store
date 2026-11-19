import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    'import.meta.env.VITE_API_URL': JSON.stringify('http://127.0.0.1:3000/api'),
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    globals: true,
  },
});
