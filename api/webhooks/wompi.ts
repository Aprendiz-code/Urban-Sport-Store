import { createHash, timingSafeEqual } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { jsonError, jsonResponse } from '../../lib/api-helpers/response.ts';
import {
  getWompiEventsSecret,
  getWompiRuntimeConfig,
  type WompiRuntimeConfig,
} from '../../lib/api-helpers/runtime-config.ts';

const MAX_WEBHOOK_BODY_BYTES = 65_536;
const MAX_WOMPI_TRANSACTION_RESPONSE_BYTES = 65_536;
const WOMPI_TRANSACTION_LOOKUP_TIMEOUT_MS = 5_000;
const MAX_EVENT_AGE_MS = 48 * 60 * 60 * 1000;
const MAX_FUTURE_SKEW_MS = 5 * 60 * 1000;
const providerStatusMap: Record<string, string> = {
  APPROVED: 'approved',
  DECLINED: 'rejected',
  VOIDED: 'voided',
  ERROR: 'error',
  PENDING: 'pending',
};

export type CorrelationRejectCategory =
  | 'transaction_id_unsigned'
  | 'unknown_event_status'
  | 'provider_unavailable'
  | 'provider_response_invalid'
  | 'transaction_id_mismatch'
  | 'payment_link_unavailable'
  | 'payment_link_mismatch'
  | 'signed_field_mismatch'
  | 'attempt_unmatched'
  | 'attempt_lookup_unavailable'
  | 'amount_mismatch'
  | 'currency_mismatch'
  | 'status_mismatch';

export type CorrelationResult =
  | {
      kind: 'verified';
      category: 'signed_payment_link' | 'official_transaction_lookup';
      transactionId: string;
      internalReference: string;
      officialStatus: keyof typeof providerStatusMap;
      amountInCents: number;
      currency: 'COP';
      providerTransactionReference: string | null;
    }
  | {
      kind: 'rejected';
      category: CorrelationRejectCategory;
      retryable: boolean;
      httpStatus: 422 | 503;
    };

type AttemptLookup = {
  data?: {
    status?: unknown;
    reference?: unknown;
    expected_amount?: unknown;
    currency?: unknown;
    transaction_id?: unknown;
  } | null;
  error?: unknown;
};

