import { getSupabaseConfig } from '../config/supabase-env.js';
import { sanitizeSupabaseProductPayload } from '../utils/supabase-product-compat.js';

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
      throw new Error('Supabase admin configuration is missing');
    }
  }

  async fetchProducts(limit = 24) {
    this.assertConfig();
    const response = await fetch(`${this.supabaseUrl}/rest/v1/products?select=*&order=id.desc&limit=${limit}`, {
      method: 'GET',
      headers: this.getBaseHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Supabase admin fetch failed: ${response.status}`);
    }

    return response.json();
  }

  async createProduct(payload: Record<string, unknown>) {
    this.assertConfig();
    const response = await fetch(`${this.supabaseUrl}/rest/v1/products`, {
      method: 'POST',
      headers: this.getBaseHeaders(),
      body: JSON.stringify(sanitizeSupabaseProductPayload(payload)),
    });

    if (!response.ok) {
      throw new Error(`Supabase admin create failed: ${response.status}`);
    }

    return response.json();
  }

  async updateProduct(productId: string, payload: Record<string, unknown>) {
    this.assertConfig();
    const response = await fetch(`${this.supabaseUrl}/rest/v1/products?id=eq.${productId}`, {
      method: 'PATCH',
      headers: this.getBaseHeaders(),
      body: JSON.stringify(sanitizeSupabaseProductPayload(payload)),
    });

    if (!response.ok) {
      throw new Error(`Supabase admin update failed: ${response.status}`);
    }

    return response.json();
  }

  async deleteProduct(productId: string) {
    this.assertConfig();
    const response = await fetch(`${this.supabaseUrl}/rest/v1/products?id=eq.${productId}`, {
      method: 'DELETE',
      headers: this.getBaseHeaders(),
    });

    if (!response.ok) {
      throw new Error(`Supabase admin delete failed: ${response.status}`);
    }

    return response.json();
  }
}
