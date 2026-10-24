import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  authenticate: vi.fn(),
  requirePermission: vi.fn(),
  rateRows: [] as any[],
}));

vi.mock('../../lib/api-helpers/supabase.js', () => ({
  supabaseAdmin: { from: mocks.from, rpc: mocks.rpc },
}));
vi.mock('../../lib/api-helpers/auth.js', () => ({ requireAuthenticatedUser: mocks.authenticate }));
vi.mock('../../lib/api-helpers/admin.js', () => ({ requirePermission: mocks.requirePermission }));

import handler from '../shipping/rates.js';
import { ApiError } from '../../lib/api-helpers/response.js';

const rateInput = {
  carrier: 'coordinadora',
  origin_code: '11001000',
  origin_city: 'Bogotá',
  origin_department: 'Cundinamarca',
  destination_code: '11001000',
  destination_city: 'Bogotá',
  destination_department: 'Cundinamarca',
  route_category: 'Local',
  min_billable_weight_grams: 1000,
  max_billable_weight_grams: 2000,
  base_rate_cop: 9000,
  handling_type: 'percentage',
  handling_value: 1,
  handling_basis: 'declared_value',
  handling_rounding: 'exact',
  tax_status: 'unspecified',
  estimated_delivery_business_days: 1,
  valid_from: '2026-10-13',
  valid_until: '2026-12-31',
  is_active: true,
};

function query(result: unknown) {
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

function response() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(name: string, value: string) { this.headers[name] = value; },
    end(body: string) { this.body = body; },
  };
}

function request(method: string, url: string, body?: unknown) {
  return { method, url, headers: { authorization: 'Bearer admin-session' }, body };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.rateRows = [];
  mocks.authenticate.mockResolvedValue({ id: 'owner-user' });
  mocks.requirePermission.mockResolvedValue('OWNER');
  mocks.rpc.mockResolvedValue({ data: { rate: { id: 'rate-1', ...rateInput } }, error: null });
  mocks.from.mockImplementation((table: string) => {
    if (table === 'shipping_rates') return query({ data: mocks.rateRows, error: null });
    throw new Error(`Unexpected table: ${table}`);
  });
});

describe('admin Coordinadora rate endpoints', () => {
  it('lists rates only after the settings permission check', async () => {
    mocks.rateRows = [{ id: 'rate-1', ...rateInput }];
    const res = response();
    await handler(request('GET', '/api/shipping/rates'), res);

    expect(mocks.requirePermission).toHaveBeenCalledWith({ id: 'owner-user' }, 'settings.manage');
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.rates).toHaveLength(1);
  });

  it('creates a validated tariff through the audited database RPC', async () => {
    const res = response();
    await handler(request('POST', '/api/shipping/rates', rateInput), res);

    expect(mocks.rpc).toHaveBeenCalledWith('admin_upsert_coordinadora_shipping_rate', {
      p_actor_id: 'owner-user',
      p_rate_id: null,
      p_rate: rateInput,
    });
    expect(res.statusCode).toBe(201);
  });

  it('updates or deactivates a tariff through the same audited RPC', async () => {
    const rateId = '22222222-2222-4222-8222-222222222222';
    const res = response();
    await handler(request('PATCH', '/api/shipping/rates', { ...rateInput, is_active: false, rateId }), res);

    expect(mocks.rpc).toHaveBeenCalledWith('admin_upsert_coordinadora_shipping_rate', {
      p_actor_id: 'owner-user',
      p_rate_id: rateId,
      p_rate: { ...rateInput, is_active: false },
    });
    expect(res.statusCode).toBe(200);
  });

  it('rejects invalid tariffs and denies callers without settings permission', async () => {
    const invalidRes = response();
    await handler(request('POST', '/api/shipping/rates', { ...rateInput, min_billable_weight_grams: 0 }), invalidRes);
    expect(invalidRes.statusCode).toBe(400);
    expect(mocks.rpc).not.toHaveBeenCalled();

    mocks.requirePermission.mockRejectedValueOnce(new ApiError(403, 'No autorizado.'));
    const deniedRes = response();
    await handler(request('GET', '/api/shipping/rates'), deniedRes);
    expect(deniedRes.statusCode).toBe(403);
  });
});