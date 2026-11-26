import type { Order, CheckoutRequest, OrderAddressSnapshot, OrderRequestItem, ShippingDestination } from '../types/domain';
import {
  createOrderRequestSchema,
  normalizeShippingQuoteRequest,
  shippingQuoteRequestSchema,
} from './commerce-validation';
import { getAccessToken } from './supabase-auth';
import { resolveApiBaseUrl } from './api-config';

const API_ROOT = resolveApiBaseUrl(import.meta.env.VITE_API_URL);

export class OrderServiceError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
    public readonly data?: unknown,
  ) {
    super(message);
    this.name = 'OrderServiceError';
  }
}

export interface ShippingQuoteRequest {
  destinationCode: string;
  address: OrderAddressSnapshot;
  items: OrderRequestItem[];
}

export interface ShippingQuote {
  id: string;
  provider: 'coordinadora';
  currency: 'COP';
  amountCop: number;
  subtotalCop: number;
  coverage: { covered: true; originCode: string; destinationCode: string };
  calculatedBy: 'urban_sport_store';
  destination: ShippingDestination;
  estimatedDelivery: { minBusinessDays: number; maxBusinessDays: number };
  expiresAt: string;
}

export async function listShippingDestinations(): Promise<ShippingDestination[]> {
  const result = await request<unknown>('/shipping/destinations');
  const destinations = result && typeof result === 'object' && 'destinations' in result
    ? (result as { destinations: unknown }).destinations
    : null;
  if (!Array.isArray(destinations) || !destinations.every((value) => {
    if (!value || typeof value !== 'object') return false;
    const item = value as Partial<ShippingDestination>;
    return typeof item.code === 'string' && /^\d{8}$/.test(item.code)
      && typeof item.department === 'string' && item.department.length > 0
      && typeof item.municipality === 'string' && item.municipality.length > 0;
  })) {
    throw new OrderServiceError(503, 'Los destinos configurados no están disponibles.');
  }
  return destinations as ShippingDestination[];
}

export async function createShippingQuote(input: ShippingQuoteRequest): Promise<ShippingQuote> {
  const validated = shippingQuoteRequestSchema.safeParse(input);
  if (!validated.success) throw new OrderServiceError(400, validated.error.issues[0]?.message ?? 'Solicitud de cotización inválida.');
  const normalizedRequest = normalizeShippingQuoteRequest(validated.data);
  const result = await request<unknown>('/shipping/quotes', {
    method: 'POST',
    body: JSON.stringify(normalizedRequest),
  });
  const quote = result && typeof result === 'object' && 'quote' in result
    ? (result as { quote: unknown }).quote
    : null;
  if (!quote || typeof quote !== 'object') throw new OrderServiceError(503, 'No se recibió una cotización de envío válida.');
  const value = quote as Partial<ShippingQuote>;
  const expiresAt = typeof value.expiresAt === 'string' ? Date.parse(value.expiresAt) : Number.NaN;
  if (typeof value.id !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.id)
    || value.provider !== 'coordinadora'
    || value.calculatedBy !== 'urban_sport_store'
    || value.currency !== 'COP'
    || !Number.isFinite(value.amountCop)
    || (value.amountCop ?? 0) <= 0
    || !Number.isFinite(value.subtotalCop)
    || (value.subtotalCop ?? -1) < 0
    || value.coverage?.covered !== true
    || value.destination?.code !== normalizedRequest.destinationCode
    || typeof value.destination.department !== 'string'
    || typeof value.destination.municipality !== 'string'
    || !Number.isInteger(value.estimatedDelivery?.minBusinessDays)
    || !Number.isInteger(value.estimatedDelivery?.maxBusinessDays)
    || !Number.isFinite(expiresAt)
    || expiresAt <= Date.now()) {
    throw new OrderServiceError(503, 'No se recibió una cotización vigente.');
  }
  return value as ShippingQuote;
}

