import { jsonResponse } from '../lib/api-helpers/response.ts';

export default function handler(_req: any, res: any) {
  jsonResponse(res, {
    ok: true,
    service: 'urbansport-api',
  });
}
