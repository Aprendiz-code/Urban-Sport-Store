import { jsonError, jsonResponse, ApiError } from '../lib/api-helpers/response.ts';
import { supabaseAdmin } from '../lib/api-helpers/supabase.ts';
import { requireActiveProfile } from '../lib/api-helpers/admin.ts';
import { requireAuthenticatedUser } from '../lib/api-helpers/auth.ts';
import { createOrderRequestSchema } from '../src/lib/commerce-validation.ts';

const hasOrderRuntimeConfig = () => {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_ANON_KEY);
};

const parseJsonBody = (req: any) => {
  if (!req?.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }
  return req.body;
};

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return jsonError(res, 405, 'Método no permitido.');
  }

  if (!hasOrderRuntimeConfig() || !supabaseAdmin) {
    return jsonError(
      res,
      503,
      'La creación de pedidos pendientes está bloqueada porque el backend de Supabase no está configurado. Revisa las variables y aplica las migraciones antes de habilitar el checkout.'
    );
  }

  let user: { id: string };
  try {
    user = await requireAuthenticatedUser(req);
    await requireActiveProfile(user.id);
  } catch (error) {
    if (error instanceof ApiError) {
      return jsonError(res, error.status, error.message);
    }
    return jsonError(res, 500, 'Configuración de permisos incompleta.');
  }

  const payload = parseJsonBody(req);
  const validated = createOrderRequestSchema.safeParse(payload);

  if (!validated.success) {
    const issueMessage = validated.error.issues[0]?.message ?? 'Solicitud de pedido inválida.';
    return jsonError(res, 400, issueMessage);
  }

  const { error: tableCheckError } = await supabaseAdmin.from('orders').select('id').limit(1);
  if (tableCheckError) {
    return jsonError(
      res,
      503,
      'La base de datos aún no está preparada para pedidos pendientes. Ejecuta las migraciones de comercio antes de activar la creación de pedidos.'
    );
  }

  return jsonResponse(
    res,
    {
      ok: false,
      error: {
        code: 501,
        message: 'La creación real de pedidos pendientes está preparada pero bloqueada hasta que el backend y la migración estén activos.',
      },
    },
    501
  );
}