function isPersistedOrder(value: unknown): value is Order {
  if (!value || typeof value !== 'object') return false;
  const order = value as Partial<Order>;
  return typeof order.id === 'string'
    && typeof order.orderNumber === 'string'
    && typeof order.status === 'string'
    && typeof order.paymentStatus === 'string'
    && typeof order.total === 'number'
    && Array.isArray(order.items);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getAccessToken();
  if (!token) throw new OrderServiceError(401, 'Inicia sesión para consultar pedidos.');

  const response = await fetch(`${API_ROOT}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => null) as {
    data?: unknown;
    error?: { code?: string | number; message?: string };
  } | null;

  if (!response.ok) {
    throw new OrderServiceError(
      response.status,
      payload?.error?.message ?? 'La operación de pedidos no está disponible.',
      typeof payload?.error?.code === 'string' ? payload.error.code : undefined,
      payload?.data,
    );
  }
  return payload?.data as T;
}

export type PendingOrderRequoteResult =
  | { status: 'updated' | 'already_applied'; order: Order }
  | {
      status: 'confirmation_required';
      previousTotal: number;
      subtotal: number;
      shipping: number;
      total: number;
    }
  | { status: 'conflict'; message: string };

export async function confirmPendingOrderRequote(input: {
  orderId: string;
  quote: ShippingQuote;
  request: ShippingQuoteRequest;
  confirmedTotal: number;
  expectedUpdatedAt: string;
}): Promise<PendingOrderRequoteResult> {
  const validatedRequest = shippingQuoteRequestSchema.safeParse(input.request);
  if (!validatedRequest.success) {
    return {
      status: 'conflict',
      message: validatedRequest.error.issues[0]?.message ?? 'Solicitud de cotización inválida.',
    };
  }
  const normalizedRequest = normalizeShippingQuoteRequest(validatedRequest.data);
  try {
    const result = await request<Record<string, unknown>>(
      `/orders/${encodeURIComponent(input.orderId)}/requote`,
      {
        method: 'POST',
        body: JSON.stringify({
          shippingQuoteId: input.quote.id,
          ...normalizedRequest,
          confirmedTotal: input.confirmedTotal,
          expectedUpdatedAt: input.expectedUpdatedAt,
        }),
      },
    );
    if (result.status !== 'updated' && result.status !== 'already_applied') {
      return { status: 'conflict', message: 'No se confirmó la re-cotización.' };
    }
    const order = await getMyOrder(input.orderId);
    if (order.id !== input.orderId) {
      return { status: 'conflict', message: 'La re-cotización no conservó el pedido original.' };
    }
    return { status: result.status, order };
  } catch (error) {
    if (!(error instanceof OrderServiceError)) throw error;
    if (error.code === 'confirmation_required' && error.data && typeof error.data === 'object') {
      const proposal = error.data as Record<string, unknown>;
      if (typeof proposal.previousTotal === 'number'
        && typeof proposal.subtotal === 'number'
        && typeof proposal.shipping === 'number'
        && typeof proposal.total === 'number') {
        return {
          status: 'confirmation_required',
          previousTotal: proposal.previousTotal,
          subtotal: proposal.subtotal,
          shipping: proposal.shipping,
          total: proposal.total,
        };
      }
    }
    return { status: 'conflict', message: error.message };
  }
}

export async function createPendingOrder(input: CheckoutRequest): Promise<Order> {
  const validated = createOrderRequestSchema.safeParse(input);
  if (!validated.success) {
    throw new OrderServiceError(400, validated.error.issues[0]?.message ?? 'Solicitud de pedido inválida.');
  }

  if (typeof globalThis.crypto?.randomUUID !== 'function') {
    throw new OrderServiceError(0, 'Este navegador no puede generar una clave segura para el pedido.');
  }

  const result = await request<unknown>('/orders', {
    method: 'POST',
    body: JSON.stringify(validated.data),
    headers: { 'Idempotency-Key': globalThis.crypto.randomUUID() },
  });
  const order = result && typeof result === 'object' && 'order' in result
    ? (result as { order: unknown }).order
    : result;

  if (!isPersistedOrder(order)) {
    throw new OrderServiceError(503, 'No se confirmó la persistencia del pedido.');
  }
  return order;
}

export async function createWompiPaymentSession(orderId: string): Promise<{ checkoutUrl: string; expiresAt: string }> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
    throw new OrderServiceError(400, 'El identificador del pedido no es válido.');
  }

  const result = await request<unknown>(`/orders/${encodeURIComponent(orderId)}/payment-session`, {
    method: 'POST',
  });
  const session = result && typeof result === 'object'
    ? result as { checkoutUrl?: unknown; expiresAt?: unknown }
    : null;
  let checkoutUrl: URL | null = null;
  if (typeof session?.checkoutUrl === 'string') {
    try {
      checkoutUrl = new URL(session.checkoutUrl);
    } catch {
      checkoutUrl = null;
    }
  }
  const expiresAt = typeof session?.expiresAt === 'string' ? Date.parse(session.expiresAt) : NaN;
  if (
    !checkoutUrl
    || checkoutUrl.protocol !== 'https:'
    || checkoutUrl.hostname !== 'checkout.wompi.co'
    || !checkoutUrl.pathname.startsWith('/l/')
    || checkoutUrl.username
    || checkoutUrl.password
    || !Number.isFinite(expiresAt)
    || expiresAt <= Date.now()
  ) {
    throw new OrderServiceError(503, 'No se recibió un enlace de pago válido de Wompi.');
  }
  return { checkoutUrl: checkoutUrl.toString(), expiresAt: new Date(expiresAt).toISOString() };
}

export type WompiPaymentReturnResult = {
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';
  orderStatus: string;
  reconciliation: 'applied' | 'duplicate' | 'stale' | 'review_required';
};

export async function verifyWompiPaymentReturn(
  orderId: string,
  transactionId: string,
): Promise<WompiPaymentReturnResult> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)
    || !/^[A-Za-z0-9_-]{1,128}$/.test(transactionId)) {
    throw new OrderServiceError(400, 'Los datos de retorno del pago no son válidos.');
  }

  const result = await request<unknown>(`/orders/${encodeURIComponent(orderId)}/payment-status`, {
    method: 'POST',
    body: JSON.stringify({ transactionId }),
  });
  if (!result || typeof result !== 'object') {
    throw new OrderServiceError(503, 'No se recibió un estado de pago válido.');
  }

  const value = result as Record<string, unknown>;
  const paymentStatuses = ['pending', 'paid', 'failed', 'refunded', 'cancelled'];
  const orderStatuses = [
    'pending_payment', 'pending', 'confirmed', 'processing', 'shipped',
    'delivered', 'cancelled', 'refunded', 'paid', 'payment_review',
  ];
  const reconciliationStatuses = ['applied', 'duplicate', 'stale', 'review_required'];
  if (!paymentStatuses.includes(String(value.status))
    || !orderStatuses.includes(String(value.orderStatus))
    || !reconciliationStatuses.includes(String(value.reconciliation))) {
    throw new OrderServiceError(503, 'No se recibió un estado de pago válido.');
  }
  return {
    paymentStatus: value.status as WompiPaymentReturnResult['paymentStatus'],
    orderStatus: String(value.orderStatus),
    reconciliation: value.reconciliation as WompiPaymentReturnResult['reconciliation'],
  };
}

export async function listMyOrders(): Promise<Order[]> {
  const result = await request<unknown>('/orders', { method: 'GET' });
  const orders = result && typeof result === 'object' && 'orders' in result
    ? (result as { orders: unknown }).orders
    : result;

  if (!Array.isArray(orders) || !orders.every(isPersistedOrder)) {
    throw new OrderServiceError(503, 'El historial de pedidos no está disponible.');
  }
  return orders;
}

export async function getMyOrder(orderId: string): Promise<Order> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
    throw new OrderServiceError(400, 'El identificador del pedido no es válido.');
  }

  const result = await request<unknown>(`/orders/${encodeURIComponent(orderId)}`);
  const order = result && typeof result === 'object' && 'order' in result
    ? (result as { order: unknown }).order
    : result;

  if (!isPersistedOrder(order)) {
    throw new OrderServiceError(503, 'El detalle del pedido no está disponible.');
  }
  return order;
}

export async function cancelPendingOrder(orderId: string): Promise<{ id: string; status: 'cancelled' }> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(orderId)) {
    throw new OrderServiceError(400, 'El identificador del pedido no es válido.');
  }

  const result = await request<unknown>(`/orders/${encodeURIComponent(orderId)}/cancel`, {
    method: 'POST',
  });
  const order = result && typeof result === 'object' && 'order' in result
    ? (result as { order: { id?: unknown; status?: unknown } }).order
    : null;

  if (order?.id !== orderId || order.status !== 'cancelled') {
    throw new OrderServiceError(503, 'No se confirmó la cancelación del pedido.');
  }

  return { id: orderId, status: 'cancelled' };
}
