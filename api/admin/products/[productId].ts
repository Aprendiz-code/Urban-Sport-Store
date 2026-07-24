import { jsonError, jsonResponse, ApiError } from '../../lib/response.js';
import { supabaseAdmin } from '../../lib/supabase.js';
import { requireAdmin } from '../../lib/admin.js';
import { validateSupabaseToken } from '../../lib/auth.js';
import { normalizeProductUpdates } from './helpers.js';

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

function extractProductId(req: any): string | null {
  const url = new URL(req.url ?? '', 'http://localhost');
  const segments = url.pathname.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? null;
}

export default async function handler(req: any, res: any) {
  try {
    const user = await validateSupabaseToken(req);
    await requireAdmin(user.id);

    const productId = extractProductId(req);
    if (!productId) {
      throw new ApiError(400, 'Missing productId');
    }

    if (req.method === 'PATCH') {
      const body = await parseJsonBody(req);
      const updates = await normalizeProductUpdates(body);
      if (Object.keys(updates).length === 0) {
        throw new ApiError(400, 'No update fields provided');
      }

      // Get before state
      const { data: beforeData, error: beforeError } = await supabaseAdmin
        .from('products')
        .select('*')
        .eq('id', productId)
        .maybeSingle();
      if (beforeError || !beforeData) {
        return jsonError(res, 404, 'Product not found.');
      }

      const { data, error } = await supabaseAdmin.from('products').update(updates).eq('id', productId).select('*').maybeSingle();
      if (error) {
        return jsonError(res, 500, error.message || 'Unable to update product.');
      }
      if (!data) {
        return jsonError(res, 404, 'Product not found.');
      }

      await supabaseAdmin.from('audit_logs').insert({
        actor_id: user.id,
        action: 'update_product',
        entity: 'product',
        entity_id: productId,
        entity_id_uuid: productId,
        before_data: beforeData,
        after_data: data,
      });

      return jsonResponse(res, { data });
    }

    if (req.method === 'DELETE') {
      // Get before state
      const { data: beforeData, error: beforeError } = await supabaseAdmin
        .from('products')
        .select('*')
        .eq('id', productId)
        .maybeSingle();
      if (beforeError || !beforeData) {
        return jsonError(res, 404, 'Product not found.');
      }

      const { data, error } = await supabaseAdmin.from('products').update({ is_active: false }).eq('id', productId).select('*').maybeSingle();
      if (error) {
        return jsonError(res, 500, error.message || 'Unable to delete product.');
      }
      if (!data) {
        return jsonError(res, 404, 'Product not found.');
      }

      await supabaseAdmin.from('audit_logs').insert({
        actor_id: user.id,
        action: 'soft_delete_product',
        entity: 'product',
        entity_id: productId,
        entity_id_uuid: productId,
        before_data: beforeData,
        after_data: data,
      });

      res.statusCode = 204;
      return res.end();
    }

    return jsonError(res, 405, 'Method not allowed.');
  } catch (error: any) {
    if (error instanceof ApiError) {
      return jsonError(res, error.status, error.message);
    }
    return jsonError(res, 500, error?.message ?? 'Unable to handle request.');
  }
}
