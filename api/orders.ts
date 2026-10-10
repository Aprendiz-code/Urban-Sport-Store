import { createClient } from '@supabase/supabase-js';
import { Buffer } from 'node:buffer';
import { ApiError, jsonError, jsonResponse } from '../lib/api-helpers/response.ts';
import { supabaseAdmin } from '../lib/api-helpers/supabase.ts';
import { requireActiveProfile } from '../lib/api-helpers/admin.ts';
import { getBearerToken } from '../lib/api-helpers/auth.ts';
import { createOrderRequestSchema } from '../src/lib/commerce-validation.ts';

const hasOrderRuntimeConfig = () => {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_ANON_KEY);
};

const ORDER_SELECT = [
  'id', 'order_number', 'user_id', 'email', 'customer_name', 'phone', 'status',
  'expires_at',
  'currency', 'subtotal', 'discount_amount', 'shipping_amount', 'total',
  'payment_provider', 'shipping_address', 'notes', 'created_at', 'updated_at',
  'order_items(id,order_id,product_id,product_name,sku,image_path,quantity,unit_price,total_price,created_at)',
].join(',');

const uuidV4Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const orderUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

export function serializeOrder(row: any) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    userId: row.user_id,
    email: row.email,
    customerName: row.customer_name,
    phone: row.phone,
    status: row.status,
    paymentStatus: 'pending',
    shipmentStatus: 'pending',
    currency: row.currency,
    subtotal: Number(row.subtotal),
    discountAmount: Number(row.discount_amount),
    shippingAmount: Number(row.shipping_amount),
    total: Number(row.total),
    paymentProvider: 'local',
    shippingAddress: row.shipping_address,
    notes: row.notes,
    expiresAt: row.expires_at,
    items: (row.order_items ?? []).map((item: any) => ({
      id: item.id,
      orderId: item.order_id,
      productId: item.product_id,
      productName: item.product_name,
      sku: item.sku,
      imagePath: item.image_path,
      quantity: item.quantity,
      unitPrice: Number(item.unit_price),
      totalPrice: Number(item.total_price),
      createdAt: item.created_at,
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function isOrderReadModelValid(row: any) {
  const createdAt = typeof row?.created_at === 'string' ? new Date(row.created_at) : null;
  return Boolean(
    row
    && typeof row.id === 'string'
    && orderUuidPattern.test(row.id)
    && typeof row.expires_at === 'string'
    && createdAt
    && !Number.isNaN(createdAt.getTime())
    && Array.isArray(row.order_items)
    && row.order_items.length > 0
  );
}

export function isOrderSchemaUnavailable(error: { code?: string }) {
  return ['42P01', '42703', '42883', 'PGRST202', 'PGRST204', 'PGRST205'].includes(error.code ?? '');
}

async function authenticateOrderRequest(req: any, res: any): Promise<{ id: string; token: string } | null> {
  try {
    const token = await getBearerToken(req);
    if (!supabaseAdmin) {
      jsonError(res, 503, 'El backend de pedidos no está disponible.');
      return null;
    }
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data?.user) {
      jsonError(res, 401, 'No autenticado.');
      return null;
    }
    const user = { id: data.user.id };
    await requireActiveProfile(user.id);
    return { ...user, token };
  } catch (error) {
    if (error instanceof ApiError) {
      jsonError(res, error.status, error.message);
      return null;
    }
    jsonError(res, 500, 'Configuración de permisos incompleta.');
    return null;
  }
}

function createUserOrderClient(token: string) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function parsePageSize(value: unknown): number | null {
  if (value === undefined) return DEFAULT_PAGE_SIZE;
  if (typeof value !== 'string' || !/^[0-9]+$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= MAX_PAGE_SIZE ? parsed : null;
}

function decodeCursor(value: unknown): { createdAt: string; id: string } | null | false {
  if (value === undefined) return null;
  if (typeof value !== 'string' || value.length > 512) return false;
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
    if (!parsed || typeof parsed !== 'object'
      || Object.keys(parsed).length !== 2
      || typeof parsed.createdAt !== 'string'
      || typeof parsed.id !== 'string'
      || !orderUuidPattern.test(parsed.id)) return false;
    const timestamp = new Date(parsed.createdAt);
    if (Number.isNaN(timestamp.getTime()) || timestamp.toISOString() !== parsed.createdAt) return false;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return false;
  }
}

function encodeCursor(row: { created_at: string; id: string }) {
  return Buffer.from(JSON.stringify({
    createdAt: new Date(row.created_at).toISOString(),
    id: row.id,
  })).toString('base64url');
}

function serializeCreatedOrder(order: Record<string, any>) {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    userId: order.userId,
    email: order.email,
    customerName: order.customerName,
    phone: order.phone,
    status: order.status,
    paymentStatus: order.paymentStatus,
    shipmentStatus: order.shipmentStatus,
    currency: order.currency,
    subtotal: order.subtotal,
    discountAmount: order.discountAmount,
    shippingAmount: order.shippingAmount,
    total: order.total,
    paymentProvider: order.paymentProvider,
    shippingAddress: order.shippingAddress,
    notes: order.notes,
    reservationExpiresAt: order.reservationExpiresAt,
    items: order.items.map((item: Record<string, any>) => ({
      id: item.id,
      orderId: item.orderId,
      productId: item.productId,
      productName: item.productName,
      sku: item.sku,
      imagePath: item.imagePath,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: item.totalPrice,
      createdAt: item.createdAt,
    })),
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

function respondWithOrderError(res: any, context: string, error: any) {
  const code = typeof error?.code === 'string' ? error.code : '';
  console.error(context, { code: code || 'SUPABASE_ERROR' });
  if (isOrderSchemaUnavailable(error)) {
    return jsonError(res, 503, 'El servicio de pedidos no está disponible.');
  }
  if (code === '23514' || code === '23505' || code === '55000') {
    return jsonError(res, 409, 'La operación no se pudo completar con el estado actual del pedido o inventario.');
  }
  if (code === '42501') return jsonError(res, 403, 'No autorizado.');
  if (code.startsWith('22') || ['23502', '23503'].includes(code)) {
    return jsonError(res, 400, 'La solicitud de pedido no es válida.');
  }
  return jsonError(res, 500, 'No se pudo completar la operación de pedidos.');
}

async function parseJsonBody(req: any): Promise<unknown> {
  if (req?.body !== undefined) {
    if (typeof req.body !== 'string') return req.body;
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }

  if (typeof req?.[Symbol.asyncIterator] !== 'function') return {};

  const chunks: Buffer[] = [];
  let bodySize = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bodySize += buffer.byteLength;
    if (bodySize > 16384) {
      throw new ApiError(400, 'La solicitud de pedido excede el tamaño máximo permitido.');
    }
    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return null;
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return jsonError(res, 405, 'Método no permitido.');
  }

  if (!hasOrderRuntimeConfig() || !supabaseAdmin) {
    return jsonError(
      res,
      503,
      'El servicio de pedidos no está disponible.'
    );
  }

  const user = await authenticateOrderRequest(req, res);
  if (!user) return;

  if (req.method === 'GET') {
    const limit = parsePageSize(req.query?.limit);
    if (limit === null) return jsonError(res, 400, 'El límite de página no es válido.');
    const cursor = decodeCursor(req.query?.cursor);
    if (cursor === false) return jsonError(res, 400, 'El cursor de paginación no es válido.');
    const userClient = createUserOrderClient(user.token);
    if (!userClient) return jsonError(res, 503, 'El servicio de pedidos no está disponible.');

    let query = userClient
      .from('orders')
      .select(ORDER_SELECT)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false });
    if (cursor) {
      query = query.or(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    }
    const { data, error } = await query.limit(limit + 1);

    if (error) {
      return respondWithOrderError(res, 'List own orders failed', error);
    }
    if ((data ?? []).some((row: unknown) => !isOrderReadModelValid(row))) {
      console.error('Order read model is missing required order fields or items.');
      return jsonError(res, 500, 'El historial de pedidos está incompleto.');
    }
    const rows = data ?? [];
    const hasMore = rows.length > limit;
    const page = rows.slice(0, limit);
    return jsonResponse(res, {
      ok: true,
      data: {
        orders: page.map(serializeOrder),
        nextCursor: hasMore && page.length ? encodeCursor(page[page.length - 1]) : null,
      },
    });
  }

  const idempotencyKey = req.headers?.['idempotency-key'];
  if (typeof idempotencyKey !== 'string' || !uuidV4Pattern.test(idempotencyKey)) {
    return jsonError(res, 400, 'Envía una Idempotency-Key UUID v4 nueva para este intento.');
  }

  if (typeof req?.body === 'string' && new TextEncoder().encode(req.body).byteLength > 16384) {
    return jsonError(res, 400, 'La solicitud de pedido excede el tamaño máximo permitido.');
  }
  let payload: unknown;
  try {
    payload = await parseJsonBody(req);
  } catch (error) {
    if (error instanceof ApiError) return jsonError(res, error.status, error.message);
    return jsonError(res, 400, 'El cuerpo de la solicitud no es válido.');
  }
  const serializedPayload = JSON.stringify(payload);
  if (!serializedPayload || new TextEncoder().encode(serializedPayload).byteLength > 16384) {
    return jsonError(res, 400, 'La solicitud de pedido excede el tamaño máximo permitido.');
  }

  const validated = createOrderRequestSchema.safeParse(payload);
  if (!validated.success) {
    const issueMessage = validated.error.issues[0]?.message ?? 'Solicitud de pedido inválida.';
    return jsonError(res, 400, issueMessage);
  }

  const { data, error } = await supabaseAdmin.rpc('create_pending_order', {
    p_user_id: user.id,
    p_idempotency_key: idempotencyKey,
    p_request: validated.data,
  });

  if (error) {
    if (error.code === '23505') {
      const duplicateKey = error.constraint === 'orders_idempotency_key_key'
        || [error.message, error.details].some((message: unknown) => (
          typeof message === 'string' && message.includes('orders_idempotency_key_key')
        ));
      return jsonError(
        res,
        409,
        duplicateKey
          ? 'La Idempotency-Key ya fue utilizada. Genera una UUID v4 nueva para un intento nuevo.'
          : 'La solicitud entra en conflicto con un pedido existente.',
      );
    }
    return respondWithOrderError(res, 'Create pending order failed', error);
  }

  const order = data && typeof data === 'object' && 'order' in data ? (data as any).order : null;
  if (!order || typeof order !== 'object' || typeof order.id !== 'string' || !Array.isArray(order.items)) {
    console.error('Pending order RPC returned no persisted order.');
    return jsonError(res, 500, 'No se confirmó la persistencia del pedido.');
  }

  return jsonResponse(res, { ok: true, data: { order: serializeCreatedOrder(order) } }, 201);
}

export {
  ORDER_SELECT,
  uuidV4Pattern,
  authenticateOrderRequest,
  createUserOrderClient,
  respondWithOrderError,
};
