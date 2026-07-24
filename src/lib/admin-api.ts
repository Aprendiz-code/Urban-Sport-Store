import type { Product } from '../../types';
import { getAccessToken } from './supabase-auth';

const normalizeApiRoot = (url?: string) => {
  const trimmed = url?.trim().replace(/\/$/, '');
  if (!trimmed) return '/api';
  if (trimmed.endsWith('/api')) return trimmed;
  return `${trimmed}/api`;
};

const API_ROOT = normalizeApiRoot(import.meta.env.VITE_API_URL);
const API_BASE = `${API_ROOT}/admin`;

async function callApi(path: string, opts: RequestInit = {}) {
  const supabaseToken = await getAccessToken();
  console.debug('[admin-api] callApi', {
    path,
    apiRoot: API_ROOT,
    supabaseTokenExists: Boolean(supabaseToken),
    supabaseTokenLength: supabaseToken?.length,
    supabaseTokenLooksLikeJwt: typeof supabaseToken === 'string' && supabaseToken.split('.').length === 3,
  });

  const makeRequest = async (url: string, bearer?: string) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (bearer) headers['Authorization'] = `Bearer ${bearer}`;
    return fetch(url, { headers: { ...(opts.headers as Record<string,string>), ...headers }, ...opts });
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
    try {
      const json = JSON.parse(text);
      const errorMessage = json?.error?.message || json?.message || `${res.status} ${res.statusText}`;
      const errorCode = json?.error?.code || json?.code || 'UNKNOWN_ERROR';
      throw new Error(`[${errorCode}] ${errorMessage}`);
    } catch {
      throw new Error(`${res.status} ${res.statusText}: ${text}`);
    }
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
  return callApi('/home-content', { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function createInventoryMovement(productId: string, delta: number, reason?: string) {
  return callApi('/inventory/movements', { method: 'POST', body: JSON.stringify({ productId, delta, reason }) });
}

export async function fetchAuditLogs(limit = 200) {
  return callApi(`/audit?limit=${limit}`, { method: 'GET' });
}

export default { fetchProducts, createProductApi, fetchSupabaseProducts, createSupabaseProductApi, updateSupabaseProductApi, deleteSupabaseProductApi, updateProductApi, deleteProductApi, updateHomeContentApi, createInventoryMovement, fetchAuditLogs };
