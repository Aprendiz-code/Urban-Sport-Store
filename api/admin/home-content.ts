import { jsonError, jsonResponse, ApiError } from '../lib/response.js';
import { supabase } from '../lib/supabase.js';
import { requireAdmin } from '../lib/admin.js';
import { validateSupabaseToken } from '../lib/auth.js';

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
    await requireAdmin(user.id);

    if (req.method !== 'PATCH') {
      return jsonError(res, 405, 'Method not allowed.');
    }

    const body = await parseJsonBody(req);
    const updates: any = {};
    const writableFields = [
      'hero_title',
      'hero_subtitle',
      'hero_image',
      'featured_category_ids',
      'featured_product_ids',
      'discounted_product_ids',
      'promo_banner',
      'newsletter_enabled',
    ];

    for (const field of writableFields) {
      if (Object.prototype.hasOwnProperty.call(body, field)) {
        updates[field] = body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      throw new ApiError(400, 'No update fields provided');
    }

    const { data, error } = await supabase
      .from('home_content')
      .update(updates)
      .eq('key', 'homepage')
      .select('*')
      .maybeSingle();

    if (error) {
      return jsonError(res, 500, error.message || 'Unable to update home content.');
    }
    if (!data) {
      return jsonError(res, 404, 'Home content not found.');
    }

    await supabase.from('audit_logs').insert({
      actor_id: user.id,
      action: 'update_home_content',
      entity: 'home_content',
      entity_id: data.id,
      changes: updates,
    });

    return jsonResponse(res, { data });
  } catch (error: any) {
    if (error instanceof ApiError) {
      return jsonError(res, error.status, error.message);
    }
    return jsonError(res, 500, error?.message ?? 'Unable to handle request.');
  }
}
