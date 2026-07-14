import app from './app.js';
import { env } from './config/env.js';
import { prisma } from './db/prisma.js';

const start = async (): Promise<void> => {
  await prisma.$connect();
  app.listen(env.port, () => {
    console.log(`Urban Sport Store API listening on port ${env.port}`);
  });
};

start().catch((error) => {
  console.error(error);
  process.exit(1);
});
