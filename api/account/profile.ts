import { requireActiveProfile } from '../../lib/api-helpers/admin.ts';
import { requireAuthenticatedUser } from '../../lib/api-helpers/auth.ts';
import { ApiError, jsonError, jsonResponse } from '../../lib/api-helpers/response.ts';
import { supabaseAdmin } from '../../lib/api-helpers/supabase.ts';
import { profileUpdateSchema } from '../../src/lib/commerce-validation.ts';

type ProfileRow = Record<string, unknown> & {
  id: string;
  role?: string | null;
  is_active?: boolean | null;
  email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  phone?: string | null;
};

function toProfileResponse(profile: ProfileRow) {
  return {
    id: profile.id,
    email: profile.email ?? null,
    firstName: profile.first_name ?? null,
    lastName: profile.last_name ?? null,
    fullName: profile.full_name ?? null,
    phone: profile.phone ?? null,
  };
}

function parseBody(req: any): unknown {
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }
  return req.body ?? null;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'PATCH') {
    return jsonError(res, 405, 'Método no permitido.');
  }

  try {
    const user = await requireAuthenticatedUser(req);
    await requireActiveProfile(user.id);

    if (!supabaseAdmin) {
      return jsonError(res, 503, 'Configuración de permisos incompleta.');
    }

    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .maybeSingle();
      if (error) return jsonError(res, 503, 'El perfil no está disponible con el esquema actual.');
      if (!data) return jsonError(res, 404, 'No autorizado.');
      return jsonResponse(res, { data: toProfileResponse(data as ProfileRow) });
    }

    const parsed = profileUpdateSchema.safeParse(parseBody(req));
    if (!parsed.success) {
      return jsonError(res, 400, parsed.error.issues[0]?.message ?? 'Datos de perfil inválidos.');
    }

    const { data: currentData, error: readError } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    if (readError || !currentData) {
      return jsonError(res, 503, 'El perfil no está disponible con el esquema actual.');
    }

    const current = currentData as ProfileRow;
    const updates: Record<string, string | null> = {};
    if (parsed.data.firstName !== undefined) {
      if ('first_name' in current) {
        updates.first_name = parsed.data.firstName;
      } else if ('full_name' in current) {
        const currentLastName = parsed.data.lastName ?? current.last_name ?? '';
        updates.full_name = [parsed.data.firstName, currentLastName].filter(Boolean).join(' ');
      } else {
        return jsonError(res, 503, 'El esquema de perfil no permite actualizar el nombre.');
      }
    }
    if (parsed.data.lastName !== undefined) {
      if ('last_name' in current) {
        updates.last_name = parsed.data.lastName;
      } else if ('full_name' in current) {
        const currentFirstName = parsed.data.firstName ?? current.first_name ?? current.full_name?.split(' ')[0] ?? '';
        updates.full_name = [currentFirstName, parsed.data.lastName].filter(Boolean).join(' ');
      } else {
        return jsonError(res, 503, 'El esquema de perfil no permite actualizar el apellido.');
      }
    }
    if (parsed.data.phone !== undefined) {
      if (!('phone' in current)) {
        return jsonError(res, 503, 'El esquema de perfil no permite actualizar el teléfono.');
      }
      updates.phone = parsed.data.phone;
    }

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select('*')
      .maybeSingle();
    if (error || !data) {
      return jsonError(res, 503, 'No fue posible guardar el perfil con el esquema actual.');
    }

    return jsonResponse(res, { data: toProfileResponse(data as ProfileRow) });
  } catch (error) {
    if (error instanceof ApiError) return jsonError(res, error.status, error.message);
    return jsonError(res, 500, 'No fue posible completar la operación del perfil.');
  }
}
