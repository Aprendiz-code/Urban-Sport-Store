import { jsonError, jsonResponse, ApiError } from '../lib/response.js';
import { supabase } from '../lib/supabase.js';
import { requireAdmin } from '../lib/admin.js';
import { validateSupabaseToken } from '../lib/auth.js';

export default async function handler(req: any, res: any) {
  try {
    const user = await validateSupabaseToken(req);
    await requireAdmin(user.id);

    if (req.method !== 'GET') {
      return jsonError(res, 405, 'Method not allowed.');
    }

    const { data, error } = await supabase
      .from('audit_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      return jsonError(res, 500, error.message || 'Unable to fetch audit logs.');
    }

    return jsonResponse(res, { data });
  } catch (error: any) {
    if (error instanceof ApiError) {
      return jsonError(res, error.status, error.message);
    }
    return jsonError(res, 500, error?.message ?? 'Unable to handle request.');
  }
}
