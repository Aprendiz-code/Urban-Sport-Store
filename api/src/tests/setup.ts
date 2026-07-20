import { prisma } from '../db/prisma.js';

try {
  await prisma.$connect();
} catch (err) {
  console.warn('⚠️ Could not connect to database during test setup. Some tests may be skipped.');
  process.env.SKIP_DB_TESTS = '1';
} finally {
  try {
    await prisma.$disconnect();
  } catch {
    // ignore
  }
}
