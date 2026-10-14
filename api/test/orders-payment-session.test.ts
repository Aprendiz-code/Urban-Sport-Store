import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const scopedClientMocks = vi.hoisted(() => ({ createClient: vi.fn() }));

vi.mock('../../lib/api-helpers/supabase.js', () => ({
  supabaseAdmin: {
    auth: { getUser: vi.fn() },
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

vi.mock('@supabase/supabase-js', () => ({
  createClient: scopedClientMocks.createClient,
}));

import { supabaseAdmin } from '../../lib/api-helpers/supabase.js';
import handler from '../orders/[id]/payment-session.js';

const orderId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const userId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const attemptId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
let claimedAmount = '120000';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function createQuery(result: { data: unknown; error: unknown }) {
  const query: any = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  return query;
}

function makeResponse() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(name: string, value: string) { this.headers[name] = value; },
    end(body: string) { this.body = body; },
  };
}

function futureDate(minutes: number) {
  return new Date(Date.now() + minutes * 60_000).toISOString();
}

function orderRow(overrides: Record<string, unknown> = {}) {
  return {
    id: orderId,
    user_id: userId,
    order_number: 'ORD-TEST-123',
    status: 'pending_payment',
    total: '120000',
    currency: 'COP',
    expires_at: futureDate(60),
    inventory_reservations: [{
      status: 'active',
      expires_at: futureDate(15),
    }],
    ...overrides,
  };
}

function claimResult(rpcClaimToken: string, status = 'claimed') {
  return {
    data: {
      status,
      attempt_id: attemptId,
      reference: 'sess_00000000000000000000000000000000',
      expected_amount: claimedAmount,
      currency: 'COP',
      claim_token: rpcClaimToken,
    },
    error: null,
  };
}

function completionResult(expiresAt: string, status = 'ready') {
  return {
    data: {
      status,
      checkout_url: 'https://checkout.wompi.co/l/link-test-1',
      checkout_expires_at: expiresAt,
    },
    error: null,
  };
}

function lookupResult() {
  return {
    data: {
      status: 'matched',
      attempt_id: attemptId,
      order_id: orderId,
      user_id: userId,
      session_state: 'ready',
      provider_session_type: 'payment_link',
    },
    error: null,
  };
}

describe('POST /api/orders/:id/payment-session', () => {
  let ownedOrderQuery: ReturnType<typeof createQuery>;
  let serviceOrderQuery: ReturnType<typeof createQuery>;
  let providerFetch: ReturnType<typeof vi.fn>;
  let linkExpiresAt: string;

  beforeEach(() => {
    vi.resetAllMocks();
    claimedAmount = '120000';
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon-test-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test-key');
    vi.stubEnv('WOMPI_ENVIRONMENT', 'sandbox');
    vi.stubEnv('WOMPI_API_BASE_URL', 'https://sandbox.wompi.co/v1');
    vi.stubEnv('WOMPI_PUBLIC_KEY', 'pub_test_unit_test');
    vi.stubEnv('WOMPI_PRIVATE_KEY', 'prv_test_unit_test');
    vi.stubEnv('WOMPI_SANDBOX_RETURN_URL', '');
    vi.stubEnv('WOMPI_SANDBOX_RETURN_ORIGINS', '');
    linkExpiresAt = futureDate(10);

    ownedOrderQuery = createQuery({ data: { id: orderId }, error: null });
    serviceOrderQuery = createQuery({ data: orderRow(), error: null });
    const profileQuery = createQuery({
      data: { id: userId, role: 'CUSTOMER', is_active: true },
      error: null,
    });
    (supabaseAdmin as any).from = vi.fn((table: string) =>
      table === 'profiles' ? profileQuery : serviceOrderQuery);
    (supabaseAdmin!.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: userId } },
      error: null,
    });
    (supabaseAdmin as any).rpc.mockImplementation(async (
      name: string,
      args: { p_claim_token?: string },
    ) => {
      if (name === 'claim_payment_session' && typeof args.p_claim_token === 'string') {
        return claimResult(args.p_claim_token);
      }
      if (name === 'complete_payment_session_with_provider_session') {
        return completionResult(linkExpiresAt);
      }
      if (name === 'lookup_payment_link_session') return lookupResult();
      throw new Error(`Unexpected RPC: ${name}`);
    });
    scopedClientMocks.createClient.mockReturnValue({
      from: vi.fn(() => ownedOrderQuery),
    });

    providerFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: vi.fn().mockResolvedValue({
        data: {
          id: 'link-test-1',
          url: 'https://checkout.wompi.co/l/link-test-1',
          expires_at: linkExpiresAt,
        },
      }),
    });
    vi.stubGlobal('fetch', providerFetch);
  });

  it('creates a sandbox link for the authenticated owner and returns only checkout details', async () => {
    const res = makeResponse();

    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer user-access-token' },
      query: { id: orderId },
      body: {
        amount: 1,
        currency: 'USD',
        reference: 'attacker-controlled',
        url: 'https://attacker.example',
      },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toEqual({
      checkoutUrl: 'https://checkout.wompi.co/l/link-test-1',
      expiresAt: expect.any(String),
    });
    expect(supabaseAdmin!.rpc).toHaveBeenNthCalledWith(1, 'claim_payment_session', {
      p_order_id: orderId,
      p_user_id: userId,
      p_claim_token: expect.stringMatching(/^[0-9a-f-]{36}$/i),
    });
    expect(providerFetch).toHaveBeenCalledTimes(1);
    const providerRequest = JSON.parse(providerFetch.mock.calls[0][1].body);
    expect(providerRequest).toMatchObject({
      amount_in_cents: 12_000_000,
      currency: 'COP',
      reference: 'sess_00000000000000000000000000000000',
      single_use: true,
      collect_shipping: false,
    });
    expect(providerRequest).not.toHaveProperty('sku');
    expect(supabaseAdmin!.rpc).toHaveBeenNthCalledWith(
      2,
      'complete_payment_session_with_provider_session',
      expect.objectContaining({
        p_attempt_id: attemptId,
        p_claim_token: expect.stringMatching(/^[0-9a-f-]{36}$/i),
        p_outcome: 'ready',
        p_transaction_id: null,
        p_provider_session_id: 'link-test-1',
        p_provider_session_type: 'payment_link',
      }),
    );
    expect(supabaseAdmin!.rpc).toHaveBeenNthCalledWith(
      3,
      'lookup_payment_link_session',
      {
        p_provider_session_id: 'link-test-1',
        p_expected_user_id: userId,
        p_expected_order_id: orderId,
      },
    );
  });

  it('builds the canonical checkout URL when Wompi omits data.url', async () => {
    providerFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: vi.fn().mockResolvedValue({
        data: { id: 'link-test-1', expires_at: linkExpiresAt },
      }),
    });
    const res = makeResponse();

    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer user-access-token' },
      query: { id: orderId },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data).toEqual({
      checkoutUrl: 'https://checkout.wompi.co/l/link-test-1',
      expiresAt: expect.any(String),
    });
  });

  it.each([
    { label: 'an unsafe session ID', id: 'invalid/id', expiryMinutes: 10 },
    { label: 'an expired session', id: 'link-test-1', expiryMinutes: -1 },
  ])('rejects Wompi responses with $label', async ({ id, expiryMinutes }) => {
    providerFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: vi.fn().mockResolvedValue({
        data: { id, expires_at: futureDate(expiryMinutes) },
      }),
    });
    const res = makeResponse();

    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer user-access-token' },
      query: { id: orderId },
    }, res);

    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.body).data).toBeUndefined();
  });

  it('sends the persisted final total including Coordinadora shipping to the provider', async () => {
    claimedAmount = '10010';
    serviceOrderQuery = createQuery({
      data: orderRow({ subtotal: '1000', shipping_amount: '9010', total: '10010' }),
      error: null,
    });
    const res = makeResponse();

    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer user-access-token' },
      query: { id: orderId },
    }, res);

    const providerRequest = JSON.parse(providerFetch.mock.calls[0][1].body);
    expect(res.statusCode).toBe(200);
    expect(providerRequest.amount_in_cents).toBe(1_001_000);
    expect(providerRequest.currency).toBe('COP');
  });

  it('includes the generic redirect only for an allowlisted HTTPS origin', async () => {
    vi.stubEnv('WOMPI_SANDBOX_RETURN_URL', 'https://store.example/checkout/return');
    vi.stubEnv('WOMPI_SANDBOX_RETURN_ORIGINS', 'https://store.example');
    const res = makeResponse();

    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer user-access-token' },
      query: { id: orderId },
    }, res);

    const providerRequest = JSON.parse(providerFetch.mock.calls[0][1].body);
    expect(res.statusCode).toBe(200);
    expect(providerRequest.redirect_url).toBe('https://store.example/checkout/return');
  });

  it.each([
    ['', 'https://store.example'],
    ['http://store.example/checkout/return', 'https://store.example'],
    ['https://store.example:8443/checkout/return', 'https://store.example'],
    ['https://user:pass@store.example/checkout/return', 'https://store.example'],
    ['https://store.example/checkout/return#success', 'https://store.example'],
    ['https://other.example/checkout/return', 'https://store.example'],
  ])('omits an absent or invalid redirect and still creates the link', async (returnUrl, origins) => {
    vi.stubEnv('WOMPI_SANDBOX_RETURN_URL', returnUrl);
    vi.stubEnv('WOMPI_SANDBOX_RETURN_ORIGINS', origins);
    const res = makeResponse();

    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer user-access-token' },
      query: { id: orderId },
    }, res);

    const providerRequest = JSON.parse(providerFetch.mock.calls[0][1].body);
    expect(res.statusCode).toBe(200);
    expect(providerFetch).toHaveBeenCalledTimes(1);
    expect(providerRequest).not.toHaveProperty('redirect_url');
    expect(providerRequest.expires_at).toBeDefined();
  });

  it.each([
    'http://store.example',
    'https://store.example/',
    'https://store.example/path',
    'https://store.example?query=1',
    'https://store.example#fragment',
    'https://store.example:8443',
    'https://user:pass@store.example',
  ])('ignores a non-canonical allowlist entry', async (origin) => {
    vi.stubEnv('WOMPI_SANDBOX_RETURN_URL', 'https://store.example/checkout/return');
    vi.stubEnv('WOMPI_SANDBOX_RETURN_ORIGINS', origin);
    const res = makeResponse();

    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer user-access-token' },
      query: { id: orderId },
    }, res);

    const providerRequest = JSON.parse(providerFetch.mock.calls[0][1].body);
    expect(res.statusCode).toBe(200);
    expect(providerFetch).toHaveBeenCalledTimes(1);
    expect(providerRequest).not.toHaveProperty('redirect_url');
    expect(providerRequest.expires_at).toBeDefined();
  });

  it('uses a uniform 404 for an order that is not visible to the Bearer user', async () => {
    ownedOrderQuery = createQuery({ data: null, error: null });
    scopedClientMocks.createClient.mockReturnValue({
      from: vi.fn(() => ownedOrderQuery),
    });
    const res = makeResponse();

    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer user-access-token' },
      query: { id: orderId },
    }, res);

    expect(res.statusCode).toBe(404);
    expect(supabaseAdmin!.rpc).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('rejects an order that is no longer pending', async () => {
    serviceOrderQuery = createQuery({
      data: orderRow({ status: 'cancelled' }),
      error: null,
    });
    (supabaseAdmin as any).from = vi.fn((table: string) =>
      table === 'profiles'
        ? createQuery({ data: { id: userId, role: 'CUSTOMER', is_active: true }, error: null })
        : serviceOrderQuery);
    const res = makeResponse();

    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer user-access-token' },
      query: { id: orderId },
    }, res);

    expect(res.statusCode).toBe(409);
    expect(supabaseAdmin!.rpc).not.toHaveBeenCalled();
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('does not call Wompi when the claim reports an expired reservation', async () => {
    serviceOrderQuery = createQuery({
      data: orderRow({
        inventory_reservations: [{ status: 'active', expires_at: new Date(Date.now() - 60_000).toISOString() }],
      }),
      error: null,
    });
    (supabaseAdmin as any).from = vi.fn((table: string) =>
      table === 'profiles'
        ? createQuery({ data: { id: userId, role: 'CUSTOMER', is_active: true }, error: null })
        : serviceOrderQuery);
    (supabaseAdmin as any).rpc.mockResolvedValueOnce({
      data: { status: 'conflict', reason: 'reservation_unavailable' },
      error: null,
    });
    const res = makeResponse();

    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer user-access-token' },
      query: { id: orderId },
    }, res);

    expect(res.statusCode).toBe(409);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('reports an active claim without creating a provider link', async () => {
    (supabaseAdmin as any).rpc.mockResolvedValueOnce({
      data: { status: 'in_progress' },
      error: null,
    });
    const res = makeResponse();

    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer user-access-token' },
      query: { id: orderId },
    }, res);

    expect(res.statusCode).toBe(202);
    expect(JSON.parse(res.body).data).toEqual({ status: 'in_progress' });
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it('does not create a new link when the prior outcome is unknown', async () => {
    (supabaseAdmin as any).rpc.mockResolvedValueOnce({
      data: { status: 'outcome_unknown' },
      error: null,
    });
    const res = makeResponse();

    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer user-access-token' },
      query: { id: orderId },
    }, res);

    expect(res.statusCode).toBe(503);
    expect(providerFetch).not.toHaveBeenCalled();
  });

  it.each([
    [401, 'credentials'],
    [403, 'credentials'],
    [400, 'validation'],
    [422, 'validation'],
    [429, 'rate_limit'],
    [408, 'provider_unavailable'],
    [503, 'provider_unavailable'],
    [302, 'unknown'],
  ] as const)('logs only safe provider metadata for HTTP %s', async (status, category) => {
    const responseBody = {
      error: {
        code: 'INVALID_AMOUNT',
        message: 'BODY_SENTINEL',
        messages: {
          amount_in_cents: ['VALUE_SENTINEL'],
          'unsafe[0]': ['BRACKET_SENTINEL'],
        },
      },
    };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    providerFetch.mockResolvedValueOnce({
      ok: false,
      status,
      json: vi.fn().mockResolvedValue(responseBody),
    });
    const res = makeResponse();

    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer user-access-token' },
      query: { id: orderId },
    }, res);

    expect(res.statusCode).toBe(502);
    const diagnosticCall = errorSpy.mock.calls.find(([message]) => message === 'Wompi payment-link rejected');
    expect(diagnosticCall).toEqual(['Wompi payment-link rejected', {
      provider_http_status: status,
      provider_error_code: 'INVALID_AMOUNT',
      provider_error_category: category,
      provider_error_classes: [],
      provider_error_codes: ['INVALID_AMOUNT'],
      provider_error_fields: ['amount_in_cents'],
      provider_error_paths: [],
      provider_validation_types: [],
    }]);
    expect(JSON.stringify(diagnosticCall)).not.toContain('BODY_SENTINEL');
    expect(JSON.stringify(diagnosticCall)).not.toContain('VALUE_SENTINEL');
    expect(JSON.stringify(diagnosticCall)).not.toContain('BRACKET_SENTINEL');
  });

  it('omits a provider error code that does not match the strict format', async () => {
    const responseBody = {
      error: { code: 'INVALID AMOUNT', message: 'BODY_SENTINEL' },
    };
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    providerFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      json: vi.fn().mockResolvedValue(responseBody),
    });
    const res = makeResponse();

    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer user-access-token' },
      query: { id: orderId },
    }, res);

    const diagnosticCall = errorSpy.mock.calls.find(([message]) => message === 'Wompi payment-link rejected');
    expect(diagnosticCall).toEqual(['Wompi payment-link rejected', {
      provider_http_status: 422,
      provider_error_category: 'validation',
      provider_error_classes: [],
      provider_error_codes: [],
      provider_error_fields: [],
      provider_error_paths: [],
      provider_validation_types: [],
    }]);
    expect(JSON.stringify(diagnosticCall)).not.toContain('BODY_SENTINEL');
  });

  it('persists an invalid successful provider response as ambiguous', async () => {
    providerFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: vi.fn().mockResolvedValue({ data: { id: null, url: null } }),
    });
    const res = makeResponse();

    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer user-access-token' },
      query: { id: orderId },
    }, res);

    expect(res.statusCode).toBe(502);
    expect(supabaseAdmin!.rpc).toHaveBeenNthCalledWith(
      2,
      'complete_payment_session_with_provider_session',
      expect.objectContaining({
        p_outcome: 'outcome_unknown',
        p_checkout_url: null,
        p_provider_session_id: null,
      }),
    );
    expect(JSON.parse(res.body).data).toBeUndefined();
  });

  it('uses the canonical URL when Wompi returns a URL outside its checkout domain', async () => {
    providerFetch.mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: vi.fn().mockResolvedValue({
        data: {
          id: 'link-test-1',
          url: 'https://checkout.attacker.example/l/link-test-1',
          expires_at: linkExpiresAt,
        },
      }),
    });
    const res = makeResponse();

    await handler({
      method: 'POST',
      headers: { authorization: 'Bearer user-access-token' },
      query: { id: orderId },
    }, res);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.checkoutUrl).toBe(
      'https://checkout.wompi.co/l/link-test-1',
    );
    expect(supabaseAdmin!.rpc).toHaveBeenNthCalledWith(
      2,
      'complete_payment_session_with_provider_session',
      expect.objectContaining({
        p_outcome: 'ready',
        p_checkout_url: 'https://checkout.wompi.co/l/link-test-1',
        p_provider_session_id: 'link-test-1',
        p_provider_session_type: 'payment_link',
      }),
    );
  });
});
