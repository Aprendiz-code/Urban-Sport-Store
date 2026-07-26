import { jsonResponse, jsonError } from '../lib/api-helpers/response.js';
import { supabaseAdmin, supabasePublic } from '../lib/api-helpers/supabase.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return jsonError(res, 405, 'Method not allowed.');
  }

  try {
    const db = supabaseAdmin ?? supabasePublic;
    const { data, error } = await db
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
