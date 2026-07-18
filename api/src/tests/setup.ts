import { beforeAll, afterAll } from 'vitest';
import { prisma } from '../db/prisma.js';

beforeAll(async () => {
  try {
    await prisma.$connect();
  } catch (err) {
    console.warn('⚠️ Could not connect to database during test setup. Some tests may be skipped.');
  }
});

afterAll(async () => {
  try {
    await prisma.$disconnect();
  } catch (err) {
    // ignore
  }
});
