import type { Product } from '../../types';
import { getAccessToken } from './supabase-auth';

const API_ROOT = import.meta.env.VITE_API_URL ?? '/api/v1';
const API_BASE = API_ROOT + '/admin';

async function bridgeSupabaseToken(supabaseToken: string) {
  const res = await fetch(`${API_ROOT}/auth/bridge`, { method: 'POST', headers: { Authorization: `Bearer ${supabaseToken}`, 'Content-Type': 'application/json' } });
  if (!res.ok) throw new Error('Bridge failed');
  const json = await res.json();
  return json?.data?.token ?? null;
}

async function callApi(path: string, opts: RequestInit = {}) {
  const supabaseToken = await getAccessToken();
  const storedBackend = localStorage.getItem('urbansport_backend_token');

  const makeRequest = async (bearer?: string) => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (bearer) headers['Authorization'] = `Bearer ${bearer}`;
    const res = await fetch(`${API_BASE}${path}`, { headers: { ...(opts.headers as Record<string,string>), ...headers }, ...opts });
    return res;
  };

  let res = storedBackend ? await makeRequest(storedBackend) : await makeRequest(supabaseToken ?? undefined);

  if (res.status === 401 && supabaseToken) {
    try {
      const backendToken = await bridgeSupabaseToken(supabaseToken);
      if (backendToken) {
        localStorage.setItem('urbansport_backend_token', backendToken);
        res = await makeRequest(backendToken);
      }
    } catch (e) {
      // ignore
    }
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

export async function createInventoryMovement(productId: string, delta: number, reason?: string) {
  return callApi('/inventory/movements', { method: 'POST', body: JSON.stringify({ productId, delta, reason }) });
}

export async function fetchAuditLogs(limit = 200) {
  return callApi(`/audit?limit=${limit}`, { method: 'GET' });
}

export default { fetchProducts, createProductApi, fetchSupabaseProducts, createSupabaseProductApi, updateSupabaseProductApi, deleteSupabaseProductApi, updateProductApi, deleteProductApi, createInventoryMovement, fetchAuditLogs };
