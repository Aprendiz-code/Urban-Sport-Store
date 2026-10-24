import { jsonError, jsonResponse } from '../../lib/api-helpers/response.ts';
import { requireActiveProfile } from '../../lib/api-helpers/admin.ts';
import { requireAuthenticatedUser } from '../../lib/api-helpers/auth.ts';
import { supabaseAdmin } from '../../lib/api-helpers/supabase.ts';

function bogotaDate(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Bogota',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') return jsonError(res, 405, 'Método no permitido.');
  try {
    const user = await requireAuthenticatedUser(req);
    await requireActiveProfile(user.id);
    if (!supabaseAdmin) return jsonError(res, 503, 'Los destinos configurados no están disponibles.');

    const today = bogotaDate(new Date());
    const { data, error } = await supabaseAdmin
      .from('shipping_rates')
      .select('destination_code,destination_department,destination_city')
      .eq('carrier', 'coordinadora')
      .eq('is_active', true)
      .lte('valid_from', today)
      .gte('valid_until', today);

    if (error) {
      console.error('[Shipping Destinations] Lookup failed', { code: error.code ?? 'SUPABASE_ERROR' });
      return jsonError(res, 503, 'Los destinos configurados no están disponibles.');
    }

    const destinations = new Map<string, {
      code: string;
      department: string;
      municipality: string;
    }>();

    for (const row of data ?? []) {
      const destination = {
        code: String(row.destination_code),
        department: String(row.destination_department),
        municipality: String(row.destination_city),
      };
      const prior = destinations.get(destination.code);
      if (prior && (prior.department !== destination.department
        || prior.municipality !== destination.municipality)) {
        return jsonError(res, 409, 'Hay destinos tarifarios ambiguos; solicita revisión.');
      }
      destinations.set(destination.code, destination);
    }

    return jsonResponse(res, {
      ok: true,
      data: {
        destinations: [...destinations.values()].sort((left, right) => (
          left.department.localeCompare(right.department, 'es')
          || left.municipality.localeCompare(right.municipality, 'es')
          || left.code.localeCompare(right.code)
        )),
      },
    });
  } catch (error: any) {
    if (typeof error?.status === 'number') return jsonError(res, error.status, error.message);
    console.error('[Shipping Destinations] Unexpected failure', { code: error?.code ?? 'UNKNOWN' });
    return jsonError(res, 500, 'No fue posible cargar los destinos.');
  }
}