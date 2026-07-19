import app from './app.js';
import { env } from './config/env.js';
import { prisma } from './db/prisma.js';

const start = async (): Promise<void> => {
  try {
    await prisma.$connect();
    console.log('✓ Connected to database');
  } catch (err) {
    console.warn('⚠️ Could not connect to database. Using fallback in-memory storage.');
    console.warn('Error:', (err as any).message);
  }
  
  app.listen(env.port, () => {
    console.log(`✓ Urban Sport Store API listening on port ${env.port}`);
  });
};

start().catch((error) => {
  console.error('Fatal error starting server:', error);
  process.exit(1);
});
