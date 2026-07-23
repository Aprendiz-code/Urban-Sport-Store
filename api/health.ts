import { jsonResponse } from './lib/response.js';

export default function handler(_req: any, res: any) {
  jsonResponse(res, {
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV ?? 'development',
  });
}
