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

function buildProductPayload(body: any) {
  const payload: any = {};

  if (typeof body.slug === 'string') payload.slug = body.slug.trim();
  if (typeof body.name === 'string') payload.name = body.name.trim();
  if (typeof body.brand === 'string') payload.brand = body.brand.trim();
  if (typeof body.short_description === 'string') payload.short_description = body.short_description.trim();
  if (typeof body.description === 'string') payload.description = body.description.trim();
  const price = toNumber(body.price);
  if (price !== undefined) payload.price = price;
  const originalPrice = toNumber(body.original_price);
  if (originalPrice !== undefined) payload.original_price = originalPrice;
  const discountPercentage = toNumber(body.discount_percentage);
  if (discountPercentage !== undefined) payload.discount_percentage = discountPercentage;
  if (typeof body.category_id === 'string') payload.category_id = body.category_id;
  if (typeof body.subcategory === 'string') payload.subcategory = body.subcategory.trim();
  if (typeof body.gender === 'string') payload.gender = body.gender.trim();
  if (Array.isArray(body.sizes)) payload.sizes = body.sizes;
  if (body.colors && typeof body.colors === 'object') payload.colors = body.colors;
  const stock = toNumber(body.stock);
  if (stock !== undefined) payload.stock = stock;
  if (typeof body.sku === 'string') payload.sku = body.sku.trim();
  if (typeof body.main_image === 'string') payload.main_image = body.main_image.trim();
  if (Array.isArray(body.images)) payload.images = body.images;
  if (typeof body.is_featured === 'boolean') payload.is_featured = body.is_featured;
  if (typeof body.is_discounted === 'boolean') payload.is_discounted = body.is_discounted;
  if (typeof body.is_active === 'boolean') payload.is_active = body.is_active;

  return payload;
}

export default async function handler(req: any, res: any) {
  try {
    const user = await validateSupabaseToken(req);
    await requireAdmin(user.id);

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('products').select('*').order('created_at', { ascending: false });
      if (error) {
        return jsonError(res, 500, error.message || 'Unable to fetch products.');
      }
      return jsonResponse(res, { data });
    }

    if (req.method === 'POST') {
      const body = await parseJsonBody(req);
      const payload = buildProductPayload(body);

      if (!payload.slug || !payload.name || payload.price === undefined || !payload.category_id) {
        throw new ApiError(400, 'Missing required fields: slug, name, price, category_id');
      }

      const { data, error } = await supabase.from('products').insert([payload]).select('*').single();
      if (error) {
        return jsonError(res, 500, error.message || 'Unable to create product.');
      }

      await supabase.from('audit_logs').insert({
        actor_id: user.id,
        action: 'create_product',
        entity: 'product',
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
