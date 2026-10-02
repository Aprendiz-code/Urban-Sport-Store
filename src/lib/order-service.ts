import type { Order, CheckoutRequest } from '../types/domain';
import { createOrderRequestSchema } from './commerce-validation';
import { getAccessToken } from './supabase-auth';
import { resolveApiBaseUrl } from './api-config';

const API_ROOT = resolveApiBaseUrl(import.meta.env.VITE_API_URL);

export class OrderServiceError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'OrderServiceError';
  }
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
    error?: { message?: string };
  } | null;

  if (!response.ok) {
    throw new OrderServiceError(
      response.status,
      payload?.error?.message ?? 'La operación de pedidos no está disponible.',
    );
  }
  return payload?.data as T;
}

export async function createPendingOrder(input: CheckoutRequest): Promise<Order> {
  const validated = createOrderRequestSchema.safeParse(input);
  if (!validated.success) {
    throw new OrderServiceError(400, validated.error.issues[0]?.message ?? 'Solicitud de pedido inválida.');
  }

  const result = await request<unknown>('/orders', {
    method: 'POST',
    body: JSON.stringify(validated.data),
  });
  const order = result && typeof result === 'object' && 'order' in result
    ? (result as { order: unknown }).order
    : result;

  if (!isPersistedOrder(order)) {
    throw new OrderServiceError(503, 'No se confirmó la persistencia del pedido.');
  }
  return order;
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
