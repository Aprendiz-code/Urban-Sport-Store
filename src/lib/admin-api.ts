import type { Product } from '../../types';
import { getAccessToken } from './supabase-auth';

const normalizeApiRoot = (url?: string) => {
  const trimmed = url?.trim().replace(/\/$/, '');
  if (!trimmed) return '/api/v1';
  if (trimmed.endsWith('/api/v1')) return trimmed;
  if (trimmed.endsWith('/api')) return `${trimmed}/v1`;
  return `${trimmed}/api/v1`;
};

const API_ROOT = normalizeApiRoot(import.meta.env.VITE_API_URL);
async function bridgeSupabaseToken(supabaseToken: string) {
  const res = await fetch(`${API_ROOT}/auth/bridge`, { method: 'POST', headers: { Authorization: `Bearer ${supabaseToken}`, 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error('Bridge failed');
  const json = await res.json();
  return json?.data?.token ?? null;
}

async function callApi(path: string, opts: RequestInit = {}) {
  const supabaseToken = await getAccessToken();
  const storedBackend = localStorage.getItem('urbansport_backend_token');

  const makeRequest = async (url: string, bearer?: string) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (bearer) headers['Authorization'] = `Bearer ${bearer}`;
    return fetch(url, { headers: { ...(opts.headers as Record<string,string>), ...headers }, ...opts });
  };

  const primaryUrl = `${API_BASE}${path}`;
  const fallbackUrl = `/api/v1/admin${path}`;

  let res: Response | null = null;
  let primaryError: unknown = null;

  try {
    res = storedBackend ? await makeRequest(primaryUrl, storedBackend) : await makeRequest(primaryUrl, supabaseToken ?? undefined);
  } catch (error) {
    primaryError = error;
  }

  if (res && res.status === 401 && supabaseToken) {
    try {
      const backendToken = await bridgeSupabaseToken(supabaseToken);
      if (backendToken) {
        localStorage.setItem('urbansport_backend_token', backendToken);
        res = await makeRequest(primaryUrl, backendToken);
      }
    } catch (e) {
      // ignore
    }
  }

  const shouldTryFallback = !res || [404, 502, 503, 504].includes(res.status);

  if (shouldTryFallback) {
    try {
      const bearer = storedBackend ?? supabaseToken ?? undefined;
      const fallbackRes = await makeRequest(fallbackUrl, bearer);
      if (fallbackRes.ok) {
        res = fallbackRes;
      }
    } catch (e) {
      // ignore fallback errors and continue to original error handling below
    }
  }

  if (!res) {
    throw new Error(`Network error calling ${primaryUrl}: ${primaryError ?? 'unknown error'}`);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
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
