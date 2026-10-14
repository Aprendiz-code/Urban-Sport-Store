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

afterEach(() => {
  vi.restoreAllMocks();
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

describe('Wompi transaction webhook', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv('WOMPI_ENVIRONMENT', 'sandbox');
    vi.stubEnv('WOMPI_EVENTS_SECRET', eventsSecret);
    (supabaseAdmin!.rpc as ReturnType<typeof vi.fn>).mockImplementation(async (name: string) => {
      if (name === 'lookup_payment_link_session') {
        return { data: { status: 'matched', reference: orderReference }, error: null };
      }
      if (name === 'lookup_payment_link_session_by_reference') {
        return { data: { status: 'matched', reference: orderReference }, error: null };
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
    rpc.mockResolvedValueOnce({
      data: { status: 'matched', reference: lookupReference },
      error: null,
    });
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
      ([name]) => name === 'process_verified_wompi_event',
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

  it('rejects an invalid checksum before any database call', async () => {
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
    expect(supabaseAdmin!.rpc).not.toHaveBeenCalled();
  });

  it('ignores a present but unsigned payment_link_id when the reference is signed', async () => {
    const payment = { status: 'pending' };
    const rpc = supabaseAdmin!.rpc as ReturnType<typeof vi.fn>;
    rpc.mockImplementation(async (name: string) => {
      if (name === 'process_verified_wompi_event') {
        payment.status = 'paid';
        return { data: 'applied', error: null };
      }
      return { data: { status: 'matched', reference: orderReference }, error: null };
    });
    const event = signedEvent('APPROVED');
    event.data.transaction.reference = orderReference;
    event.signature.properties = event.signature.properties.filter(
      (property: string) => property !== 'transaction.payment_link_id',
    );
    signEvent(event);
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: event }, res);

    expect(res.statusCode).toBe(200);
    expect(rpc).toHaveBeenNthCalledWith(
      1,
      'lookup_payment_link_session_by_reference',
      { p_internal_reference: orderReference },
    );
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      'process_verified_wompi_event',
      expect.objectContaining({
        p_reference: orderReference,
        p_provider_transaction_reference: orderReference,
      }),
    );
    expect(payment.status).toBe('paid');
  });

  it('correlates by signed transaction.reference when payment_link_id is absent', async () => {
    const event = signedEvent('APPROVED');
    event.data.transaction.reference = orderReference;
    delete event.data.transaction.payment_link_id;
    event.signature.properties = event.signature.properties.filter(
      (property: string) => property !== 'transaction.payment_link_id',
    );
    signEvent(event);
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: event }, res);

    expect(res.statusCode).toBe(200);
    expect(supabaseAdmin!.rpc).toHaveBeenNthCalledWith(
      1,
      'lookup_payment_link_session_by_reference',
      { p_internal_reference: orderReference },
    );
    expect(supabaseAdmin!.rpc).toHaveBeenNthCalledWith(
      2,
      'process_verified_wompi_event',
      expect.objectContaining({
        p_reference: orderReference,
        p_provider_transaction_reference: orderReference,
      }),
    );
  });

  it('rejects when neither correlation property is signed before any lookup', async () => {
    const event = signedEvent('APPROVED');
    event.signature.properties = event.signature.properties.filter(
      (property: string) => property !== 'transaction.payment_link_id'
        && property !== 'transaction.reference',
    );
    signEvent(event);
    const res = makeResponse();
    const warningSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    await handler({ method: 'POST', headers: {}, body: event }, res);

    expect(res.statusCode).toBe(422);
    expect(supabaseAdmin!.rpc).not.toHaveBeenCalled();
    expect(warningSpy).toHaveBeenCalledWith('wompi_webhook', expect.objectContaining({
      signature_validation: 'passed',
      stage: 'correlation',
      reason_code: 'correlation_reference_missing_or_unsigned',
      result: 'rejected',
      http_status: 422,
    }));
  });

  it('does not process an unmatched payment-link lookup', async () => {
    const rpc = supabaseAdmin!.rpc as ReturnType<typeof vi.fn>;
    rpc.mockResolvedValueOnce({ data: { status: 'unmatched' }, error: null });
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: signedEvent('APPROVED') }, res);

    expect(res.statusCode).toBe(503);
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

  it('verifies the checksum using the supplied signature property order', async () => {
    const event = signedEvent('APPROVED');
    event.signature.properties.reverse();
    signEvent(event);
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: event }, res);

    expect(res.statusCode).toBe(200);
    expect(supabaseAdmin!.rpc).toHaveBeenNthCalledWith(
      2,
      'process_verified_wompi_event',
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
    rpc.mockResolvedValueOnce({
      data: { status: 'matched', reference: internalReference },
      error: null,
    });
    rpc.mockResolvedValueOnce({ data: 'applied', error: null });
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: event }, res);

    expect(res.statusCode).toBe(200);
    expect(rpc).toHaveBeenNthCalledWith(
      2,
      'process_verified_wompi_event',
      expect.objectContaining({
        p_reference: internalReference,
        p_provider_transaction_reference: providerReference,
      }),
    );
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
      'process_verified_wompi_event',
      expect.objectContaining({
        p_reference: orderReference,
        p_provider_transaction_reference: null,
      }),
    );
  });

  it.each([
    ['expired', Math.floor(Date.now() / 1000) - 48 * 60 * 60 - 1],
    ['too far in the future', Math.floor(Date.now() / 1000) + 5 * 60 + 1],
  ] as const)('rejects a %s signed timestamp before any database call', async (_case, timestamp) => {
    const event = signedEvent('APPROVED');
    event.timestamp = timestamp;
    signEvent(event);
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: event }, res);

    expect(res.statusCode).toBe(400);
    expect(supabaseAdmin!.rpc).not.toHaveBeenCalled();
  });

  it.each(['duplicate', 'stale'] as const)(
    'preserves the processor result for %s events',
    async (processingResult) => {
      const rpc = supabaseAdmin!.rpc as ReturnType<typeof vi.fn>;
      rpc.mockResolvedValueOnce({
        data: { status: 'matched', reference: orderReference },
        error: null,
      });
      rpc.mockResolvedValueOnce({ data: processingResult, error: null });
      const res = makeResponse();

      await handler({ method: 'POST', headers: {}, body: signedEvent('APPROVED') }, res);

      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).data.status).toBe(processingResult);
      expect(rpc).toHaveBeenNthCalledWith(
        2,
        'process_verified_wompi_event',
        expect.objectContaining({ p_reference: orderReference }),
      );
    },
  );

  it('accepts a signed JSON request from the native Node HTTP stream', async () => {
    const req = Readable.from([JSON.stringify(signedEvent('APPROVED'))]) as any;
    req.method = 'POST';
    req.headers = {};
    const res = makeResponse();

    await handler(req, res);

    expect(res.statusCode).toBe(200);
    expect(supabaseAdmin!.rpc).toHaveBeenCalledWith(
      'process_verified_wompi_event',
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
    ['correlation properties missing or unsigned', 'correlation_reference_missing_or_unsigned'],
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
    } else if (caseName === 'correlation properties missing or unsigned') {
      event.signature.properties = event.signature.properties.filter(
        (property: string) => property !== 'transaction.payment_link_id'
          && property !== 'transaction.reference',
      );
      signEvent(event);
    } else if (caseName === 'wrong environment or event type') {
      event.environment = 'prod';
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
      reason_code: expectedReason,
      result: 'rejected',
      http_status: res.statusCode,
    });
    const serializedLog = JSON.stringify(logCall);
    expect(serializedLog).not.toContain('TRANSACTION_ID_SENTINEL');
    expect(serializedLog).not.toContain('EXTERNAL_REFERENCE_SENTINEL');
    expect(serializedLog).not.toContain(eventsSecret);
    expect(serializedLog).not.toContain(event.signature?.checksum ?? 'CHECKSUM_SENTINEL');
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
      signature_validation: 'passed',
      stage: 'processing',
      reason_code: 'payment_event_processed',
      result: 'applied',
      http_status: 200,
      event_type: 'transaction.updated',
    });
    const serializedLog = JSON.stringify(logCall);
    expect(serializedLog).not.toContain('TRANSACTION_ID_SENTINEL');
    expect(serializedLog).not.toContain('EXTERNAL_REFERENCE_SENTINEL');
    expect(serializedLog).not.toContain(eventsSecret);
    expect(serializedLog).not.toContain(event.signature.checksum);
  });
});