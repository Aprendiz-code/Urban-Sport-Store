import { clearLocalAuthSession, getAccessToken } from './supabase-auth';
import { resolveApiBaseUrl } from './api-config';
import { mapHomeContentPayload } from './admin-home-content';
import { getSupabaseClient } from './supabase-client';

type Product = Record<string, unknown> & { id?: string };

export type StockMovementType = 'in' | 'out' | 'correction';

export interface AdjustStockInput {
  productId: string;
  movementType: StockMovementType;
  quantity: number;
  reason: string;
}

export interface AdjustStockResult {
  product_id: string;
  previous_stock: number;
  new_stock: number;
}

export type DashboardMetricStatus = 'forbidden' | 'error' | 'empty' | 'ready' | 'pending';

export interface AdminDashboardData {
  orders: {
    status: DashboardMetricStatus;
    total: number | null;
    recent: Array<{
      id: string;
      order_number: string;
      status: string;
      payment_status: string;
      total: number;
      created_at: string;
      item_count: number;
      customer_name?: string;
    }>;
  };
  customers: { status: DashboardMetricStatus; total: number | null };
  sales: {
    status: 'forbidden' | 'error' | 'empty' | 'ready';
    paid_orders: number | null;
    total_7d: number | null;
    period_start: string | null;
    period_end: string | null;
  };
  category_sales_status: 'forbidden' | 'error' | 'empty' | 'pending';
}

export function parseAdminApiError(status: number, text: string): Error {
  const fallbackMessage = `${status} ${status === 400 ? 'Bad Request' : status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden' : status === 409 ? 'Conflict' : 'Request failed'}`;

  try {
    const json = JSON.parse(text);
    const errorMessage = status === 401
      ? 'Sesión administrativa requerida'
      : status === 403
        ? 'No tienes permisos para esta operación.'
        : json?.error?.message || json?.message || fallbackMessage;
    const errorCode = status === 401
      ? 'ADMIN_SESSION_REQUIRED'
      : status === 403
        ? 'FORBIDDEN'
        : json?.error?.code || json?.code || 'UNKNOWN_ERROR';
    return new AdminApiError(
      status,
      String(errorCode),
      String(errorMessage),
      typeof json?.error?.details === 'string' ? json.error.details : undefined,
      typeof json?.error?.hint === 'string' ? json.error.hint : undefined,
    );
  } catch {
    if (status === 401) return new AdminApiError(status, 'ADMIN_SESSION_REQUIRED', 'Sesión administrativa requerida');
    if (status === 403) return new AdminApiError(status, 'FORBIDDEN', 'No tienes permisos para esta operación.');
    return new AdminApiError(status, 'UNKNOWN_ERROR', text || fallbackMessage);
  }
}

export class AdminApiError extends Error {
  readonly apiMessage: string;

  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: string,
    readonly hint?: string,
  ) {
    const diagnostics = [details, hint]
      .filter((value): value is string => Boolean(value?.trim()))
      .join(' | ');
    super(`[${code}] ${message}${diagnostics ? ` (${diagnostics})` : ''}`);
    this.name = 'AdminApiError';
    this.apiMessage = message;
  }
}

export function formatAdminApiError(error: unknown, fallback: string): string {
  if (error instanceof AdminApiError) return `HTTP ${error.status} ${error.message}`;

  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}

export function isAdminAuthenticationError(error: unknown): boolean {
  return error instanceof AdminApiError && error.status === 401;
}

const API_ROOT = resolveApiBaseUrl(import.meta.env.VITE_API_URL);
const API_BASE = `${API_ROOT}/admin`;

function notifyAdminSessionRequired() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('admin-session-required'));
  }
}

function sessionRequiredError() {
  return new AdminApiError(401, 'ADMIN_SESSION_REQUIRED', 'Sesión administrativa requerida');
}

async function callApi(path: string, opts: RequestInit = {}) {
  const makeRequest = async (url: string, bearer: string) => {
    const headers = new Headers(opts.headers);
    if (!headers.has('Content-Type') && !(opts.body instanceof Blob)) {
      headers.set('Content-Type', 'application/json');
    }
    headers.set('Authorization', `Bearer ${bearer}`);
    try {
      return await fetch(url, { ...opts, headers });
    } catch {
      throw new Error('Error de red al consultar el servicio administrativo.');
    }
  };

  const primaryUrl = `${API_BASE}${path}`;
  let supabaseToken: string | null = null;
  try {
    supabaseToken = await getAccessToken();
  } catch {
    supabaseToken = null;
  }

  if (!supabaseToken) {
    notifyAdminSessionRequired();
    throw sessionRequiredError();
  }

  let res = await makeRequest(primaryUrl, supabaseToken);
  if (res.status === 401) {
    let refreshedToken: string | null = null;
    try {
      refreshedToken = await getAccessToken(true);
    } catch {
      refreshedToken = null;
    }

    if (refreshedToken) {
      res = await makeRequest(primaryUrl, refreshedToken);
    }

    if (!refreshedToken || res.status === 401) {
      try {
        await clearLocalAuthSession();
      } catch {}
      notifyAdminSessionRequired();
      if (!refreshedToken) throw sessionRequiredError();
    }
  }

  if (!res.ok) {
    const text = await res.text();
    throw parseAdminApiError(res.status, text);
  }

  if (res.status === 204) return null;
  const json = await res.json();
  if (json && typeof json === 'object' && 'data' in json && (!('ok' in json) || json.ok === true)) {
    return json.data;
  }
  return json;
}

