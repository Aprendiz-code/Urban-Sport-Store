import { jsonError, jsonResponse, jsonSupabaseError, ApiError } from '../../lib/api-helpers/response.ts';
import { supabaseAdmin } from '../../lib/api-helpers/supabase.ts';
import { requirePermission } from '../../lib/api-helpers/admin.ts';
import { requireAuthenticatedUser } from '../../lib/api-helpers/auth.ts';
import { shippingRateSchema } from '../../src/lib/shipping-validation.ts';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseJsonBody(req: any): Promise<unknown> {
  if (req.body !== undefined) {
    if (typeof req.body !== 'string') return Promise.resolve(req.body);
    try { return Promise.resolve(JSON.parse(req.body)); } catch { return Promise.reject(new ApiError(400, 'El cuerpo JSON no es válido.')); }
  }
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: any) => {
      body += chunk;
      if (new TextEncoder().encode(body).byteLength > 16384) reject(new ApiError(400, 'La solicitud excede el tamaño máximo permitido.'));
    });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); } catch { reject(new ApiError(400, 'El cuerpo JSON no es válido.')); }
    });
    req.on('error', reject);
  });
}

export default async function handler(req: any, res: any) {
  try {
    const user = await requireAuthenticatedUser(req);
    await requirePermission(user, 'settings.manage');

    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('shipping_rates')
        .select('*')
        .eq('carrier', 'coordinadora')
        .order('origin_city', { ascending: true })
        .order('destination_city', { ascending: true })
        .order('min_billable_weight_grams', { ascending: true });
      if (error) return jsonSupabaseError(res, '[Admin Shipping] Rate list failed', error, 'No se pudieron cargar las tarifas.');
      return jsonResponse(res, { ok: true, data: { rates: data ?? [] } });
    }

    if (req.method !== 'POST' && req.method !== 'PATCH') return jsonError(res, 405, 'Método no permitido.');
    const body = await parseJsonBody(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonError(res, 400, 'La solicitud de tarifa debe ser un objeto.');
    }

    const payload = { ...(body as Record<string, unknown>) };
    const rateId = req.method === 'PATCH' ? payload.rateId : null;
    delete payload.rateId;
    if (req.method === 'PATCH' && (typeof rateId !== 'string' || !UUID_PATTERN.test(rateId))) {
      return jsonError(res, 400, 'El identificador de tarifa no es válido.');
    }
    const validated = shippingRateSchema.safeParse(payload);
    if (!validated.success) return jsonError(res, 400, validated.error.issues[0]?.message ?? 'La tarifa no es válida.');

    const { data, error } = await supabaseAdmin.rpc('admin_upsert_coordinadora_shipping_rate', {
      p_actor_id: user.id,
      p_rate_id: rateId,
      p_rate: validated.data,
    });
    if (error) return jsonSupabaseError(res, '[Admin Shipping] Rate save failed', error, 'No se pudo guardar la tarifa.');
    const rate = (data as any)?.rate ?? data;
    if (!rate) return jsonError(res, 404, 'La tarifa no existe.');
    return jsonResponse(res, { ok: true, data: { rate } }, req.method === 'POST' ? 201 : 200);
  } catch (error: any) {
    if (error instanceof ApiError) return jsonError(res, error.status, error.message);
    return jsonError(res, 500, 'No se pudo completar la operación de tarifas.');
  }
}