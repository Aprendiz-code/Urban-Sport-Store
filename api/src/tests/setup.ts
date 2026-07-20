import { beforeAll, afterAll } from 'vitest';
import { prisma } from '../db/prisma.js';

beforeAll(async () => {
  try {
    await prisma.();
  } catch (err) {
    console.warn('⚠️ Could not connect to database during test setup. Some tests may be skipped.');
    // Signal tests to skip DB-dependent suites when Prisma cannot connect
    process.env.SKIP_DB_TESTS = '1';
  }
});

afterAll(async () => {
  try {
    await prisma.();
  } catch (err) {
    // ignore
  }
});
