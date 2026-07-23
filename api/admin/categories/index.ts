import { jsonError, jsonResponse, ApiError } from '../../lib/response.js';
import { supabase } from '../../lib/supabase.js';
import { requireAdmin } from '../../lib/admin.js';
import { validateSupabaseToken } from '../../lib/auth.js';

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

function buildCategoryPayload(body: any) {
  const payload: any = {};

  if (typeof body.name === 'string') payload.name = body.name.trim();
  if (typeof body.slug === 'string') payload.slug = body.slug.trim();
  if (typeof body.description === 'string') payload.description = body.description.trim();
  if (typeof body.image === 'string') payload.image = body.image.trim();
  if (typeof body.sort_order === 'number') payload.sort_order = body.sort_order;
  if (typeof body.sort_order === 'string' && body.sort_order.trim() !== '') {
    const parsed = Number(body.sort_order);
    if (!Number.isNaN(parsed)) payload.sort_order = parsed;
  }
  if (typeof body.is_active === 'boolean') payload.is_active = body.is_active;

  return payload;
}

export default async function handler(req: any, res: any) {
  try {
    const user = await validateSupabaseToken(req);
    await requireAdmin(user.id);

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('categories').select('*').order('sort_order', { ascending: true });
      if (error) {
        return jsonError(res, 500, error.message || 'Unable to fetch categories.');
      }
      return jsonResponse(res, { data });
    }

    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const payload = buildCategoryPayload(body);

      if (!payload.name || !payload.slug) {
        throw new ApiError(400, 'Missing required fields: name, slug');
      }

      const { data, error } = await supabase.from('categories').insert([payload]).select('*').single();
      if (error) {
        return jsonError(res, 500, error.message || 'Unable to create category.');
      }

      await supabase.from('audit_logs').insert({
        actor_id: user.id,
        action: 'create_category',
        entity: 'category',
        entity_id: data.id,
        changes: payload,
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
