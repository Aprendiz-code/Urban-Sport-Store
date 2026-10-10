import { beforeEach, describe, expect, it, vi } from 'vitest';

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
      reference: 'internal-reference-not-for-provider',
      expected_amount: '120000',
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
    vi.stubEnv('SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('SUPABASE_ANON_KEY', 'anon-test-key');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-test-key');
    vi.stubEnv('WOMPI_ENVIRONMENT', 'sandbox');
    vi.stubEnv('WOMPI_API_BASE_URL', 'https://sandbox.wompi.co/v1');
    vi.stubEnv('WOMPI_PUBLIC_KEY', 'pub_test_unit_test');
    vi.stubEnv('WOMPI_PRIVATE_KEY', 'prv_test_unit_test');
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
      single_use: true,
      collect_shipping: false,
    });
    expect(providerRequest).not.toHaveProperty('reference');
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

  it('never returns a payment link outside the official checkout domain', async () => {
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

    expect(res.statusCode).toBe(502);
    expect(supabaseAdmin!.rpc).toHaveBeenNthCalledWith(
      2,
      'complete_payment_session_with_provider_session',
      expect.objectContaining({
        p_outcome: 'outcome_unknown',
        p_checkout_url: null,
        p_provider_session_id: 'link-test-1',
        p_provider_session_type: 'payment_link',
      }),
    );
    expect(JSON.parse(res.body).data).toBeUndefined();
  });
});
