import { jsonError, jsonResponse } from '../../lib/api-helpers/response.ts';
import {
  authenticateOrderRequest,
  createUserOrderClient,
  isOrderReadModelValid,
  ORDER_SELECT,
  respondWithOrderError,
  serializeOrder,
} from '../orders.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return jsonError(res, 405, 'Método no permitido.');
  }
  const user = await authenticateOrderRequest(req, res);
  if (!user) return;

  const orderId = req.query?.id;
  if (typeof orderId !== 'string' || !uuidPattern.test(orderId)) {
    return jsonError(res, 400, 'El identificador del pedido no es válido.');
  }

  const userClient = createUserOrderClient(user.token);
  if (!userClient) return jsonError(res, 503, 'El servicio de pedidos no está disponible.');

  const { data, error } = await userClient
    .from('orders')
    .select(ORDER_SELECT)
    .eq('id', orderId)
    .maybeSingle();

  if (error) {
    return respondWithOrderError(res, 'Read own order failed', error);
  }
  if (!data) {
    return jsonError(res, 404, 'Pedido no encontrado.');
  }
  if (!isOrderReadModelValid(data)) {
    console.error('Order read model is missing the required internal pending payment or reservation expiry.');
    return jsonError(res, 500, 'El pedido está incompleto. Contacta al soporte antes de continuar.');
  }

  return jsonResponse(res, { ok: true, data: { order: serializeOrder(data) } });
}
