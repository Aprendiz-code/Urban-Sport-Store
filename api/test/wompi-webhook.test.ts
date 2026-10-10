import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/api-helpers/supabase.js', () => ({
  supabaseAdmin: { rpc: vi.fn() },
}));

import { supabaseAdmin } from '../../lib/api-helpers/supabase.js';
import handler from '../webhooks/wompi.js';

const eventsSecret = 'test-events-secret-only-for-unit-tests';
const orderReference = 'sess_test_reference';
const paymentLinkId = 'link_test_id';

function makeResponse() {
  return {
    statusCode: 200,
    headers: {} as Record<string, string>,
    body: '',
    setHeader(name: string, value: string) { this.headers[name] = value; },
    end(body: string) { this.body = body; },
  };
}

function signedEvent(status: string) {
  const event: any = {
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
      properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'],
      checksum: '',
    },
    timestamp: Math.floor(Date.now() / 1000),
  };
  const signedValues = event.signature.properties.map((path: string) =>
    path.split('.').reduce((value: any, part: string) => value[part], event.data));
  event.signature.checksum = createHash('sha256')
    .update(`${signedValues.join('')}${event.timestamp}${eventsSecret}`)
    .digest('hex');
  return event;
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
  ])('processes %s only after checksum verification', async (providerStatus, databaseStatus) => {
    const event = signedEvent(providerStatus);
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: event }, res);

    expect(res.statusCode).toBe(200);
    expect(supabaseAdmin!.rpc).toHaveBeenNthCalledWith(1, 'lookup_payment_link_session', {
      p_provider_session_id: paymentLinkId,
    });
    expect(supabaseAdmin!.rpc).toHaveBeenNthCalledWith(2, 'process_verified_wompi_event', expect.objectContaining({
      p_reference: orderReference,
      p_transaction_id: 'sandbox-transaction-1',
      p_provider_status: databaseStatus,
      p_amount: 120000,
      p_currency: 'COP',
    }));
    expect(JSON.parse(res.body).data.status).toBe('applied');
  });

  it('rejects an invalid checksum before any database call', async () => {
    const event = signedEvent('APPROVED');
    event.signature.checksum = '0'.repeat(64);
    const res = makeResponse();

    await handler({ method: 'POST', headers: {}, body: event }, res);

    expect(res.statusCode).toBe(401);
    expect(supabaseAdmin!.rpc).not.toHaveBeenCalled();
  });

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
});