import { getSupabaseConfig } from '../config/supabase-env.js';
import { sanitizeSupabaseProductPayload } from '../utils/supabase-product-compat.js';
import { HttpError } from '../middlewares/error-handler.js';
import { logger } from '../config/logger.js';

export class SupabaseAdminService {
  private readonly supabaseUrl: string;
  private readonly serviceRoleKey: string;

  constructor() {
    const { url, serviceRoleKey } = getSupabaseConfig();
    this.supabaseUrl = url;
    this.serviceRoleKey = serviceRoleKey;
  }

  private getBaseHeaders() {
    return {
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    };
  }

  private assertConfig() {
    if (!this.supabaseUrl || !this.serviceRoleKey) {
      throw new HttpError(500, 'SUPABASE_CONFIG_MISSING', 'Supabase admin configuration is missing');
    }
  }

  private async parseSupabaseResponse(response: Response, action: string) {
    const text = await response.text();
    let parsed: any = null;

    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = text;
    }

    const message = parsed?.message || parsed?.error?.message || `Supabase admin ${action} failed with status ${response.status}`;
    const code = parsed?.error?.code || `SUPABASE_${action.toUpperCase()}_FAILED`;

    logger.error({ status: response.status, url: response.url, action, response: parsed }, `Supabase admin ${action} error`);

    throw new HttpError(response.status === 401 ? 401 : 500, code, message);
  }

  private async request(path: string, options: RequestInit, action: string) {
    this.assertConfig();
    const url = `${this.supabaseUrl}${path}`;

    logger.info({ action, url }, 'Calling Supabase admin service');

    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        return this.parseSupabaseResponse(response, action);
      }
      return response.json();
    } catch (error) {
      logger.error({ error, url, action }, 'Failed to call Supabase admin API');
      throw new HttpError(502, 'SUPABASE_SERVICE_UNAVAILABLE', `Unable to reach Supabase admin API for ${action}`);
    }
  }

  async fetchProducts(limit = 24) {
    return this.request(`/rest/v1/products?select=*&order=id.desc&limit=${limit}`, {
      method: 'GET',
      headers: this.getBaseHeaders(),
    }, 'fetch');
  }

  async createProduct(payload: Record<string, unknown>) {
    return this.request('/rest/v1/products', {
      method: 'POST',
      headers: this.getBaseHeaders(),
      body: JSON.stringify(sanitizeSupabaseProductPayload(payload)),
    }, 'create');
  }

  async updateProduct(productId: string, payload: Record<string, unknown>) {
    return this.request(`/rest/v1/products?id=eq.${productId}`, {
      method: 'PATCH',
      headers: this.getBaseHeaders(),
      body: JSON.stringify(sanitizeSupabaseProductPayload(payload)),
    }, 'update');
  }

  async deleteProduct(productId: string) {
    return this.request(`/rest/v1/products?id=eq.${productId}`, {
      method: 'DELETE',
      headers: this.getBaseHeaders(),
    }, 'delete');
  }
}
