import { env } from './env.js';

export const featureFlags = {
  useHomeContentTable: env.nodeEnv !== 'production' || env.useHomeContentTable,
};
