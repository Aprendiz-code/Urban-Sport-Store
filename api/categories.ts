import { jsonResponse, jsonError } from '../lib/api-helpers/response.ts';
import { supabasePublic } from '../lib/api-helpers/supabase.ts';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return jsonError(res, 405, 'Method not allowed.');
  }

  try {
    const { data, error } = await supabasePublic
      .from('categories')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      return jsonError(res, 500, error.message || 'Unable to fetch categories.');
    }

    return jsonResponse(res, { data });
  } catch (error: any) {
    return jsonError(res, 500, error?.message ?? 'Unable to fetch categories.');
  }
}
