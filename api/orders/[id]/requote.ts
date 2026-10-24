import { z } from 'zod';
import { jsonError, jsonResponse } from '../../../lib/api-helpers/response.ts';
import { supabaseAdmin } from '../../../lib/api-helpers/supabase.ts';
import {
  authenticateOrderRequest,
  respondWithOrderError,
} from '../../orders.js';
import { shippingQuoteRequestSchema } from '../../../src/lib/commerce-validation.ts';

const orderUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const requestSchema = shippingQuoteRequestSchema.extend({
  shippingQuoteId: z.string().uuid(),
  confirmedTotal: z.number().finite().nonnegative(),
  expectedUpdatedAt: z.string().datetime(),
}).strict();

const conflictMessages: Record<string, string> = {
  attempt_not_terminal: 'Existe un intento activo o desconocido.',
  order_unavailable: 'El pedido ya no está disponible para re-cotizar.',
  payment_unavailable: 'El pago ya no está disponible para re-cotizar.',
  quote_unavailable: 'La cotización venció o no coincide con el pedido.',
  rate_changed: 'La tarifa cambió; solicita una cotización nueva.',
  rate_snapshot_changed: 'La tarifa cambió; solicita una cotización nueva.',
  cart_changed: 'El carrito del pedido cambió; vuelve a cotizar.',
  product_changed: 'Un producto cambió; vuelve a cotizar.',
  shipping_data_missing: 'Faltan datos logísticos del producto.',
  weight_band_changed: 'El peso ya no coincide con la tarifa.',
  inventory_unavailable: 'No hay inventario disponible para re-reservar.',
  reservation_consumed: 'La reserva ya fue consumida.',
  quote_stale: 'La cotización ya no coincide con los precios o condiciones actuales.',
};

async function parseBody(req: any): Promise<unknown> {
  if (req.body !== undefined) {
    if (typeof req.body !== 'string') return req.body;
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }

  if (typeof req?.[Symbol.asyncIterator] !== 'function') return null;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.byteLength;
    if (size > 16384) throw new Error('BODY_TOO_LARGE');
    chunks.push(part);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return null;
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return jsonError(res, 405, 'Método no permitido.');
  const user = await authenticateOrderRequest(req, res);
  if (!user) return;
  const orderId = req.query?.id;
  if (typeof orderId !== 'string' || !orderUuidPattern.test(orderId)) {
    return jsonError(res, 400, 'El identificador del pedido no es válido.');
  }
  if (!supabaseAdmin) return jsonError(res, 503, 'El servicio de pedidos no está disponible.');

  let body: unknown;
  try {
    body = await parseBody(req);
  } catch (error: any) {
    return jsonError(res, error?.message === 'BODY_TOO_LARGE' ? 413 : 400, 'La solicitud no es válida.');
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return jsonError(res, 400, parsed.error.issues[0]?.message ?? 'La solicitud no es válida.');

  const { data, error } = await supabaseAdmin.rpc('confirm_pending_order_requote', {
    p_order_id: orderId,
    p_user_id: user.id,
    p_shipping_quote_id: parsed.data.shippingQuoteId,
    p_destination_code: parsed.data.destinationCode,
    p_address: parsed.data.address,
    p_items: [...parsed.data.items].sort((left, right) => left.productId.localeCompare(right.productId)),
    p_confirmed_total: parsed.data.confirmedTotal,
    p_expected_updated_at: parsed.data.expectedUpdatedAt,
  });
  if (error) return respondWithOrderError(res, 'Confirm pending order reprice failed', error);
  if (!data || typeof data !== 'object' || typeof (data as any).status !== 'string') {
    return jsonError(res, 503, 'No se confirmó el nuevo total.');
  }

  const result = data as Record<string, unknown>;
  if (result.status === 'confirmation_required') {
    return jsonResponse(res, {
      ok: false,
      error: { code: 'confirmation_required', message: 'El total cambió. Revisa y confirma el nuevo importe.' },
      data: {
        previousTotal: result.previous_total,
        subtotal: result.subtotal,
        shipping: result.shipping,
        total: result.total,
      },
    }, 409);
  }
  if (result.status === 'conflict') {
    const reason = typeof result.reason === 'string' ? result.reason : 'order_unavailable';
    return jsonResponse(res, {
      ok: false,
      error: { code: reason, message: conflictMessages[reason] ?? 'No se puede retomar el pedido.' },
    }, 409);
  }
  if (result.status !== 'updated' && result.status !== 'already_applied') {
    return jsonError(res, 409, 'No se puede retomar el pedido.');
  }

  return jsonResponse(res, {
    ok: true,
    data: {
      status: result.status,
      orderId,
      total: result.total,
      shippingQuoteId: result.shipping_quote_id ?? parsed.data.shippingQuoteId,
      expiresAt: result.expires_at,
      reservationExpiresAt: result.reservation_expires_at,
    },
  });
}