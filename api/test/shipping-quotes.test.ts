import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getUser: vi.fn(),
  productRows: [] as any[],
  rateRows: [] as any[],
  insertedQuote: null as any,
}));

vi.mock('../../lib/api-helpers/supabase.js', () => ({
  supabaseAdmin: {
    from: mocks.from,
    auth: { getUser: mocks.getUser },
  },
}));

import handler from '../shipping/quotes.js';
import destinationsHandler from '../shipping/destinations.js';

const productId = '11111111-1111-4111-8111-111111111111';
const secondProductId = '33333333-3333-4333-8333-333333333333';
const requestBody = {
  destinationCode: '11001000',
  address: {
    recipientName: 'Ana Gómez',
    addressLine1: 'Cra 15 #84-25',
    city: 'Bogotá',
    state: 'Cundinamarca',
    postalCode: '110221',
    country: 'CO',
    phone: '+57 311 234 5678',
  },
  items: [{ productId, quantity: 1 }],
};

const productRow = {
  id: productId,
  name: 'Producto sintético',
  sku: 'STAGING-SYNTH-001',
  price: '1000',
  is_active: true,
  shipping_weight_grams: 1000,
  shipping_length_cm: '20',
  shipping_width_cm: '20',
  shipping_height_cm: '10',
  shipping_declared_value_cop: '1000',
  shipping_units_per_guide: 1,
};

const rateRow = {
  id: '22222222-2222-4222-8222-222222222222',
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
  base_rate_cop: '9000',
  handling_type: 'percentage',
  handling_value: '1',
  handling_basis: 'declared_value',
  handling_rounding: 'exact',
  estimated_delivery_business_days: 1,
  valid_from: '2026-10-13',
  valid_until: '2026-12-31',
  is_active: true,
};

