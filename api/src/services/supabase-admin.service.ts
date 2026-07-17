export class SupabaseAdminService {
  private readonly supabaseUrl: string;
  private readonly serviceRoleKey: string;

  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL ?? '';
    this.serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
  }

  private getBaseHeaders() {
    return {
      apikey: this.serviceRoleKey,
      Authorization: `Bearer ${this.serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    };
  }

  async createProduct(payload: Record<string, unknown>) {
    if (!this.supabaseUrl || !this.serviceRoleKey) {
      throw new Error('Supabase admin configuration is missing');
    }

    const response = await fetch(`${this.supabaseUrl}/rest/v1/products`, {
      method: 'POST',
      headers: this.getBaseHeaders(),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Supabase admin create failed: ${response.status}`);
    }

    return response.json();
  }
}
