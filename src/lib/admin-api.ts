import type { Product } from '../../types';
import { getAccessToken } from './supabase-auth';

const normalizeApiRoot = (url?: string) => {
  const trimmed = url?.trim().replace(/\/$/, '');
  if (!trimmed) return '/api';
  if (trimmed.endsWith('/api')) return trimmed;
  if (trimmed.endsWith('/api/v1')) return trimmed.replace(/\/v1$/, '');
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

export async function fetchCategories() {
  return callApi('/categories', { method: 'GET' });
}

export async function createCategoryApi(payload: Record<string, unknown>) {
  return callApi('/categories', { method: 'POST', body: JSON.stringify(payload) });
}

export async function updateCategoryApi(categoryId: string, payload: Record<string, unknown>) {
  return callApi(`/categories/${categoryId}`, { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function deleteCategoryApi(categoryId: string) {
  return callApi(`/categories/${categoryId}`, { method: 'DELETE' });
}

export async function fetchSupabaseProducts() {
  throw new Error('[TODO] /supabase-products is not available in the current serverless runtime. Use /admin/products for product management.');
}

export async function createSupabaseProductApi(_payload: Partial<Product>) {
  throw new Error('[TODO] /supabase-products is not available in the current serverless runtime. Use /admin/products for product management.');
}

export async function updateSupabaseProductApi(_productId: string, _payload: Partial<Product>) {
  throw new Error('[TODO] /supabase-products is not available in the current serverless runtime. Use /admin/products for product management.');
}

export async function deleteSupabaseProductApi(_productId: string) {
  throw new Error('[TODO] /supabase-products is not available in the current serverless runtime. Use /admin/products for product management.');
}

export async function updateHomeContentApi(payload: Record<string, unknown>) {
  return callApi('/home-content', { method: 'PATCH', body: JSON.stringify(payload) });
}

export async function createInventoryMovement(_productId: string, _delta: number, _reason?: string) {
  throw new Error('[TODO] /inventory/movements is not available in the current runtime. Inventory mutations are not exposed yet through this client.');
}

export async function fetchAuditLogs(limit = 200) {
  return callApi(`/audit?limit=${limit}`, { method: 'GET' });
}

export default {
  fetchProducts,
  createProductApi,
  fetchSupabaseProducts,
  createSupabaseProductApi,
  updateSupabaseProductApi,
  deleteSupabaseProductApi,
  updateProductApi,
  deleteProductApi,
  fetchCategories,
  createCategoryApi,
  updateCategoryApi,
  deleteCategoryApi,
  updateHomeContentApi,
  createInventoryMovement,
  fetchAuditLogs,
};
