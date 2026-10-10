import { createHash, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { jsonError, jsonResponse } from '../../lib/api-helpers/response.ts';

const MAX_WEBHOOK_BODY_BYTES = 65_536;
const MAX_EVENT_AGE_MS = 48 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const providerStatusMap: Record<string, string> = {
  APPROVED: 'approved',
  DECLINED: 'rejected',
  VOIDED: 'voided',
  ERROR: 'error',
  PENDING: 'pending',
};

function constantTimeChecksumEquals(expected: string, provided: unknown): boolean {
  if (typeof provided !== 'string' || !/^[0-9a-f]{64}$/i.test(provided)) return false;
  const expectedBytes = Buffer.from(expected, 'hex');
  const providedBytes = Buffer.from(provided, 'hex');
  return expectedBytes.length === providedBytes.length
    && timingSafeEqual(expectedBytes, providedBytes);
}

function resolveEventProperty(data: unknown, path: string): string | null {
  if (!/^transaction(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(path)) return null;
  let value: unknown = data;
  for (const part of path.split('.')) {
    if (!value || typeof value !== 'object' || !Object.hasOwn(value, part)) return null;
    value = (value as Record<string, unknown>)[part];
  }
  if (value === null) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

export function verifyWompiEventChecksum(
  event: any,
  secret: string,
  headerChecksum?: unknown,
): boolean {
  const properties = event?.signature?.properties;
  const checksum = event?.signature?.checksum ?? headerChecksum;
  const timestamp = event?.timestamp;
  if (
    !Array.isArray(properties)
    || properties.length < 1
    || properties.length > 32
    || properties.some((property: unknown) => typeof property !== 'string')
    || new Set(properties).size !== properties.length
    || !Number.isSafeInteger(timestamp)
    || timestamp <= 0
    || typeof secret !== 'string'
    || !secret
  ) return false;

  if (headerChecksum !== undefined && !constantTimeChecksumEquals(String(checksum), headerChecksum)) {
    return false;
  }

  const signatureValues = properties.map((property: string) => resolveEventProperty(event.data, property));
  if (signatureValues.some((value: string | null) => value === null)) return false;

  const signedContent = `${signatureValues.join('')}${timestamp}${secret}`;
  const expectedChecksum = createHash('sha256').update(signedContent, 'utf8').digest('hex');
  return constantTimeChecksumEquals(expectedChecksum, checksum);
}

async function readWebhookBody(req: any): Promise<unknown> {
  if (req?.body !== undefined) {
    if (typeof req.body !== 'string') {
      if (Buffer.byteLength(JSON.stringify(req.body) ?? '', 'utf8') > MAX_WEBHOOK_BODY_BYTES) {
        throw new RangeError();
      }
      return req.body;
    }
    if (Buffer.byteLength(req.body, 'utf8') > MAX_WEBHOOK_BODY_BYTES) throw new RangeError();
    return JSON.parse(req.body);
  }
  if (typeof req?.[Symbol.asyncIterator] !== 'function') return null;

  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.byteLength;
    if (size > MAX_WEBHOOK_BODY_BYTES) throw new RangeError();
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function getSingleHeader(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && value.length === 1 && typeof value[0] === 'string') return value[0];
  return undefined;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return jsonError(res, 405, 'Método no permitido.');
  if (process.env.WOMPI_ENVIRONMENT !== 'sandbox' || !process.env.WOMPI_EVENTS_SECRET) {
    return jsonError(res, 503, 'El webhook de Wompi Sandbox no está configurado.');
  }

  let event: any;
  try {
    event = await readWebhookBody(req);
  } catch (error) {
    return jsonError(res, error instanceof RangeError ? 413 : 400, 'El evento no es válido.');
  }

  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return jsonError(res, 400, 'El evento no es válido.');
  }
  if (event.environment !== 'test' || event.event !== 'transaction.updated') {
    return jsonError(res, 400, 'El tipo o ambiente del evento no es válido.');
  }

  const headerChecksum = getSingleHeader(req.headers?.['x-event-checksum']);
  if (req.headers?.['x-event-checksum'] !== undefined && !headerChecksum) {
    return jsonError(res, 401, 'La firma del evento no es válida.');
  }
  if (!verifyWompiEventChecksum(event, process.env.WOMPI_EVENTS_SECRET, headerChecksum)) {
    return jsonError(res, 401, 'La firma del evento no es válida.');
  }

  const timestampMilliseconds = event.timestamp * 1000;
  const age = Date.now() - timestampMilliseconds;
  if (age > MAX_EVENT_AGE_MS || age < -MAX_FUTURE_SKEW_MS) {
    return jsonError(res, 400, 'El evento está fuera de la ventana permitida.');
  }

  const transaction = event.data?.transaction;
  const status = typeof transaction?.status === 'string' && Object.hasOwn(providerStatusMap, transaction.status)
    ? providerStatusMap[transaction.status]
    : undefined;
  const amountInCents = transaction?.amount_in_cents;
  if (
    !status
    || typeof transaction?.id !== 'string'
    || !/^[A-Za-z0-9_-]{1,128}$/.test(transaction.id)
    || typeof transaction?.reference !== 'string'
    || !/^[A-Za-z0-9_-]{1,120}$/.test(transaction.reference)
    || transaction.currency !== 'COP'
    || !Number.isSafeInteger(amountInCents)
    || amountInCents < 0
    || amountInCents % 100 !== 0
  ) {
    return jsonError(res, 400, 'Los datos de la transacción no son válidos.');
  }

  const { supabaseAdmin } = await import('../../lib/api-helpers/supabase.ts');
  if (!supabaseAdmin) return jsonError(res, 503, 'El servicio de pagos no está disponible.');

  let reference = transaction.reference;
  if (transaction.payment_link_id !== null && transaction.payment_link_id !== undefined) {
    if (typeof transaction.payment_link_id !== 'string'
      || !/^[A-Za-z0-9_-]{1,128}$/.test(transaction.payment_link_id)) {
      return jsonError(res, 400, 'El enlace de pago no es válido.');
    }
    const { data: lookup, error: lookupError } = await supabaseAdmin.rpc(
      'lookup_payment_link_session',
      { p_provider_session_id: transaction.payment_link_id },
    );
    if (lookupError) return jsonError(res, 503, 'No se pudo correlacionar el pago.');
    if (!lookup || lookup.status !== 'matched' || typeof lookup.reference !== 'string') {
      return jsonError(res, 503, 'El enlace de pago todavía no está disponible.');
    }
    reference = lookup.reference;
  }

  const checksum = event.signature?.checksum ?? headerChecksum;
  const eventFingerprint = createHash('sha256')
    .update(`${event.event}:${event.timestamp}:${String(checksum).toLowerCase()}`)
    .digest('hex');
  const { data: result, error } = await supabaseAdmin.rpc('process_verified_wompi_event', {
    p_event_fingerprint: eventFingerprint,
    p_provider_event_id: null,
    p_reference: reference,
    p_transaction_id: transaction.id,
    p_event_type: event.event,
    p_provider_status: status,
    p_amount: amountInCents / 100,
    p_currency: transaction.currency,
    p_received_at: new Date().toISOString(),
  });

  if (error || !['applied', 'duplicate', 'stale', 'unmatched', 'review_required'].includes(result)) {
    return jsonError(res, 503, 'No se pudo procesar el evento de pago.');
  }
  return jsonResponse(res, { ok: true, data: { status: result } });
}