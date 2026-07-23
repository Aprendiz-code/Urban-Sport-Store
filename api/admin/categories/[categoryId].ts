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
  if (typeof body.is_active === 'boolean') updates.is_active = body.is_active;

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
    await requireAdmin(user.id);

    const categoryId = extractCategoryId(req);
    if (!categoryId) {
      throw new ApiError(400, 'Missing categoryId');
    }

    if (req.method === 'PATCH') {
      const body = await parseJsonBody(req);
      const updates = buildCategoryUpdates(body);
      if (Object.keys(updates).length === 0) {
        throw new ApiError(400, 'No update fields provided');
      }

      const { data, error } = await supabase.from('categories').update(updates).eq('id', categoryId).select('*').maybeSingle();
      if (error) {
        return jsonError(res, 500, error.message || 'Unable to update category.');
      }
      if (!data) {
        return jsonError(res, 404, 'Category not found.');
      }

      await supabase.from('audit_logs').insert({
        actor_id: user.id,
        action: 'update_category',
        entity: 'category',
        entity_id: categoryId,
        changes: updates,
      });

      return jsonResponse(res, { data });
    }

    return jsonError(res, 405, 'Method not allowed.');
  } catch (error: any) {
    if (error instanceof ApiError) {
      return jsonError(res, error.status, error.message);
    }
    return jsonError(res, 500, error?.message ?? 'Unable to handle request.');
  }
}
