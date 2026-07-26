import { jsonError, jsonResponse, ApiError } from '../../lib/api-helpers/response.js';
import { supabaseAdmin } from '../../lib/api-helpers/supabase.js';
import { requireAdmin } from '../../lib/api-helpers/admin.js';
import { validateSupabaseToken } from '../../lib/api-helpers/auth.js';

export default async function handler(req: any, res: any) {
  try {
    const user = await validateSupabaseToken(req);
    await requireAdmin(user);

    if (req.method !== 'GET') {
      return jsonError(res, 405, 'Method not allowed.');
    }

    const { data, error } = await supabaseAdmin
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
