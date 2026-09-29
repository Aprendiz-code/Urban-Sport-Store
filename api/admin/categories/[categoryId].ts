import { jsonError, jsonResponse, ApiError } from '../../../lib/api-helpers/response.js';
import { supabaseAdmin } from '../../../lib/api-helpers/supabase.js';
import { requireAdmin } from '../../../lib/api-helpers/admin.js';
import { validateSupabaseToken } from '../../../lib/api-helpers/auth.js';

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

function normalizeCategory(record: any) {
  if (!record) return null;
  return {
    id: record.id,
    name: record.name,
    slug: record.slug,
    description: record.description ?? null,
    image: record.image ?? null,
    sortOrder: record.sort_order ?? null,
    isActive: record.is_active ?? null,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

function buildCategoryUpdates(body: any) {
  const updates: any = {};

  if (typeof body.name === 'string') updates.name = body.name.trim();
  if (typeof body.slug === 'string') updates.slug = body.slug.trim();
  if (typeof body.description === 'string') updates.description = body.description.trim();
  if (typeof body.image === 'string') updates.image = body.image.trim();

  if (typeof body.sort_order === 'number') updates.sort_order = body.sort_order;
  if (typeof body.sort_order === 'string' && body.sort_order.trim() !== '') {
    const parsed = Number(body.sort_order);
    if (!Number.isNaN(parsed)) updates.sort_order = parsed;
  }
  if (typeof body.sortOrder === 'number') updates.sort_order = body.sortOrder;
  if (typeof body.sortOrder === 'string' && body.sortOrder.trim() !== '') {
    const parsed = Number(body.sortOrder);
    if (!Number.isNaN(parsed)) updates.sort_order = parsed;
  }

  if (typeof body.is_active === 'boolean') updates.is_active = body.is_active;
  if (typeof body.isActive === 'boolean') updates.is_active = body.isActive;

  return updates;
}

function extractCategoryId(req: any): string | null {
  const url = new URL(req.url ?? '', 'http://localhost');
  const segments = url.pathname.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? null;
}

export default async function handler(req: any, res: any) {
  try {
    const user = await validateSupabaseToken(req);
    await requireAdmin(user);

    const categoryId = extractCategoryId(req);
    if (!categoryId) {
      throw new ApiError(400, 'Missing categoryId');
    }

    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('categories')
        .select('*')
        .eq('id', categoryId)
        .maybeSingle();

      if (error) {
        return jsonError(res, 500, error.message || 'Unable to fetch category.');
      }
      if (!data) {
        return jsonError(res, 404, 'Category not found.');
      }

      return jsonResponse(res, { data: normalizeCategory(data) });
    }

    if (req.method === 'PATCH') {
      const body = await parseJsonBody(req);
      const updates = buildCategoryUpdates(body);
      if (Object.keys(updates).length === 0) {
        throw new ApiError(400, 'No update fields provided');
      }

      // Get before state
      const { data: beforeData, error: beforeError } = await supabaseAdmin
        .from('categories')
        .select('*')
        .eq('id', categoryId)
        .maybeSingle();
      if (beforeError || !beforeData) {
        return jsonError(res, 404, 'Category not found.');
      }

      const { data, error } = await supabaseAdmin.from('categories').update(updates).eq('id', categoryId).select('*').maybeSingle();
      if (error) {
        return jsonError(res, 500, error.message || 'Unable to update category.');
      }
      if (!data) {
        return jsonError(res, 404, 'Category not found.');
      }

      await supabaseAdmin.from('audit_logs').insert({
        actor_id: user.id,
        action: 'update_category',
        entity: 'category',
        entity_id: categoryId,
        entity_id_uuid: categoryId,
        before_data: beforeData,
        after_data: data,
      });

      return jsonResponse(res, { data: normalizeCategory(data) });
    }

    if (req.method === 'DELETE') {
      // Get before state
      const { data: beforeData, error: beforeError } = await supabaseAdmin
        .from('categories')
        .select('*')
        .eq('id', categoryId)
        .maybeSingle();
      if (beforeError || !beforeData) {
        return jsonError(res, 404, 'Category not found.');
      }

      const { data, error } = await supabaseAdmin
        .from('categories')
        .update({ is_active: false })
        .eq('id', categoryId)
        .select('*')
        .maybeSingle();
      if (error) {
        return jsonError(res, 500, error.message || 'Unable to delete category.');
      }
      if (!data) {
        return jsonError(res, 404, 'Category not found.');
      }

      await supabaseAdmin.from('audit_logs').insert({
        actor_id: user.id,
        action: 'soft_delete_category',
        entity: 'category',
        entity_id: categoryId,
        entity_id_uuid: categoryId,
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
