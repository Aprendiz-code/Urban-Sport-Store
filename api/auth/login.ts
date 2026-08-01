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
    const email = body?.email;
    const password = body?.password;

    if (!email || !password) {
      return jsonError(res, 400, 'Missing email or password');
    }

    const { data, error } = await supabasePublic.auth.signInWithPassword({ email, password });

    if (error || !data?.session?.access_token) {
      return jsonError(res, 401, error?.message || 'Invalid login credentials');
    }

    return jsonResponse(res, {
      data: {
        token: data.session.access_token,
        user: data.user,
      },
    });
  } catch (error: any) {
    return jsonError(res, 500, error?.message ?? 'Unable to handle login request');
  }
}