function query(result: unknown) {
  const filters: Array<{ method: string; column: string; value: unknown }> = [];
  const filteredResult = () => {
    if (!result || typeof result !== 'object' || !Array.isArray((result as any).data)) return result;
    const rows = (result as any).data.filter((row: any) => filters.every(({ method, column, value }) => {
      if (method === 'eq') return row[column] === value;
      if (method === 'lte') return row[column] <= value;
      if (method === 'gte') return row[column] >= value;
      if (method === 'in') return Array.isArray(value) && value.includes(row[column]);
      return true;
    }));
    return { ...(result as any), data: rows };
  };
  const builder: any = {
    select: vi.fn(() => builder),
    eq: vi.fn((column: string, value: unknown) => { filters.push({ method: 'eq', column, value }); return builder; }),
    lte: vi.fn((column: string, value: unknown) => { filters.push({ method: 'lte', column, value }); return builder; }),
    gte: vi.fn((column: string, value: unknown) => { filters.push({ method: 'gte', column, value }); return builder; }),
    in: vi.fn((column: string, value: unknown[]) => { filters.push({ method: 'in', column, value }); return builder; }),
    insert: vi.fn((row: unknown) => { mocks.insertedQuote = row; return builder; }),
    maybeSingle: vi.fn(() => Promise.resolve(filteredResult())),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(filteredResult()).then(resolve),
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

beforeEach(() => {
  vi.resetAllMocks();
  mocks.insertedQuote = null;
  mocks.productRows = [{ ...productRow }];
  mocks.rateRows = [{ ...rateRow }];
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
  mocks.from.mockImplementation((table: string) => {
    if (table === 'profiles') return query({ data: { id: 'user-1', role: 'CUSTOMER', is_active: true }, error: null });
    if (table === 'products') return query({ data: mocks.productRows, error: null });
    if (table === 'shipping_rates') return query({ data: mocks.rateRows, error: null });
    if (table === 'shipping_quotes') return query({ data: null, error: null });
    throw new Error(`Unexpected table: ${table}`);
  });
});

describe('POST /api/shipping/quotes', () => {
  it('persists a user-bound COP quote using server product and rate data', async () => {
    const res = response();
    await handler({ method: 'POST', headers: { authorization: 'Bearer session' }, body: requestBody }, res);

    const payload = JSON.parse(res.body);
    expect(res.statusCode).toBe(201);
    expect(payload.data.quote).toMatchObject({
      provider: 'coordinadora',
      calculatedBy: 'urban_sport_store',
      currency: 'COP',
      amountCop: 9010,
      subtotalCop: 1000,
      coverage: { covered: true, originCode: '11001000', destinationCode: '11001000' },
      destination: {
        code: '11001000',
        department: 'Cundinamarca',
        municipality: 'Bogotá',
      },
      estimatedDelivery: { minBusinessDays: 1, maxBusinessDays: 1 },
    });
    expect(mocks.insertedQuote).toMatchObject({
      user_id: 'user-1',
      carrier: 'coordinadora',
      currency: 'COP',
      amount_cop: 9010,
      status: 'issued',
      address_snapshot: requestBody.address,
      items_snapshot: requestBody.items,
    });
    expect(Date.parse(payload.data.quote.expiresAt) - Date.now()).toBeGreaterThan(29 * 60_000);
    expect(Date.parse(payload.data.quote.expiresAt) - Date.now()).toBeLessThanOrEqual(30 * 60_000);
  });

  it('stores the same canonical item order used by the re-quote contract', async () => {
    mocks.productRows = [
      { ...productRow, id: secondProductId, sku: 'STAGING-SYNTH-002' },
      { ...productRow },
    ];
    const res = response();
    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer session' },
      body: {
        ...requestBody,
        items: [
          { productId: secondProductId, quantity: 1 },
          { productId, quantity: 1 },
        ],
      },
    }, res);

    expect(res.statusCode).toBe(201);
    expect(mocks.insertedQuote.items_snapshot).toEqual([
      { productId, quantity: 1 },
      { productId: secondProductId, quantity: 1 },
    ]);
  });

  it('returns uncovered without persisting a quote', async () => {
    mocks.rateRows = [];
    const res = response();
    await handler({ method: 'POST', headers: { authorization: 'Bearer session' }, body: requestBody }, res);

    expect(res.statusCode).toBe(422);
    expect(JSON.parse(res.body).data).toMatchObject({ quote: null, coverage: { covered: false }, currency: 'COP' });
    expect(mocks.insertedQuote).toBeNull();
  });

  it('rejects a package outside the configured weight band before persistence', async () => {
    mocks.productRows = [{ ...productRow, shipping_length_cm: '30' }];
    const res = response();
    await handler({ method: 'POST', headers: { authorization: 'Bearer session' }, body: requestBody }, res);

    expect(res.statusCode).toBe(422);
    expect(mocks.insertedQuote).toBeNull();
  });

  it('rejects multiple applicable active tariffs instead of selecting one silently', async () => {
    mocks.rateRows = [{ ...rateRow }, { ...rateRow, id: '33333333-3333-4333-8333-333333333333' }];
    const res = response();
    await handler({ method: 'POST', headers: { authorization: 'Bearer session' }, body: requestBody }, res);

    expect(res.statusCode).toBe(409);
    expect(mocks.insertedQuote).toBeNull();
  });

  it('does not persist a quote for an unconfigured destination code', async () => {
    const res = response();
    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer session' },
      body: { ...requestBody, destinationCode: '99999999' },
    }, res);

    expect(res.statusCode).toBe(422);
    expect(mocks.insertedQuote).toBeNull();
  });

  it('requires an authenticated active profile', async () => {
    mocks.getUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('invalid') });
    const res = response();
    await handler({ method: 'POST', headers: {}, body: requestBody }, res);
    expect(res.statusCode).toBe(401);
    expect(mocks.insertedQuote).toBeNull();
  });
});

describe('GET /api/shipping/destinations', () => {
  it('returns only active destinations whose tariff is valid today', async () => {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const yesterday = new Date(`${today}T12:00:00-05:00`);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(`${today}T12:00:00-05:00`);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const date = (value: Date) => new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(value);

    mocks.rateRows = [
      { ...rateRow, is_active: true, valid_from: date(yesterday), valid_until: date(tomorrow) },
      { ...rateRow, id: '33333333-3333-4333-8333-333333333333', destination_code: '22001000', destination_city: 'Inactive', is_active: false, valid_from: date(yesterday), valid_until: date(tomorrow) },
      { ...rateRow, id: '44444444-4444-4444-8444-444444444444', destination_code: '33001000', destination_city: 'Expired', is_active: true, valid_from: '2020-01-01', valid_until: '2020-12-31' },
    ];
    const res = response();
    await destinationsHandler({ method: 'GET', headers: { authorization: 'Bearer session' } }, res);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.destinations).toEqual([{
      code: '11001000', department: 'Cundinamarca', municipality: 'Bogotá',
    }]);
  });

  it('returns 409 when one active destination code has conflicting labels', async () => {
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    mocks.rateRows = [
      { ...rateRow, is_active: true, valid_from: today, valid_until: '2026-12-31' },
      { ...rateRow, id: '33333333-3333-4333-8333-333333333333', destination_city: 'Conflicting label', is_active: true, valid_from: today, valid_until: '2026-12-31' },
    ];
    const res = response();
    await destinationsHandler({ method: 'GET', headers: { authorization: 'Bearer session' } }, res);
    expect(res.statusCode).toBe(409);
  });
});