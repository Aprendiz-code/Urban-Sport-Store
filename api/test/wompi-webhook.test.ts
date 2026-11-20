import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/api-helpers/supabase.js', () => ({
  supabaseAdmin: { rpc: vi.fn() },
}));

import { supabaseAdmin } from '../../lib/api-helpers/supabase.js';
import handler from '../webhooks/wompi.js';

const eventsSecret = 'test-events-secret-only-for-unit-tests';
const orderReference = 'sess_test_reference';
const paymentLinkId = 'link_test_id';
const fetchMock = vi.fn();
let officialTransaction: Record<string, unknown> | null = null;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function makeResponse() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(name: string, value: string) { this.headers[name] = value; },
    end(body: string) { this.body = body; },
  };
}

function signEvent(event: any) {
  const signedValues = event.signature.properties.map((path: string) =>
    path.split('.').reduce((value: any, part: string) => value[part], event.data));
  event.signature.checksum = createHash('sha256')
    .update(`${signedValues.join('')}${event.timestamp}${eventsSecret}`)
    .digest('hex');
  officialTransaction = structuredClone(event.data.transaction);
  return event;
}

function signedEvent(status: string) {
  return signEvent({
    event: 'transaction.updated',
    environment: 'test',
    data: {
      transaction: {
        id: 'sandbox-transaction-1',
        status,
        amount_in_cents: 12_000_000,
        reference: 'wompi-reference',
        currency: 'COP',
        payment_link_id: paymentLinkId,
      },
    },
    signature: {
      properties: [
        'transaction.id',
        'transaction.status',
        'transaction.amount_in_cents',
        'transaction.payment_link_id',
        'transaction.reference',
      ],
      checksum: '',
    },
    timestamp: Math.floor(Date.now() / 1000),
  });
}

function queueOfficialTransaction(
  overrides: Record<string, unknown> = {},
  status = 200,
) {
  const data = { ...(officialTransaction ?? {}), ...overrides };
  fetchMock.mockResolvedValueOnce(new Response(
    JSON.stringify({ data }),
    { status, headers: { 'Content-Type': 'application/json' } },
  ));
}

function matchedAttempt(reference: string, transactionId: string | null = null) {
  return {
    status: 'matched',
    reference,
    expected_amount: 120000,
    currency: 'COP',
    transaction_id: transactionId,
  };
}

