import { jsonResponse, jsonError } from './lib/response.js';
import { supabase } from './lib/supabase.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return jsonError(res, 405, 'Method not allowed.');
  }

  try {
    const { data, error } = await supabase
      .from('home_content')
      .select('*')
      .eq('key', 'homepage')
      .single();

    if (error) {
      if (error.details?.includes('Results contain 0 rows')) {
        return jsonResponse(res, { data: {} });
      }
      return jsonError(res, 500, error.message || 'Unable to fetch home content.');
    }

    return jsonResponse(res, { data: data ?? {} });
  } catch (error: any) {
    return jsonError(res, 500, error?.message ?? 'Unable to fetch home content.');
  }
}
