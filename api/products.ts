import { jsonResponse, jsonError } from './lib/response.js';
import { supabase } from './lib/supabase.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return jsonError(res, 405, 'Method not allowed.');
  }

  try {
    const url = new URL(req.url ?? '', 'http://localhost');
    const id = url.searchParams.get('id');
    const slug = url.searchParams.get('slug');

    let query = supabase.from('products').select('*').eq('is_active', true).order('created_at', { ascending: false });

    if (id) {
      query = query.eq('id', id);
    } else if (slug) {
      query = query.eq('slug', slug);
    }

    const { data, error } = await query;
    if (error) {
      return jsonError(res, 500, error.message || 'Unable to fetch products.');
    }

    if ((id || slug) && Array.isArray(data) && data.length === 0) {
      return jsonError(res, 404, 'Product not found.');
    }

    const payload = id || slug ? (Array.isArray(data) ? data[0] ?? null : data) : data;
    return jsonResponse(res, { data: payload });
  } catch (error: any) {
    return jsonError(res, 500, error?.message ?? 'Unable to fetch products.');
  }
}