export async function fetchProducts() {
  return callApi('/products', { method: 'GET' });
}

export async function fetchAdminDashboard(): Promise<AdminDashboardData> {
  return callApi('/dashboard', { method: 'GET' }) as Promise<AdminDashboardData>;
}

export async function createProductApi(payload: Partial<Product>) {
  return callApi('/products', { method: 'POST', body: JSON.stringify(payload) });
}

export async function uploadProductImageApi(file: File) {
  const response = await callApi('/product-images', {
    method: 'POST',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  return (response as any)?.data ?? response;
}

export async function updateProductApi(productId: string, payload: Partial<Product>) {
  return callApi(`/products/${productId}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function updateProductAvailabilityApi(productId: string, isActive: boolean) {
  return callApi(`/products/${productId}`, { method: 'PATCH', body: JSON.stringify({ is_active: isActive }) });
}

export async function deleteProductApi(productId: string) {
  return callApi(`/products/${productId}`, { method: 'DELETE' });
}

export async function fetchSupabaseProducts() {
  return callApi('/supabase-products', { method: 'GET' });
}

export async function createSupabaseProductApi(payload: Partial<Product>) {
  return callApi('/supabase-products', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateSupabaseProductApi(productId: string, payload: Partial<Product>) {
  return callApi(`/supabase-products/${productId}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function deleteSupabaseProductApi(productId: string) {
  return callApi(`/supabase-products/${productId}`, { method: 'DELETE' });
}

export async function updateHomeContentApi(payload: Record<string, unknown>) {
  return callApi('/home-content', { method: 'PATCH', body: JSON.stringify(mapHomeContentPayload(payload)) });
}

export async function adjustProductStock(input: AdjustStockInput): Promise<AdjustStockResult> {
  const normalizedReason = input.reason.trim();
  if (!normalizedReason) {
    throw new AdminApiError(400, 'INVALID_STOCK_REASON', 'Debes indicar un motivo para el ajuste de inventario.');
  }
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
    throw new AdminApiError(400, 'INVALID_STOCK_QUANTITY', 'La cantidad debe ser un número mayor que cero.');
  }
  if (!['in', 'out', 'correction'].includes(input.movementType)) {
    throw new AdminApiError(400, 'INVALID_STOCK_MOVEMENT_TYPE', 'El tipo de movimiento es inválido.');
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc('adjust_product_stock', {
    p_product_id: input.productId,
    p_movement_type: input.movementType,
    p_quantity: input.quantity,
    p_reason: normalizedReason,
  });

  if (error) {
    const message = error.message || 'No se pudo ajustar el inventario.';
    const code = error.code || 'STOCK_ADJUSTMENT_FAILED';
    throw new AdminApiError(400, code, message);
  }

  if (!data || typeof data !== 'object') {
    throw new AdminApiError(500, 'STOCK_ADJUSTMENT_EMPTY', 'La RPC no devolvió el resultado esperado.');
  }

  const result = data as AdjustStockResult;
  if (typeof result.product_id !== 'string' || Number.isNaN(result.previous_stock) || Number.isNaN(result.new_stock)) {
    throw new AdminApiError(500, 'STOCK_ADJUSTMENT_INVALID', 'La respuesta del ajuste de inventario no es válida.');
  }

  return result;
}

export async function createInventoryMovement(productId: string, delta: number, reason = 'Ajuste de inventario') {
  if (!Number.isFinite(delta) || delta === 0) {
    throw new AdminApiError(400, 'INVALID_STOCK_DELTA', 'La cantidad del ajuste debe ser distinta de cero.');
  }
  const movementType: StockMovementType = delta > 0 ? 'in' : 'out';
  return adjustProductStock({ productId, movementType, quantity: Math.abs(delta), reason });
}

export async function fetchAuditLogs(limit = 200) {
  return callApi(`/audit?limit=${limit}`, { method: 'GET' });
}

export default { fetchProducts, fetchAdminDashboard, createProductApi, uploadProductImageApi, fetchSupabaseProducts, createSupabaseProductApi, updateSupabaseProductApi, deleteSupabaseProductApi, updateProductApi, updateProductAvailabilityApi, deleteProductApi, updateHomeContentApi, createInventoryMovement, adjustProductStock, fetchAuditLogs };
