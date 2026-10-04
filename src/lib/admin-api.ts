import { getAccessToken } from './supabase-auth';
import { resolveApiBaseUrl } from './api-config';
import { mapHomeContentPayload } from './admin-home-content';

type Product = Record<string, unknown> & { id?: string };

export function parseAdminApiError(status: number, text: string): Error {
  const fallbackMessage = `${status} ${status === 400 ? 'Bad Request' : status === 401 ? 'Unauthorized' : status === 403 ? 'Forbidden' : status === 409 ? 'Conflict' : 'Request failed'}`;

  try {
    const json = JSON.parse(text);
    const errorMessage = json?.error?.message || json?.message || fallbackMessage;
    const errorCode = json?.error?.code || json?.code || 'UNKNOWN_ERROR';
    return new AdminApiError(
      status,
      String(errorCode),
      String(errorMessage),
      typeof json?.error?.details === 'string' ? json.error.details : undefined,
      typeof json?.error?.hint === 'string' ? json.error.hint : undefined,
    );
  } catch {
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

const API_ROOT = resolveApiBaseUrl(import.meta.env.VITE_API_URL);
const API_BASE = `${API_ROOT}/admin`;

async function callApi(path: string, opts: RequestInit = {}) {
  const supabaseToken = await getAccessToken();

  const makeRequest = async (url: string, bearer?: string) => {
    const headers = new Headers(opts.headers);
    if (!headers.has('Content-Type') && !(opts.body instanceof Blob)) {
      headers.set('Content-Type', 'application/json');
    }
    if (bearer) headers.set('Authorization', `Bearer ${bearer}`);
    return fetch(url, { ...opts, headers });
  };

  const primaryUrl = `${API_BASE}${path}`;
  let res: Response | null = null;
  let primaryError: unknown = null;

  if (!supabaseToken) {
    const error = new Error('No Supabase session token available. Por favor inicia sesión y recarga la aplicación.');
    console.error('[admin-api] callApi no supabase token available', { path });
    throw error;
  }

  try {
    res = await makeRequest(primaryUrl, supabaseToken);
  } catch (error) {
    primaryError = error;
  }

  if (!res) {
    throw new Error(`Network error calling ${primaryUrl}: ${primaryError ?? 'unknown error'}`);
  }

  if (!res.ok) {
    const text = await res.text();
    throw parseAdminApiError(res.status, text);
  }

  if (res.status === 204) return null;
  const json = await res.json();
  if (json && typeof json === 'object' && 'ok' in json && json.ok && 'data' in json) {
    return json.data;
  }
  return json;
}

export async function fetchProducts() {
  return callApi('/products', { method: 'GET' });
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

export async function createInventoryMovement(productId: string, delta: number, reason?: string) {
  return callApi('/inventory/movements', { method: 'POST', body: JSON.stringify({ productId, delta, reason }) });
}

export async function fetchAuditLogs(limit = 200) {
  return callApi(`/audit?limit=${limit}`, { method: 'GET' });
}

export default { fetchProducts, createProductApi, uploadProductImageApi, fetchSupabaseProducts, createSupabaseProductApi, updateSupabaseProductApi, deleteSupabaseProductApi, updateProductApi, deleteProductApi, updateHomeContentApi, createInventoryMovement, fetchAuditLogs };