describe('Wompi transaction webhook', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('WOMPI_ENVIRONMENT', 'sandbox');
    vi.stubEnv('WOMPI_EVENTS_SECRET', eventsSecret);
    vi.stubEnv('WOMPI_API_BASE_URL', 'https://sandbox.wompi.co/v1');
    vi.stubEnv('WOMPI_PUBLIC_KEY', 'pub_test_unit_test');
    vi.stubEnv('WOMPI_PRIVATE_KEY', 'prv_test_unit_test');
    officialTransaction = null;
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => new Response(
      JSON.stringify({ data: officialTransaction }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ));
    vi.stubGlobal('fetch', fetchMock);
    (supabaseAdmin!.rpc as ReturnType<typeof vi.fn>).mockImplementation(async (name: string, args: any) => {
      if (name === 'lookup_payment_link_session') {
        if (args.p_provider_session_id !== paymentLinkId) {
          return { data: { status: 'unmatched' }, error: null };
        }
        return { data: matchedAttempt(orderReference), error: null };
      }
      return { data: 'applied', error: null };
    });
  });

  it('rejects methods other than POST before calling the database', async () => {
    const res = makeResponse();

    await handler({ method: 'GET', headers: {}, body: {} }, res);

    expect(res.statusCode).toBe(405);
    expect(supabaseAdmin!.rpc).not.toHaveBeenCalled();
  });

  it('fails closed when the event secret is missing', async () => {
    vi.stubEnv('WOMPI_EVENTS_SECRET', '');
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: signedEvent('APPROVED') }, res);

    expect(res.statusCode).toBe(503);
    expect(supabaseAdmin!.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['APPROVED', 'approved'],
    ['DECLINED', 'rejected'],
    ['VOIDED', 'voided'],
    ['ERROR', 'error'],
  ])('correlates %s through payment_link_id before processing', async (providerStatus, databaseStatus) => {
    const event = signedEvent(providerStatus);
    delete event.data.transaction.reference;
    event.signature.properties = event.signature.properties.filter(
      (property: string) => property !== 'transaction.reference',
    );
    signEvent(event);
    const lookupReference = 'internal-reference-from-lookup';
    const rpc = supabaseAdmin!.rpc as ReturnType<typeof vi.fn>;
    rpc.mockResolvedValueOnce({ data: matchedAttempt(lookupReference), error: null });
    rpc.mockResolvedValueOnce({ data: 'applied', error: null });
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: event }, res);

    expect(res.statusCode).toBe(200);
    expect(event.signature.properties).toContain('transaction.payment_link_id');
    expect(rpc.mock.calls[0]).toEqual([
      'lookup_payment_link_session',
      { p_provider_session_id: event.data.transaction.payment_link_id },
    ]);
    const processorCalls = rpc.mock.calls.filter(
      ([name]) => name === 'process_verified_wompi_event_after_requote',
    );
    expect(processorCalls).toHaveLength(1);
    expect(processorCalls[0][1].p_reference).toBe(lookupReference);
    expect(processorCalls[0][1]).toMatchObject({
      p_transaction_id: 'sandbox-transaction-1',
      p_provider_status: databaseStatus,
      p_amount: 120000,
      p_currency: 'COP',
      p_provider_transaction_reference: null,
    });
    expect(JSON.parse(res.body).data.status).toBe('applied');
  });

  it('rejects an invalid checksum before any external or database call', async () => {
    const event = signedEvent('APPROVED');
    event.signature.properties = event.signature.properties.filter(
      (property: string) => property !== 'transaction.payment_link_id'
        && property !== 'transaction.reference',
    );
    signEvent(event);
    event.signature.checksum = '0'.repeat(64);
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: event }, res);

    expect(res.statusCode).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(supabaseAdmin!.rpc).not.toHaveBeenCalled();
  });

  it('uses the official link when payment_link_id is present but unsigned', async () => {
    const event = signedEvent('APPROVED');
    event.data.transaction.reference = orderReference;
    event.signature.properties = event.signature.properties.filter(
      (property: string) => property !== 'transaction.payment_link_id',
    );
    signEvent(event);
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: event }, res);

    expect(res.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(supabaseAdmin!.rpc).toHaveBeenNthCalledWith(
      1,
      'lookup_payment_link_session',
      { p_provider_session_id: paymentLinkId },
    );
    expect(supabaseAdmin!.rpc).toHaveBeenNthCalledWith(
      2,
      'process_verified_wompi_event_after_requote',
      expect.objectContaining({
        p_reference: orderReference,
        p_provider_transaction_reference: orderReference,
      }),
    );
  });

  it('rejects an absent official payment_link_id without correlating by reference', async () => {
    const event = signedEvent('APPROVED');
    event.data.transaction.reference = orderReference;
    delete event.data.transaction.payment_link_id;
    event.signature.properties = event.signature.properties.filter(
      (property: string) => property !== 'transaction.payment_link_id',
    );
    signEvent(event);
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: event }, res);

    expect(res.statusCode).toBe(422);
    expect(supabaseAdmin!.rpc).not.toHaveBeenCalled();
  });

  it('uses the official payment_link_id exactly for attempt lookup when the event link is unsigned', async () => {
    const event = signedEvent('APPROVED');
    event.data.transaction.payment_link_id = 'event-untrusted-link';
    event.signature.properties = event.signature.properties.filter(
      (property: string) => property !== 'transaction.payment_link_id',
    );
    signEvent(event);
    const officialLink = 'link_test_id-extra';
    queueOfficialTransaction({ payment_link_id: officialLink });
    const rpc = supabaseAdmin!.rpc as ReturnType<typeof vi.fn>;
    rpc.mockResolvedValueOnce({ data: { status: 'unmatched' }, error: null });
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: event }, res);

    expect(res.statusCode).toBe(422);
    expect(rpc).toHaveBeenCalledWith('lookup_payment_link_session', {
      p_provider_session_id: officialLink,
    });
    expect(rpc).not.toHaveBeenCalledWith('process_verified_wompi_event_after_requote', expect.anything());
  });

  it('treats a null lookup result as temporary lookup unavailability, not unmatched', async () => {
    const rpc = supabaseAdmin!.rpc as ReturnType<typeof vi.fn>;
    rpc.mockResolvedValueOnce({ data: null, error: null });
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: signedEvent('APPROVED') }, res);

    expect(res.statusCode).toBe(503);
    expect(rpc).not.toHaveBeenCalledWith('process_verified_wompi_event_after_requote', expect.anything());
  });

  it('uses the official payment_link_id when neither link nor reference is signed', async () => {
    const event = signedEvent('APPROVED');
    event.signature.properties = event.signature.properties.filter(
      (property: string) => property !== 'transaction.payment_link_id'
        && property !== 'transaction.reference',
    );
    signEvent(event);
    const res = makeResponse();
    const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await handler({ method: 'POST', headers: {}, body: event }, res);

    expect(res.statusCode).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(supabaseAdmin!.rpc).toHaveBeenNthCalledWith(
      1,
      'lookup_payment_link_session',
      { p_provider_session_id: paymentLinkId },
    );
    expect(warningSpy).not.toHaveBeenCalled();
    expect(JSON.parse(res.body).data.status).toBe('applied');
  });

  it('rejects an unsigned transaction ID before contacting Wompi', async () => {
    const event = signedEvent('APPROVED');
    event.signature.properties = event.signature.properties.filter(
      (property: string) => property !== 'transaction.id',
    );
    signEvent(event);
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: event }, res);

    expect(res.statusCode).toBe(422);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(supabaseAdmin!.rpc).not.toHaveBeenCalled();
  });

  it('rejects an unknown event status before contacting Wompi', async () => {
    const event = signedEvent('UNKNOWN');
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: event }, res);

    expect(res.statusCode).toBe(422);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(supabaseAdmin!.rpc).not.toHaveBeenCalled();
  });

  it('uses only the configured Sandbox host and private key for an ID GET', async () => {
    const event = signedEvent('APPROVED');
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: event }, res);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://sandbox.wompi.co/v1/transactions/sandbox-transaction-1');
    expect(options).toMatchObject({ method: 'GET', redirect: 'error' });
    expect(options.headers.Authorization).toBe('Bearer prv_test_unit_test');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(options.body).toBeUndefined();
  });

  it('rejects non-Sandbox configuration before contacting Wompi', async () => {
    vi.stubEnv('WOMPI_ENVIRONMENT', 'production');
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: signedEvent('APPROVED') }, res);

    expect(res.statusCode).toBe(503);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(supabaseAdmin!.rpc).not.toHaveBeenCalled();
  });

  it('rejects when the official transaction ID differs from the signed ID', async () => {
    const event = signedEvent('APPROVED');
    queueOfficialTransaction({ id: 'other-transaction' });
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: event }, res);

    expect(res.statusCode).toBe(422);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(supabaseAdmin!.rpc).not.toHaveBeenCalled();
  });

  it('rejects when a signed transaction ID does not match the official response ID', async () => {
    const event = signedEvent('APPROVED');
    queueOfficialTransaction({ id: 'sandbox-transaction-other' });
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: event }, res);

    expect(res.statusCode).toBe(422);
    expect(supabaseAdmin!.rpc).not.toHaveBeenCalled();
  });

  it('rejects an unknown official transaction status as an invalid provider response', async () => {
    const event = signedEvent('APPROVED');
    queueOfficialTransaction({ status: 'UNKNOWN' });
    const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: event }, res);

    expect(res.statusCode).toBe(422);
    expect(supabaseAdmin!.rpc).not.toHaveBeenCalled();
    expect(warningSpy).toHaveBeenCalledWith('wompi_webhook', expect.objectContaining({
      category: 'provider_response_invalid',
      retryable: false,
      http_status: 422,
    }));
  });

  it.each([
    ['null', null, 'payment_link_unavailable'],
    ['empty', '', 'payment_link_unavailable'],
    ['absent', undefined, 'payment_link_unavailable'],
    ['prefix-only match', 'link_test', 'payment_link_mismatch'],
    ['mismatched', 'different-link-id', 'payment_link_mismatch'],
  ])('rejects an official payment_link_id that is %s', async (_case, link, expectedCategory) => {
    const event = signedEvent('APPROVED');
    queueOfficialTransaction({ payment_link_id: link });
    const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: event }, res);

    expect(res.statusCode).toBe(422);
    expect(supabaseAdmin!.rpc).not.toHaveBeenCalled();
    expect(warningSpy).toHaveBeenCalledWith('wompi_webhook', expect.objectContaining({
      category: expectedCategory,
      retryable: false,
      http_status: 422,
    }));
  });

  it.each([
    ['signed status', { status: 'DECLINED' }, 'status_mismatch'],
    ['signed amount', { amount_in_cents: 11_999_900 }, 'amount_mismatch'],
    ['signed currency', { currency: 'USD' }, 'currency_mismatch'],
    ['signed reference', { reference: 'other-reference' }, 'signed_field_mismatch'],
  ])('rejects a mismatch in %s between event and official transaction', async (_case, overrides, category) => {
    const event = signedEvent('APPROVED');
    queueOfficialTransaction(overrides);
    const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: event }, res);

    expect(res.statusCode).toBe(422);
    expect(supabaseAdmin!.rpc).not.toHaveBeenCalled();
    expect(warningSpy).toHaveBeenCalledWith('wompi_webhook', expect.objectContaining({
      category,
      result: 'rejected',
      retryable: false,
      http_status: 422,
    }));
  });

  it('rejects an official amount that differs from the matched attempt', async () => {
    const event = signedEvent('APPROVED');
    const rpc = supabaseAdmin!.rpc as ReturnType<typeof vi.fn>;
    rpc.mockResolvedValueOnce({
      data: { ...matchedAttempt(orderReference), expected_amount: 119999 },
      error: null,
    });
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: event }, res);

    expect(res.statusCode).toBe(422);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['lookup_payment_link_session']);
    expect(rpc).not.toHaveBeenCalledWith('process_verified_wompi_event_after_requote', expect.anything());
  });

  it.each([
    ['network error', new Error('network')],
    ['timeout', Object.assign(new Error('timeout'), { name: 'AbortError' })],
  ])('treats a provider %s as retryable without calling the processor', async (_case, error) => {
    fetchMock.mockRejectedValueOnce(error);
    const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: signedEvent('APPROVED') }, res);

    expect(res.statusCode).toBe(503);
    expect(supabaseAdmin!.rpc).not.toHaveBeenCalled();
    expect([...warningSpy.mock.calls, ...errorSpy.mock.calls]).toContainEqual([
      'wompi_webhook', expect.objectContaining({
        category: 'provider_unavailable',
        retryable: true,
        http_status: 503,
      }),
    ]);
  });

  it.each([408, 429, 500, 503])('treats provider HTTP %s as retryable', async (status) => {
    fetchMock.mockResolvedValueOnce(new Response('ignored', { status }));
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: signedEvent('APPROVED') }, res);

    expect(res.statusCode).toBe(503);
    expect(supabaseAdmin!.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['invalid JSON', new Response('{', { status: 200 })],
    ['missing transaction data', new Response(JSON.stringify({ data: {} }), { status: 200 })],
  ])('rejects a provider response with %s', async (_case, response) => {
    fetchMock.mockResolvedValueOnce(response);
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: signedEvent('APPROVED') }, res);

    expect(res.statusCode).toBe(422);
    expect(supabaseAdmin!.rpc).not.toHaveBeenCalled();
  });

  it('does not process an unmatched payment-link lookup', async () => {
    const rpc = supabaseAdmin!.rpc as ReturnType<typeof vi.fn>;
    rpc.mockResolvedValueOnce({ data: { status: 'unmatched' }, error: null });
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: signedEvent('APPROVED') }, res);

    expect(res.statusCode).toBe(422);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['lookup_payment_link_session']);
  });

  it('does not process when the payment-link lookup RPC fails', async () => {
    const rpc = supabaseAdmin!.rpc as ReturnType<typeof vi.fn>;
    rpc.mockResolvedValueOnce({ data: null, error: { code: 'RPC_ERROR' } });
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: signedEvent('APPROVED') }, res);

    expect(res.statusCode).toBe(503);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['lookup_payment_link_session']);
  });

  it('classifies a thrown attempt lookup as retryable and does not invoke the processor', async () => {
    const rpc = supabaseAdmin!.rpc as ReturnType<typeof vi.fn>;
    rpc.mockRejectedValueOnce(new Error('database unavailable'));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: signedEvent('APPROVED') }, res);

    expect(res.statusCode).toBe(503);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual(['lookup_payment_link_session']);
    expect(errorSpy).toHaveBeenCalledWith('wompi_webhook', expect.objectContaining({
      category: 'attempt_lookup_unavailable',
      retryable: true,
      http_status: 503,
    }));
  });

  it('verifies the checksum using the supplied signature property order', async () => {
    const event = signedEvent('APPROVED');
    event.signature.properties.reverse();
    signEvent(event);
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: event }, res);

    expect(res.statusCode).toBe(200);
    expect(supabaseAdmin!.rpc).toHaveBeenNthCalledWith(
      2,
      'process_verified_wompi_event_after_requote',
      expect.objectContaining({ p_reference: orderReference }),
    );
  });

  it('passes signed external and internal references separately to the processor', async () => {
    const internalReference = 'sess_internal_attempt_reference';
    const providerReference = internalReference;
    const event = signedEvent('APPROVED');
    event.data.transaction.reference = providerReference;
    signEvent(event);
    const rpc = supabaseAdmin!.rpc as ReturnType<typeof vi.fn>;
    rpc.mockResolvedValueOnce({ data: matchedAttempt(internalReference), error: null });
    rpc.mockResolvedValueOnce({ data: 'applied', error: null });
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: event }, res);

    expect(res.statusCode).toBe(200);
    expect(rpc.mock.calls.filter(([name]) => name === 'process_verified_wompi_event_after_requote')).toHaveLength(1);
    const [, processorArguments] = rpc.mock.calls[1];
    expect(processorArguments).toMatchObject({
      p_event_fingerprint: expect.stringMatching(/^[0-9a-f]{64}$/),
      p_provider_event_id: null,
      p_reference: internalReference,
      p_transaction_id: 'sandbox-transaction-1',
      p_event_type: 'transaction.updated',
      p_provider_status: 'approved',
      p_amount: 120000,
      p_currency: 'COP',
      p_received_at: expect.stringMatching(/^202\d-/),
      p_provider_transaction_reference: providerReference,
    });
  });

  it('keeps events without an external reference compatible', async () => {
    const event = signedEvent('DECLINED');
    delete event.data.transaction.reference;
    event.signature.properties = event.signature.properties.filter(
      (property: string) => property !== 'transaction.reference',
    );
    signEvent(event);
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: event }, res);

    expect(res.statusCode).toBe(200);
    expect(supabaseAdmin!.rpc).toHaveBeenNthCalledWith(
      2,
      'process_verified_wompi_event_after_requote',
      expect.objectContaining({
        p_reference: orderReference,
        p_provider_transaction_reference: null,
      }),
    );
  });

  it.each(['expired', 'too far in the future'] as const)(
    'rejects a %s signed timestamp before any database call',
    async (_case) => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      const timestamp = _case === 'expired'
        ? nowSeconds - 48 * 60 * 60 - 1
        : nowSeconds + 10 * 60;
      const event = signedEvent('APPROVED');
      event.timestamp = timestamp;
      signEvent(event);
      const res = makeResponse();

      await handler({ method: 'POST', headers: {}, body: event }, res);

      expect(res.statusCode).toBe(400);
      expect(supabaseAdmin!.rpc).not.toHaveBeenCalled();
    },
  );

  it.each(['duplicate', 'stale', 'review_required'] as const)(
    'propagates the processor result for %s events unchanged',
    async (processingResult) => {
      const rpc = supabaseAdmin!.rpc as ReturnType<typeof vi.fn>;
      rpc.mockResolvedValueOnce({ data: matchedAttempt(orderReference), error: null });
      rpc.mockResolvedValueOnce({ data: processingResult, error: null });
      const res = makeResponse();

      await handler({ method: 'POST', headers: {}, body: signedEvent('APPROVED') }, res);

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.status).toBe(processingResult);
      expect(rpc.mock.calls.filter(([name]) => name === 'process_verified_wompi_event_after_requote')).toHaveLength(1);
      expect(rpc).toHaveBeenNthCalledWith(
        2,
        'process_verified_wompi_event_after_requote',
        expect.objectContaining({ p_reference: orderReference }),
      );
      expect(rpc.mock.calls.filter(([name]) => name === 'process_verified_wompi_event_after_requote')).toHaveLength(1);
    },
  );

  it('returns review_required for an approved old attempt without claiming another session', async () => {
    const rpc = supabaseAdmin!.rpc as ReturnType<typeof vi.fn>;
    rpc.mockResolvedValueOnce({ data: matchedAttempt(orderReference), error: null });
    rpc.mockResolvedValueOnce({ data: 'review_required', error: null });
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: signedEvent('APPROVED') }, res);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.status).toBe('review_required');
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      'process_verified_wompi_event_after_requote',
      expect.objectContaining({
        p_reference: orderReference,
        p_provider_status: 'approved',
        p_amount: 120000,
        p_currency: 'COP',
      }),
    );
    expect(rpc.mock.calls.some(([name]) => name === 'claim_payment_session')).toBe(false);
  });

  it('routes a late approval to review_required without claiming another session', async () => {
    const rpc = supabaseAdmin!.rpc as ReturnType<typeof vi.fn>;
    rpc.mockResolvedValueOnce({ data: matchedAttempt(orderReference), error: null });
    rpc.mockResolvedValueOnce({ data: 'review_required', error: null });
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: signedEvent('APPROVED') }, res);

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).data.status).toBe('review_required');
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      'process_verified_wompi_event_after_requote',
      expect.objectContaining({
        p_reference: orderReference,
        p_provider_status: 'approved',
        p_amount: 120000,
        p_currency: 'COP',
      }),
    );
    expect(rpc.mock.calls.some(([name]) => name === 'claim_payment_session')).toBe(false);
  });

  it('accepts a signed JSON request from the native Node HTTP stream', async () => {
    const req = Readable.from([JSON.stringify(signedEvent('APPROVED'))]) as any;
    req.method = 'POST';
    req.headers = {};
    const res = makeResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(supabaseAdmin!.rpc).toHaveBeenCalledWith(
      'process_verified_wompi_event_after_requote',
      expect.objectContaining({ p_provider_status: 'approved' }),
    );
  });

  it('rejects an event from the production environment in sandbox mode', async () => {
    const event = signedEvent('APPROVED');
    event.environment = 'prod';
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: event }, res);

    expect(res.statusCode).toBe(400);
    expect(supabaseAdmin!.rpc).not.toHaveBeenCalled();
  });

  it.each([
    ['signature missing', 'signature_missing'],
    ['signature invalid', 'signature_invalid'],
    ['transaction id unsigned', 'transaction_id_unsigned'],
    ['unknown event status', 'unknown_event_status'],
    ['wrong environment or event type', 'environment_or_type_invalid'],
    ['event outside the time window', 'event_outside_allowed_window'],
  ])('logs stable safe observability for %s', async (caseName, expectedReason) => {
    const event = signedEvent('APPROVED');
    event.data.transaction.id = 'TRANSACTION_ID_SENTINEL';
    event.data.transaction.reference = 'EXTERNAL_REFERENCE_SENTINEL';
    const headers = { 'x-vercel-id': 'req-test-observability-1' };

    if (caseName === 'signature missing') {
      delete event.signature;
    } else if (caseName === 'signature invalid') {
      event.signature.checksum = '0'.repeat(64);
    } else if (caseName === 'transaction id unsigned') {
      event.signature.properties = event.signature.properties.filter(
        (property: string) => property !== 'transaction.id',
      );
      signEvent(event);
    } else if (caseName === 'unknown event status') {
      event.data.transaction.status = 'UNKNOWN';
      signEvent(event);
    } else if (caseName === 'wrong environment or event type') {
      event.environment = 'prod';
      signEvent(event);
    } else {
      event.timestamp = Math.floor(Date.now() / 1000) - 48 * 60 * 60 - 1;
      signEvent(event);
    }

    const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const res = makeResponse();

    await handler({ method: 'POST', headers, body: event }, res);

    const logCall = [...warningSpy.mock.calls, ...infoSpy.mock.calls]
      .find(([eventName]) => eventName === 'wompi_webhook');
    expect(logCall?.[1]).toMatchObject({
      request_id: 'req-test-observability-1',
      category: expectedReason,
      result: 'rejected',
      retryable: false,
      http_status: res.statusCode,
    });
    const serializedLog = JSON.stringify(logCall);
    expect(serializedLog).not.toContain('TRANSACTION_ID_SENTINEL');
    expect(serializedLog).not.toContain('EXTERNAL_REFERENCE_SENTINEL');
    expect(serializedLog).not.toContain(eventsSecret);
    expect(serializedLog).not.toContain(event.signature?.checksum ?? 'CHECKSUM_SENTINEL');
    if (caseName === 'transaction id unsigned' || caseName === 'unknown event status') {
      expect(fetchMock).not.toHaveBeenCalled();
    }
  });

  it('logs successful signature validation and processing without event secrets or identifiers', async () => {
    const event = signedEvent('APPROVED');
    event.data.transaction.id = 'TRANSACTION_ID_SENTINEL';
    event.data.transaction.reference = 'EXTERNAL_REFERENCE_SENTINEL';
    signEvent(event);
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const res = makeResponse();

    await handler({
      method: 'POST',
      headers: { 'x-vercel-id': 'req-test-success-1' },
      body: event,
    }, res);

    const logCall = infoSpy.mock.calls.find(([eventName]) => eventName === 'wompi_webhook');
    expect(logCall?.[1]).toMatchObject({
      request_id: 'req-test-success-1',
      stage: 'processing',
      category: 'payment_event_processed',
      result: 'applied',
      retryable: false,
      http_status: 200,
    });
    const serializedLog = JSON.stringify(logCall);
    expect(serializedLog).not.toContain('TRANSACTION_ID_SENTINEL');
    expect(serializedLog).not.toContain('EXTERNAL_REFERENCE_SENTINEL');
    expect(serializedLog).not.toContain(eventsSecret);
    expect(serializedLog).not.toContain(event.signature.checksum);
  });
});