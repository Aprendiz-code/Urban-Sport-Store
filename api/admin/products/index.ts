import { jsonError, jsonResponse, ApiError } from '../../../lib/api-helpers/response.js';
import { supabaseAdmin } from '../../../lib/api-helpers/supabase.js';
import { requireAdmin } from '../../../lib/api-helpers/admin.js';
import { validateSupabaseToken } from '../../../lib/api-helpers/auth.js';
import { normalizeProductPayload } from '../../../lib/api-helpers/product-helpers.js';

function parseJsonBody(req: any): Promise<any> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: any) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        reject(new ApiError(400, 'Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

export default async function handler(req: any, res: any) {
  try {
    const user = await validateSupabaseToken(req);
    await requireAdmin(user);

    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin.from('products').select('*').order('created_at', { ascending: false });
      if (error) {
        return jsonError(res, 500, error.message || 'Unable to fetch products.');
      }
      return jsonResponse(res, { data });
    }

    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const payload = await normalizeProductPayload(body);

      if (!payload.slug || !payload.name || payload.price === undefined || !payload.category_id) {
        throw new ApiError(400, 'Missing required fields: slug, name, price, category_id');
      }

      const { data, error } = await supabaseAdmin.from('products').insert([payload]).select('*').single();
      if (error) {
        return jsonError(res, 500, error.message || 'Unable to create product.');
      }

      await supabaseAdmin.from('audit_logs').insert({
        actor_id: user.id,
        action: 'create_product',
        entity: 'product',
        entity_id: data.id,
        entity_id_uuid: data.id,
        before_data: null,
        after_data: data,
      });

      return jsonResponse(res, { data }, 201);
    }

    return jsonError(res, 405, 'Method not allowed.');
  } catch (error: any) {
    if (error instanceof ApiError) {
      return jsonError(res, error.status, error.message);
    }
    return jsonError(res, 500, error?.message ?? 'Unable to handle request.');
  }
}
