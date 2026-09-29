import { jsonError, jsonResponse } from '../../lib/api-helpers/response.js';
import { supabaseAdmin } from '../../lib/api-helpers/supabase.js';

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

  if (!supabaseAdmin) {
    return jsonError(res, 500, 'Server misconfiguration: SUPABASE_SERVICE_ROLE_KEY missing');
  }

  try {
    const body = await parseJsonBody(req);
    const email = body?.email;
    const password = body?.password;
    const name = body?.name ?? '';

    if (!email || !password) {
      return jsonError(res, 400, 'Missing email or password');
    }

    // Use the admin client to create the user bypassing client restrictions
    // @ts-ignore
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      user_metadata: { full_name: name },
      email_confirm: false,
    });

    if (error) {
      return jsonError(res, 400, error.message || 'Unable to create user');
    }

    return jsonResponse(res, { user: data.user ?? null, needsConfirmation: false });
  } catch (error: any) {
    return jsonError(res, 500, error?.message ?? 'Unable to handle register request');
  }
}
