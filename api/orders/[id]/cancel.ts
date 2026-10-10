import { jsonError, jsonResponse } from '../../../lib/api-helpers/response.ts';
import { supabaseAdmin } from '../../../lib/api-helpers/supabase.ts';
import {
  authenticateOrderRequest,
  respondWithOrderError,
} from '../../orders.js';

const orderUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return jsonError(res, 405, 'Método no permitido.');
  }

  const user = await authenticateOrderRequest(req, res);
  if (!user) return;
  if (!supabaseAdmin) {
    return jsonError(res, 503, 'El servicio de pedidos no está disponible.');
  }

  const orderId = req.query?.id;
  if (typeof orderId !== 'string' || !orderUuidPattern.test(orderId)) {
    return jsonError(res, 400, 'El identificador del pedido no es válido.');
  }

  const { data: order, error: readError } = await supabaseAdmin
    .from('orders')
    .select('id,user_id,status')
    .eq('id', orderId)
    .maybeSingle();

  if (readError) {
    return respondWithOrderError(res, 'Read order before cancellation failed', readError);
  }
  if (!order || order.user_id !== user.id) {
    return jsonError(res, 404, 'Pedido no encontrado.');
  }
  if (order.status !== 'pending_payment') {
    return jsonError(res, 409, 'El pedido ya no está pendiente y no puede cancelarse.');
  }

  const { data, error } = await supabaseAdmin.rpc('cancel_pending_order', {
    p_order_id: orderId,
  });
  if (error) {
    return respondWithOrderError(res, 'Cancel pending order failed', error);
  }
  if (!data || typeof data !== 'object' || (data as any).status !== 'cancelled') {
    console.error('Pending order cancellation RPC returned an unexpected result.');
    return jsonError(res, 500, 'No se confirmó la cancelación del pedido.');
  }

  return jsonResponse(res, {
    ok: true,
    data: { order: { id: orderId, status: 'cancelled' } },
  });
}
