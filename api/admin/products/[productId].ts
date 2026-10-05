import { jsonError, jsonResponse, jsonSupabaseError, ApiError } from '../../../lib/api-helpers/response.ts';
import { supabaseAdmin } from '../../../lib/api-helpers/supabase.ts';
import { requirePermission } from '../../../lib/api-helpers/admin.ts';
import { requireAuthenticatedUser } from '../../../lib/api-helpers/auth.ts';
import { normalizeProductUpdates } from '../../../lib/api-helpers/product-helpers.ts';

const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

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
    const user = await requireAuthenticatedUser(req);

    const productId = extractProductId(req);
    if (!productId) {
      throw new ApiError(400, 'Missing productId');
    }
    if (!UUID_PATTERN.test(productId)) {
      throw new ApiError(400, 'Invalid productId.');
    }

    const permission = req.method === 'PATCH'
      ? 'products.write'
      : req.method === 'DELETE'
        ? 'products.archive'
        : null;
    if (!permission) return jsonError(res, 405, 'Method not allowed.');
    await requirePermission(user, permission);

    if (req.method === 'PATCH') {
      const body = await parseJsonBody(req);
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ApiError(400, 'Request body must be an object.');
      }

      if (Object.prototype.hasOwnProperty.call(body, 'is_active')) {
        if (Object.keys(body).length !== 1 || typeof body.is_active !== 'boolean') {
          throw new ApiError(400, 'Availability updates must contain only a boolean is_active field.');
        }

        const { data: beforeData, error: beforeError } = await supabaseAdmin
          .from('products')
          .select('*')
          .eq('id', productId)
          .maybeSingle();
        if (beforeError) {
          return jsonSupabaseError(res, '[Admin Products] Product lookup before availability update failed', beforeError, 'Unable to load product before updating availability.');
        }
        if (!beforeData) {
          return jsonError(res, 404, 'Product not found.');
        }

        const { data, error } = await supabaseAdmin
          .from('products')
          .update({ is_active: body.is_active })
          .eq('id', productId)
          .select('*')
          .maybeSingle();
        if (error) {
          return jsonSupabaseError(res, '[Admin Products] Product availability update failed', error, 'Unable to update product availability.');
        }
        if (!data) {
          return jsonError(res, 404, 'Product not found.');
        }

        await supabaseAdmin.from('audit_logs').insert({
          actor_id: user.id,
          action: body.is_active ? 'activate_product' : 'deactivate_product',
          entity: 'product',
          entity_id: productId,
          entity_id_uuid: productId,
          before_data: beforeData,
          after_data: data,
        });

        return jsonResponse(res, { data });
      }

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
      if (beforeError) {
        return jsonSupabaseError(res, '[Admin Products] Product lookup before update failed', beforeError, 'Unable to load product before update.');
      }
      if (!beforeData) {
        return jsonError(res, 404, 'Product not found.');
      }

      if ('main_image' in updates || 'images' in updates) {
        const mainImage = updates.main_image ?? beforeData.main_image;
        const images = updates.images ?? beforeData.images;
        if (!mainImage && !(Array.isArray(images) && images.length > 0)) {
          throw new ApiError(400, 'El producto debe conservar al menos una imagen.');
        }
      }

      const { data, error } = await supabaseAdmin.from('products').update(updates).eq('id', productId).select('*').maybeSingle();
      if (error) {
        return jsonSupabaseError(res, '[Admin Products] Product update failed', error, 'Unable to update product.');
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
      if (beforeError) {
        return jsonSupabaseError(res, '[Admin Products] Product lookup before archive failed', beforeError, 'Unable to load product before archive.');
      }
      if (!beforeData) {
        return jsonError(res, 404, 'Product not found.');
      }

      const { data, error } = await supabaseAdmin.from('products').update({ is_active: false }).eq('id', productId).select('*').maybeSingle();
      if (error) {
        return jsonSupabaseError(res, '[Admin Products] Product archive failed', error, 'Unable to delete product.');
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
    if (error && typeof error === 'object' && 'code' in error) {
      return jsonSupabaseError(res, '[Admin Products] Request failed', error, 'Unable to handle product request.');
    }
    return jsonError(res, 500, error?.message ?? 'Unable to handle request.');
  }
}