type OfficialTransaction = {
  id?: unknown;
  status?: unknown;
  amount_in_cents?: unknown;
  currency?: unknown;
  payment_link_id?: unknown;
  reference?: unknown;
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

function getSafeRequestId(req: any): string {
  const candidates = [req.headers?.['x-vercel-id'], req.headers?.['x-request-id']];
  for (const candidate of candidates) {
    const value = getSingleHeader(candidate);
    if (value && value.length <= 128 && /^[A-Za-z0-9:._-]+$/.test(value)) return value;
  }
  return 'unavailable';
}

function logWebhookResult(
  req: any,
  stage: string,
  category: string,
  result: string,
  httpStatus: number,
  retryable: boolean,
) {
  const entry = {
    request_id: getSafeRequestId(req),
    stage,
    category,
    result,
    retryable,
    http_status: httpStatus,
  };

  if (httpStatus >= 500) console.error('wompi_webhook', entry);
  else if (httpStatus >= 400) console.warn('wompi_webhook', entry);
  else console.info('wompi_webhook', entry);
}

function rejectWebhook(
  req: any,
  res: any,
  httpStatus: number,
  message: string,
  stage: string,
  category: string,
  retryable = httpStatus >= 500,
) {
  logWebhookResult(
    req,
    stage,
    category,
    'rejected',
    httpStatus,
    retryable,
  );
  return jsonError(res, httpStatus, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function rejectedCorrelation(
  category: CorrelationRejectCategory,
  retryable = false,
): CorrelationResult {
  return {
    kind: 'rejected',
    category,
    retryable,
    httpStatus: retryable ? 503 : 422,
  };
}

export async function correlateWompiTransaction(input: {
  eventTransaction: Record<string, unknown>;
  signatureProperties: string[];
  config: WompiRuntimeConfig;
  lookupAttempt: (paymentLinkId: string) => Promise<AttemptLookup>;
  fetchImpl?: typeof fetch;
}): Promise<CorrelationResult> {
  const { eventTransaction, signatureProperties, config, lookupAttempt } = input;
  const transactionId = eventTransaction.id;
  if (!signatureProperties.includes('transaction.id')) {
    return rejectedCorrelation('transaction_id_unsigned');
  }
  if (typeof transactionId !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(transactionId)) {
    return rejectedCorrelation('transaction_id_mismatch');
  }

  const eventStatus = eventTransaction.status;
  if (typeof eventStatus !== 'string' || !Object.hasOwn(providerStatusMap, eventStatus)) {
    return rejectedCorrelation('unknown_event_status');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WOMPI_TRANSACTION_LOOKUP_TIMEOUT_MS);
  let response: Response;
  let responseText: string;
  try {
    response = await (input.fetchImpl ?? fetch)(
      `${config.apiBaseUrl}/transactions/${encodeURIComponent(transactionId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${config.privateKey}`,
          Accept: 'application/json',
        },
        redirect: 'error',
        signal: controller.signal,
      },
    );
    if (response.status >= 500 || response.status === 408 || response.status === 429) {
      return rejectedCorrelation('provider_unavailable', true);
    }
    if (!response.ok) return rejectedCorrelation('provider_response_invalid');
    responseText = await response.text();
  } catch {
    return rejectedCorrelation('provider_unavailable', true);
  } finally {
    clearTimeout(timeout);
  }

  if (Buffer.byteLength(responseText, 'utf8') > MAX_WOMPI_TRANSACTION_RESPONSE_BYTES) {
    return rejectedCorrelation('provider_response_invalid');
  }

  let responsePayload: unknown;
  try {
    responsePayload = JSON.parse(responseText);
  } catch {
    return rejectedCorrelation('provider_response_invalid');
  }
  const official = isRecord(responsePayload) && isRecord(responsePayload.data)
    ? responsePayload.data as OfficialTransaction
    : null;
  if (!official) return rejectedCorrelation('provider_response_invalid');
  if (official.id !== transactionId) return rejectedCorrelation('transaction_id_mismatch');

  if (typeof official.payment_link_id !== 'string'
    || !/^[A-Za-z0-9_-]{1,128}$/.test(official.payment_link_id)) {
    return rejectedCorrelation('payment_link_unavailable');
  }
  if (typeof official.status !== 'string' || !Object.hasOwn(providerStatusMap, official.status)) {
    return rejectedCorrelation('provider_response_invalid');
  }
  if (!Number.isSafeInteger(official.amount_in_cents) || Number(official.amount_in_cents) < 0) {
    return rejectedCorrelation('amount_mismatch');
  }
  if (typeof official.currency !== 'string' || official.currency !== 'COP') {
    return rejectedCorrelation('currency_mismatch');
  }

  const signedComparisons: Array<{
    property: string;
    eventValue: unknown;
    officialValue: unknown;
    mismatch: CorrelationRejectCategory;
  }> = [
    {
      property: 'transaction.id',
      eventValue: eventTransaction.id,
      officialValue: official.id,
      mismatch: 'transaction_id_mismatch',
    },
    {
      property: 'transaction.status',
      eventValue: eventTransaction.status,
      officialValue: official.status,
      mismatch: 'status_mismatch',
    },
    {
      property: 'transaction.amount_in_cents',
      eventValue: eventTransaction.amount_in_cents,
      officialValue: official.amount_in_cents,
      mismatch: 'amount_mismatch',
    },
    {
      property: 'transaction.currency',
      eventValue: eventTransaction.currency,
      officialValue: official.currency,
      mismatch: 'currency_mismatch',
    },
    {
      property: 'transaction.payment_link_id',
      eventValue: eventTransaction.payment_link_id,
      officialValue: official.payment_link_id,
      mismatch: 'payment_link_mismatch',
    },
    {
      property: 'transaction.reference',
      eventValue: eventTransaction.reference,
      officialValue: official.reference,
      mismatch: 'signed_field_mismatch',
    },
  ];
  for (const comparison of signedComparisons) {
    if (signatureProperties.includes(comparison.property)
      && comparison.eventValue !== comparison.officialValue) {
      return rejectedCorrelation(comparison.mismatch);
    }
  }

  let lookup: AttemptLookup;
  try {
    lookup = await lookupAttempt(official.payment_link_id);
  } catch {
    return rejectedCorrelation('attempt_lookup_unavailable', true);
  }
  if (!lookup || !isRecord(lookup)) return rejectedCorrelation('attempt_lookup_unavailable', true);
  if (lookup.error) return rejectedCorrelation('attempt_lookup_unavailable', true);
  if (!lookup.data || !isRecord(lookup.data)) {
    return rejectedCorrelation('attempt_lookup_unavailable', true);
  }
  if (lookup.data.status === 'unmatched') {
    return rejectedCorrelation('attempt_unmatched');
  }
  if (lookup.data.status !== 'matched') return rejectedCorrelation('attempt_lookup_unavailable', true);
  if (typeof lookup.data.reference !== 'string'
    || !/^[A-Za-z0-9_-]{1,120}$/.test(lookup.data.reference)) {
    return rejectedCorrelation('attempt_lookup_unavailable', true);
  }
  if (typeof lookup.data.expected_amount !== 'number'
    && typeof lookup.data.expected_amount !== 'string') {
    return rejectedCorrelation('attempt_lookup_unavailable', true);
  }
  const expectedAmount = Number(lookup.data.expected_amount);
  if (!Number.isFinite(expectedAmount)
    || !Number.isSafeInteger(Math.round(expectedAmount * 100))
    || Math.abs(expectedAmount * 100 - Math.round(expectedAmount * 100)) > 0.000001
    || Math.round(expectedAmount * 100) !== official.amount_in_cents) {
    return rejectedCorrelation('amount_mismatch');
  }
  if (lookup.data.currency !== official.currency) return rejectedCorrelation('currency_mismatch');
  if (lookup.data.transaction_id != null && lookup.data.transaction_id !== transactionId) {
    return rejectedCorrelation('transaction_id_mismatch');
  }

  const providerReference = typeof official.reference === 'string'
    && /^[A-Za-z0-9_-]{1,120}$/.test(official.reference)
    ? official.reference
    : null;
  return {
    kind: 'verified',
    category: signatureProperties.includes('transaction.payment_link_id')
      ? 'signed_payment_link'
      : 'official_transaction_lookup',
    transactionId,
    internalReference: lookup.data.reference,
    officialStatus: official.status as keyof typeof providerStatusMap,
    amountInCents: official.amount_in_cents,
    currency: 'COP',
    providerTransactionReference: providerReference,
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return rejectWebhook(req, res, 405, 'Método no permitido.', 'request', 'method_not_allowed');
  }
  let wompiConfig: WompiRuntimeConfig;
  let eventSecret: string;
  try {
    wompiConfig = getWompiRuntimeConfig();
    eventSecret = getWompiEventsSecret(wompiConfig.mode);
  } catch {
    return rejectWebhook(
      req,
      res,
      503,
      'El webhook de Wompi no está configurado para el ambiente seleccionado.',
      'configuration',
      'wompi_webhook_not_configured',
    );
  }

  let event: any;
  try {
    event = await readWebhookBody(req);
  } catch (error) {
    const oversized = error instanceof RangeError;
    return rejectWebhook(
      req,
      res,
      oversized ? 413 : 400,
      'El evento no es válido.',
      'body',
      oversized ? 'body_too_large' : 'invalid_json_body',
    );
  }

  if (!event || typeof event !== 'object' || Array.isArray(event)) {
    return rejectWebhook(req, res, 400, 'El evento no es válido.', 'event', 'invalid_event_shape');
  }
  const headerChecksum = getSingleHeader(req.headers?.['x-event-checksum']);
  if (req.headers?.['x-event-checksum'] !== undefined && !headerChecksum) {
    return rejectWebhook(req, res, 401, 'La firma del evento no es válida.', 'signature', 'signature_invalid');
  }
  const signatureProperties = event.signature?.properties;
  const checksum = event.signature?.checksum ?? headerChecksum;
  if (!Array.isArray(signatureProperties) || signatureProperties.length === 0
    || typeof checksum !== 'string' || checksum.length === 0) {
    return rejectWebhook(req, res, 401, 'La firma del evento no es válida.', 'signature', 'signature_missing');
  }
  if (!verifyWompiEventChecksum(event, eventSecret, headerChecksum)) {
    return rejectWebhook(req, res, 401, 'La firma del evento no es válida.', 'signature', 'signature_invalid');
  }

  const transaction = event.data?.transaction;
  if (!signatureProperties.includes('transaction.id')) {
    return rejectWebhook(req, res, 422, 'No se pudo correlacionar el pago.', 'correlation', 'transaction_id_unsigned', false);
  }

  if (event.environment !== wompiConfig.eventEnvironment || event.event !== 'transaction.updated') {
    return rejectWebhook(
      req,
      res,
      400,
      'El tipo o ambiente del evento no es válido para la configuración seleccionada.',
      'event',
      'environment_or_type_invalid',
      false,
    );
  }
  if (typeof transaction?.status !== 'string' || !Object.hasOwn(providerStatusMap, transaction.status)) {
    return rejectWebhook(
      req,
      res,
      422,
      'El estado del evento no es válido.',
      'correlation',
      'unknown_event_status',
      false,
    );
  }

  const timestampMilliseconds = event.timestamp * 1000;
  const age = Date.now() - timestampMilliseconds;
  if (age > MAX_EVENT_AGE_MS || age < -MAX_FUTURE_SKEW_MS) {
    return rejectWebhook(
      req,
      res,
      400,
      'El evento está fuera de la ventana permitida.',
      'event_window',
      'event_outside_allowed_window',
      false,
    );
  }

  if (typeof transaction?.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(transaction.id)) {
    return rejectWebhook(
      req,
      res,
      400,
      'Los datos de la transacción no son válidos.',
      'transaction',
      'transaction_fields_invalid',
      false,
    );
  }

  const { supabaseAdmin } = await import('../../lib/api-helpers/supabase.ts');
  if (!supabaseAdmin) {
    return rejectWebhook(
      req,
      res,
      503,
      'El servicio de pagos no está disponible.',
      'configuration',
      'payment_database_unavailable',
      true,
    );
  }

  const correlation = await correlateWompiTransaction({
    eventTransaction: transaction,
    signatureProperties,
    config: wompiConfig,
    lookupAttempt: (paymentLinkId) => supabaseAdmin.rpc('lookup_payment_link_session', {
      p_provider_session_id: paymentLinkId,
    }),
  });
  if (correlation.kind === 'rejected') {
    return rejectWebhook(
      req,
      res,
      correlation.httpStatus,
      'No se pudo correlacionar el pago.',
      'correlation',
      correlation.category,
      correlation.retryable,
    );
  }

  const eventFingerprint = createHash('sha256')
    .update(`${event.event}:${event.timestamp}:${String(checksum).toLowerCase()}`)
    .digest('hex');
  const { data: result, error } = await supabaseAdmin.rpc('process_verified_wompi_event_after_requote', {
    p_event_fingerprint: eventFingerprint,
    p_provider_event_id: null,
    p_reference: correlation.internalReference,
    p_transaction_id: correlation.transactionId,
    p_event_type: event.event,
    p_provider_status: providerStatusMap[correlation.officialStatus],
    p_amount: correlation.amountInCents / 100,
    p_currency: correlation.currency,
    p_received_at: new Date().toISOString(),
    p_provider_transaction_reference: correlation.providerTransactionReference,
  });

  if (error || !['applied', 'duplicate', 'stale', 'review_required'].includes(result)) {
    return rejectWebhook(
      req,
      res,
      503,
      'No se pudo procesar el evento de pago.',
      'processing',
      'payment_event_processing_failed',
      true,
    );
  }
  logWebhookResult(req, 'processing', 'payment_event_processed', result, 200, false);
  return jsonResponse(res, { ok: true, data: { status: result } });
}