import { jsonError, jsonResponse } from '../../lib/api-helpers/response.js';
import { supabasePublic } from '../../lib/api-helpers/supabase.js';

function parseJsonBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: any) => {
      body += chunk;
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return jsonError(res, 405, 'Method not allowed');
  }

  try {
    const body = await parseJsonBody(req);
    const secret = body?.secret;
    const expectedSecret = process.env.E2E_SECRET;
    const adminEmail = process.env.E2E_ADMIN_EMAIL;
    const adminPassword = process.env.E2E_ADMIN_PASSWORD;

    if (!expectedSecret) {
      return jsonError(res, 500, 'E2E_SECRET not configured');
    }

    if (!secret || secret !== expectedSecret) {
      return jsonError(res, 401, 'Invalid E2E secret');
    }

    if (!adminEmail || !adminPassword) {
      return jsonError(res, 500, 'E2E_ADMIN_EMAIL or E2E_ADMIN_PASSWORD not configured');
    }

    const { data, error } = await supabasePublic.auth.signInWithPassword({ email: adminEmail, password: adminPassword });

    if (error || !data?.session?.access_token) {
      return jsonError(res, 401, error?.message || 'Unable to sign in E2E admin');
    }

    return jsonResponse(res, {
      data: {
        token: data.session.access_token,
      },
    });
  } catch (error: any) {
    return jsonError(res, 500, error?.message ?? 'Unable to handle token request');
  }
}
