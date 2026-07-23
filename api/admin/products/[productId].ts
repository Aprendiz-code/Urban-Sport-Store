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

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function buildProductUpdates(body: any) {
  const updates: any = {};

  if (typeof body.slug === 'string') updates.slug = body.slug.trim();
  if (typeof body.name === 'string') updates.name = body.name.trim();
  if (typeof body.brand === 'string') updates.brand = body.brand.trim();
  if (typeof body.short_description === 'string') updates.short_description = body.short_description.trim();
  if (typeof body.description === 'string') updates.description = body.description.trim();
  const price = toNumber(body.price);
  if (price !== undefined) updates.price = price;
  const originalPrice = toNumber(body.original_price);
  if (originalPrice !== undefined) updates.original_price = originalPrice;
  const discountPercentage = toNumber(body.discount_percentage);
  if (discountPercentage !== undefined) updates.discount_percentage = discountPercentage;
  if (typeof body.category_id === 'string') updates.category_id = body.category_id;
  if (typeof body.subcategory === 'string') updates.subcategory = body.subcategory.trim();
  if (typeof body.gender === 'string') updates.gender = body.gender.trim();
  if (Array.isArray(body.sizes)) updates.sizes = body.sizes;
  if (body.colors && typeof body.colors === 'object') updates.colors = body.colors;
  const stock = toNumber(body.stock);
  if (stock !== undefined) updates.stock = stock;
  if (typeof body.sku === 'string') updates.sku = body.sku.trim();
  if (typeof body.main_image === 'string') updates.main_image = body.main_image.trim();
  if (Array.isArray(body.images)) updates.images = body.images;
  if (typeof body.is_featured === 'boolean') updates.is_featured = body.is_featured;
  if (typeof body.is_discounted === 'boolean') updates.is_discounted = body.is_discounted;
  if (typeof body.is_active === 'boolean') updates.is_active = body.is_active;

  return updates;
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
      const updates = buildProductUpdates(body);
      if (Object.keys(updates).length === 0) {
        throw new ApiError(400, 'No update fields provided');
      }

      const { data, error } = await supabase.from('products').update(updates).eq('id', productId).select('*').maybeSingle();
      if (error) {
        return jsonError(res, 500, error.message || 'Unable to update product.');
      }
      if (!data) {
        return jsonError(res, 404, 'Product not found.');
      }

      await supabase.from('audit_logs').insert({
        actor_id: user.id,
        action: 'update_product',
        entity: 'product',
        entity_id: productId,
        changes: updates,
      });

      return jsonResponse(res, { data });
    }

    if (req.method === 'DELETE') {
      const { data, error } = await supabase.from('products').update({ is_active: false }).eq('id', productId).select('*').maybeSingle();
      if (error) {
        return jsonError(res, 500, error.message || 'Unable to delete product.');
      }
      if (!data) {
        return jsonError(res, 404, 'Product not found.');
      }

      await supabase.from('audit_logs').insert({
        actor_id: user.id,
        action: 'soft_delete_product',
        entity: 'product',
        entity_id: productId,
        changes: { is_active: false },
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
