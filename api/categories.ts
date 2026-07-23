import { jsonResponse, jsonError } from './lib/response.js';
import { supabase } from './lib/supabase.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return jsonError(res, 405, 'Method not allowed.');
  }

  try {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      return jsonError(res, 500, error.message || 'Unable to fetch categories.');
    }

    return jsonResponse(res, { data });
  } catch (error: any) {
    return jsonError(res, 500, error?.message ?? 'Unable to fetch categories.');
  }
}
