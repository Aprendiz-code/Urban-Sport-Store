import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { jsonError, jsonResponse } from './response.ts';
import { supabaseAdmin } from './supabase.ts';
import {
  getSupabaseRuntimeConfig,
  getWompiPaymentSessionsEnabled,
  getWompiReturnUrl,
  getWompiRuntimeConfig,
  isWompiPaymentSessionUserAllowed,
} from './runtime-config.ts';
import {
  authenticateOrderRequest,
  respondWithOrderError,
} from '../../api/orders.ts';
import {
  createUserOrderClient,
} from '../../api/orders.ts';
import { shippingQuoteRequestSchema } from '../../src/lib/commerce-validation.ts';

const orderUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const providerSessionIdPattern = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_PROVIDER_WAIT_MS = 12_000;

function checkoutUrlIsAllowed(value: unknown, expectedSessionId?: string): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;

  try {
    const url = new URL(value);
    const sessionId = url.pathname.match(/^\/l\/([A-Za-z0-9_-]{1,128})$/)?.[1];
    return url.origin === 'https://checkout.wompi.co'
      && !url.username
      && !url.password
      && !url.port
      && !url.search
      && !url.hash
      && sessionId !== undefined
      && (!expectedSessionId || sessionId === expectedSessionId);
  } catch {
    return false;
  }
}

function parseFutureExpiry(value: unknown): { iso: string; milliseconds: number } | null {
  if (typeof value !== 'string') return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds) || milliseconds <= Date.now()) return null;
  return { iso: new Date(milliseconds).toISOString(), milliseconds };
}

function getSafeProviderErrorCode(error: unknown): string {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === 'string' && /^[A-Z0-9_]{1,32}$/.test(code)
    ? code
    : 'SUPABASE_ERROR';
}

type WompiProviderErrorCategory =
  | 'credentials'
  | 'validation'
  | 'rate_limit'
  | 'provider_unavailable'
  | 'unknown';

function getSafeWompiProviderErrorCode(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const error = (payload as { error?: unknown }).error;
  if (!error || typeof error !== 'object') return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' && /^[A-Z0-9_]{1,32}$/.test(code)
    ? code
    : undefined;
}

function getSafeWompiProviderErrorDetails(payload: unknown) {
  const details = {
    provider_error_classes: [] as string[],
    provider_error_codes: [] as string[],
    provider_error_fields: [] as string[],
    provider_error_paths: [] as string[],
    provider_validation_types: [] as string[],
  };

  const sanitize = (value: unknown, isPath = false): string | undefined => {
    if (
      typeof value !== 'string'
      || value.length > 96
      || /[\s:"'{}[\]]/.test(value)
      || /https?:\/\/|@|\d{8,}/i.test(value)
      || (value.length >= 24 && /^[A-Za-z0-9_-]+$/.test(value))
    ) return undefined;

    const normalized = isPath
      ? value.replace(/\[\d+\]/g, '').replace(/[\\/]/g, '.').replace(/^\.+/, '')
      : value;
    return /^[A-Za-z][A-Za-z0-9_.-]{0,95}$/.test(normalized)
      ? normalized
      : undefined;
  };

  const add = (target: string[], value: unknown, isPath = false) => {
    const safeValue = sanitize(value, isPath);
    if (safeValue && !target.includes(safeValue) && target.length < 10) {
      target.push(safeValue);
    }
  };

  const visit = (value: unknown, depth = 0) => {
    if (!value || typeof value !== 'object' || depth > 6) return;
    const entries = Array.isArray(value)
      ? value.slice(0, 20).map((item) => ['', item] as const)
      : Object.entries(value);

    for (const [key, child] of entries) {
      const normalizedKey = key.toLowerCase();

      if (
        normalizedKey === 'messages'
        && child
        && typeof child === 'object'
        && !Array.isArray(child)
      ) {
        for (const fieldName of Object.keys(child).slice(0, 10)) {
          add(details.provider_error_fields, fieldName);
        }
      }

      if (typeof child === 'string') {
        if (['code', 'error_code'].includes(normalizedKey)) {
          add(details.provider_error_codes, child);
        } else if (['type', 'kind', 'class', 'category', 'error_type'].includes(normalizedKey)) {
          add(details.provider_error_classes, child);
        } else if (['field', 'field_name', 'param', 'parameter'].includes(normalizedKey)) {
          add(details.provider_error_fields, child);
        } else if (['path', 'pointer', 'json_path'].includes(normalizedKey)) {
          add(details.provider_error_paths, child, true);
        } else if (['validation_type', 'constraint', 'rule'].includes(normalizedKey)) {
          add(details.provider_validation_types, child);
        }
      }
      if (child && typeof child === 'object') visit(child, depth + 1);
    }
  };

  visit(payload);
  return details;
}

function categorizeWompiProviderError(status: number): WompiProviderErrorCategory {
  if (status === 401 || status === 403) return 'credentials';
  if (status === 429) return 'rate_limit';
  if (status === 408 || status >= 500) return 'provider_unavailable';
  if (status >= 400 && status < 500) return 'validation';
  return 'unknown';
}

function createPaymentUserOrderClient(token: string) {
  const config = getSupabaseRuntimeConfig();

  return createClient(config.url, config.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

async function completeClaim(
  attemptId: string,
  claimToken: string,
  outcome: 'ready' | 'retryable' | 'failed' | 'outcome_unknown',
  checkoutUrl: string | null = null,
  expiresAt: string | null = null,
  providerSessionId: string | null = null,
  providerSessionExpiresAt: string | null = null,
) {
  const { data, error } = await supabaseAdmin!.rpc(
    'complete_payment_session_with_provider_session',
    {
      p_attempt_id: attemptId,
      p_claim_token: claimToken,
      p_outcome: outcome,
      p_transaction_id: null,
      p_checkout_url: checkoutUrl,
      p_expires_at: expiresAt,
      p_provider_session_id: providerSessionId,
      p_provider_session_type: providerSessionId ? 'payment_link' : null,
      p_provider_session_expires_at: providerSessionExpiresAt,
    },
  );
  return { data, error };
}

function respondWithTemporaryPaymentError(res: any) {
  return jsonError(res, 503, 'No fue posible confirmar el inicio del pago. Intenta más tarde.');
}

export async function handlePaymentSession(req: any, res: any) {
  if (req.method !== 'POST') {
    return jsonError(res, 405, 'Método no permitido.');
  }
  if (!getWompiPaymentSessionsEnabled()) {
    return jsonError(res, 503, 'La creación de sesiones de pago está deshabilitada temporalmente.');
  }

  const user = await authenticateOrderRequest(req, res);
  if (!user) return;
  if (!isWompiPaymentSessionUserAllowed(user.id)) {
    return jsonError(res, 403, 'No autorizado para iniciar pagos.');
  }

  const orderId = req.query?.id;
  if (typeof orderId !== 'string' || !orderUuidPattern.test(orderId)) {
    return jsonError(res, 400, 'El identificador del pedido no es válido.');
  }
  if (!supabaseAdmin) {
    return jsonError(res, 503, 'El servicio de pedidos no está disponible.');
  }

  const userClient = createPaymentUserOrderClient(user.token);
  if (!userClient) {
    return jsonError(res, 503, 'El servicio de pedidos no está disponible.');
  }

  const { data: ownedOrder, error: ownershipError } = await userClient
    .from('orders')
    .select('id')
    .eq('id', orderId)
    .maybeSingle();

  if (ownershipError) {
    console.error('Payment-session ownership check failed', {
      code: getSafeProviderErrorCode(ownershipError),
    });
    return jsonError(res, 503, 'El servicio de pedidos no está disponible.');
  }
  if (!ownedOrder) {
    return jsonError(res, 404, 'Pedido no encontrado.');
  }

  const { data: order, error: orderError } = await supabaseAdmin
    .from('orders')
    .select('id,user_id,status,total,currency,expires_at,inventory_reservations(status,expires_at)')
    .eq('id', orderId)
    .maybeSingle();

  if (orderError) {
    return respondWithOrderError(res, 'Read order for payment session failed', orderError);
  }
  if (!order || order.user_id !== user.id) {
    return jsonError(res, 404, 'Pedido no encontrado.');
  }
  if (order.status !== 'pending_payment') {
    return jsonError(res, 409, 'El pedido ya no está pendiente de pago.');
  }

  const claimToken = randomUUID();
  const { data: claim, error: claimError } = await supabaseAdmin.rpc('claim_payment_session', {
    p_order_id: orderId,
    p_user_id: user.id,
    p_claim_token: claimToken,
  });

  if (claimError) {
    console.error('Claim payment session failed', { code: getSafeProviderErrorCode(claimError) });
    return respondWithTemporaryPaymentError(res);
  }
  if (!claim || typeof claim !== 'object' || typeof claim.status !== 'string') {
    console.error('Claim payment session returned an invalid result.');
    return respondWithTemporaryPaymentError(res);
  }

  if (claim.status === 'ready') {
    const expiry = parseFutureExpiry(claim.checkout_expires_at);
    if (!checkoutUrlIsAllowed(claim.checkout_url) || !expiry) {
      console.error('Persisted payment session failed response validation.');
      return respondWithTemporaryPaymentError(res);
    }
    return jsonResponse(res, {
      ok: true,
      data: { checkoutUrl: claim.checkout_url, expiresAt: expiry.iso },
    });
  }

  if (claim.status === 'in_progress') {
    return jsonResponse(res, { ok: true, data: { status: 'in_progress' } }, 202);
  }
  if (claim.status === 'outcome_unknown') {
    return respondWithTemporaryPaymentError(res);
  }
  if (claim.status === 'conflict') {
    return jsonError(res, 409, 'No es posible iniciar el pago para este pedido.');
  }
  if (claim.status !== 'claimed') {
    console.error('Claim payment session returned an unsupported status.');
    return respondWithTemporaryPaymentError(res);
  }

  const attemptId = claim.attempt_id;
  const rpcClaimToken = claim.claim_token;
  if (typeof attemptId !== 'string' || !uuidPattern.test(attemptId)) {
    console.error('Claimed payment session has an invalid attempt identifier.');
    return respondWithTemporaryPaymentError(res);
  }
  if (typeof rpcClaimToken !== 'string' || !uuidPattern.test(rpcClaimToken) || rpcClaimToken !== claimToken) {
    console.error('Claimed payment session has invalid claim identifiers.');
    const { error } = await completeClaim(attemptId, claimToken, 'retryable');
    if (error) {
      console.error('Release payment-session claim with invalid token failed', {
        code: getSafeProviderErrorCode(error),
      });
    }
    return respondWithTemporaryPaymentError(res);
  }

  const attemptReference = claim.reference;
  if (typeof attemptReference !== 'string' || !/^[A-Za-z0-9_-]{1,120}$/.test(attemptReference)) {
    console.error('Claimed payment session has an invalid attempt reference.');
    const { error } = await completeClaim(attemptId, rpcClaimToken, 'retryable');
    if (error) {
      console.error('Release payment-session claim with invalid reference failed', {
        code: getSafeProviderErrorCode(error),
      });
    }
    return respondWithTemporaryPaymentError(res);
  }

  const amount = Number(claim.expected_amount);
  const currency = claim.currency;
  if (
    !Number.isFinite(amount)
    || amount <= 0
    || !Number.isSafeInteger(Math.round(amount * 100))
    || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001
    || currency !== 'COP'
    || Number(order.total) !== amount
    || order.currency !== currency
  ) {
    console.error('Claimed payment session has invalid server-side payment details.');
    const { error } = await completeClaim(attemptId, rpcClaimToken, 'retryable');
    if (error) {
      console.error('Release invalid payment-session details failed', {
        code: getSafeProviderErrorCode(error),
      });
    }
    return respondWithTemporaryPaymentError(res);
  }

  const reservations = order.inventory_reservations;
  const orderExpiry = parseFutureExpiry(order.expires_at);
  if (!Array.isArray(reservations) || reservations.length === 0 || !orderExpiry || reservations.some((reservation: any) => reservation.status !== 'active')) {
    const { error } = await completeClaim(attemptId, rpcClaimToken, 'retryable');
    if (error) {
      console.error('Release invalid payment-session claim failed', {
        code: getSafeProviderErrorCode(error),
      });
      return respondWithTemporaryPaymentError(res);
    }
    return jsonError(res, 409, 'La reserva del pedido ya no está vigente.');
  }

  const reservationExpiries = reservations.map((reservation: any) => parseFutureExpiry(reservation.expires_at));
  if (reservationExpiries.some((expiry: ReturnType<typeof parseFutureExpiry>) => !expiry)) {
    const { error } = await completeClaim(attemptId, rpcClaimToken, 'retryable');
    if (error) {
      console.error('Release expired payment-session claim failed', {
        code: getSafeProviderErrorCode(error),
      });
      return respondWithTemporaryPaymentError(res);
    }
    return jsonError(res, 409, 'La reserva del pedido ya no está vigente.');
  }

  const earliestReservationExpiry = (reservationExpiries as Array<NonNullable<ReturnType<typeof parseFutureExpiry>>>).reduce(
    (earliest, expiry) => Math.min(earliest, expiry.milliseconds),
    Number.POSITIVE_INFINITY,
  );
  const providerExpiresAt = new Date(Math.min(orderExpiry.milliseconds, earliestReservationExpiry)).toISOString();
  let wompiConfig;
  try {
    wompiConfig = getWompiRuntimeConfig();
  } catch {
    const { error } = await completeClaim(attemptId, rpcClaimToken, 'retryable');
    if (error) {
      console.error('Release payment-session claim without Wompi config failed', {
        code: getSafeProviderErrorCode(error),
      });
    }
    return jsonError(res, 503, 'El servicio de pago no está configurado para el ambiente seleccionado.');
  }
  const redirectUrl = getWompiReturnUrl(wompiConfig);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MAX_PROVIDER_WAIT_MS);
  let providerResponse: Response;
  try {
    providerResponse = await fetch(`${wompiConfig.apiBaseUrl}/payment_links`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${wompiConfig.privateKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Pago de pedido',
        description: 'Pago de pedido Urban Sport Store',
        reference: attemptReference,
        single_use: true,
        collect_shipping: false,
        amount_in_cents: Math.round(amount * 100),
        currency,
        expires_at: providerExpiresAt,
        ...(redirectUrl ? { redirect_url: redirectUrl } : {}),
      }),
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timeout);
    const { error } = await completeClaim(attemptId, rpcClaimToken, 'outcome_unknown');
    if (error) {
      console.error('Persist ambiguous payment-link outcome failed', {
        code: getSafeProviderErrorCode(error),
      });
    }
    return respondWithTemporaryPaymentError(res);
  } finally {
    clearTimeout(timeout);
  }

  if (!providerResponse.ok) {
    let providerErrorCode: string | undefined;
    let providerErrorDetails: ReturnType<typeof getSafeWompiProviderErrorDetails> | undefined;
    try {
      const providerErrorPayload = await providerResponse.json();
      providerErrorCode = getSafeWompiProviderErrorCode(providerErrorPayload);
      providerErrorDetails = getSafeWompiProviderErrorDetails(providerErrorPayload);
    } catch {
      providerErrorCode = undefined;
      providerErrorDetails = undefined;
    }
    console.error('Wompi payment-link rejected', {
      provider_http_status: providerResponse.status,
      ...(providerErrorCode ? { provider_error_code: providerErrorCode } : {}),
      provider_error_category: categorizeWompiProviderError(providerResponse.status),
      ...(providerErrorDetails ?? {}),
    });

    const isDefinitiveRejection = providerResponse.status >= 400
      && providerResponse.status < 500
      && providerResponse.status !== 408
      && providerResponse.status !== 429;
    const { data, error } = await completeClaim(attemptId, rpcClaimToken, isDefinitiveRejection ? 'failed' : 'outcome_unknown');
    if (error || !data || typeof data !== 'object') {
      console.error('Complete rejected/ambiguous payment link failed', {
        code: getSafeProviderErrorCode(error),
      });
    }
    return jsonError(res, 502, 'Wompi no pudo iniciar el enlace de pago.');
  }

  let providerPayload: any;
  try {
    providerPayload = await providerResponse.json();
  } catch {
    const { error } = await completeClaim(attemptId, rpcClaimToken, 'outcome_unknown');
    if (error) {
      console.error('Persist invalid payment-link response failed', {
        code: getSafeProviderErrorCode(error),
      });
    }
    return jsonError(res, 502, 'Wompi devolvió una respuesta inválida.');
  }

  const providerSessionId = providerPayload?.data?.id;
  const providerUrl = providerPayload?.data?.url;
  const providerExpiry = parseFutureExpiry(providerPayload?.data?.expires_at);
  const validProviderSessionId = typeof providerSessionId === 'string' && providerSessionIdPattern.test(providerSessionId)
    ? providerSessionId
    : null;
  const safeProviderExpiry = providerExpiry && providerExpiry.milliseconds <= Date.parse(providerExpiresAt)
    ? providerExpiry
    : null;
  const checkoutUrl = validProviderSessionId
    ? checkoutUrlIsAllowed(providerUrl, validProviderSessionId)
      ? new URL(providerUrl).toString()
      : `https://checkout.wompi.co/l/${validProviderSessionId}`
    : null;

  if (!validProviderSessionId || !checkoutUrlIsAllowed(checkoutUrl, validProviderSessionId) || !safeProviderExpiry) {
    const { error } = await completeClaim(attemptId, rpcClaimToken, 'outcome_unknown', null, null, validProviderSessionId, providerExpiry?.iso ?? null);
    if (error) {
      console.error('Persist invalid payment-link metadata failed', {
        code: getSafeProviderErrorCode(error),
      });
    }
    return jsonError(res, 502, 'Wompi devolvió una respuesta inválida.');
  }

  const { data: completion, error: completionError } = await completeClaim(
    attemptId,
    rpcClaimToken,
    'ready',
    checkoutUrl,
    safeProviderExpiry.iso,
    validProviderSessionId,
    safeProviderExpiry.iso,
  );
  if (completionError || !completion || completion.status !== 'ready') {
    console.error('Persist payment-link session failed', {
      code: getSafeProviderErrorCode(completionError),
      status: typeof completion?.status === 'string' ? completion.status : 'INVALID_RESULT',
    });
    return respondWithTemporaryPaymentError(res);
  }

  const { data: lookup, error: lookupError } = await supabaseAdmin.rpc('lookup_payment_link_session', {
    p_provider_session_id: validProviderSessionId,
    p_expected_user_id: user.id,
    p_expected_order_id: orderId,
  });
  if (
    lookupError
    || !lookup
    || lookup.status !== 'matched'
    || lookup.attempt_id !== attemptId
    || lookup.user_id !== user.id
    || lookup.order_id !== orderId
    || lookup.session_state !== 'ready'
    || lookup.provider_session_type !== 'payment_link'
  ) {
    console.error('Persisted payment-link session lookup did not match its order.', {
      code: getSafeProviderErrorCode(lookupError),
    });
    return respondWithTemporaryPaymentError(res);
  }

  const persistedExpiry = parseFutureExpiry(completion.checkout_expires_at);
  if (!checkoutUrlIsAllowed(completion.checkout_url) || !persistedExpiry || persistedExpiry.milliseconds !== safeProviderExpiry.milliseconds) {
    console.error('Persisted payment-link session failed final response validation.');
    return respondWithTemporaryPaymentError(res);
  }

  return jsonResponse(res, {
    ok: true,
    data: {
      checkoutUrl: completion.checkout_url,
      expiresAt: persistedExpiry.iso,
    },
  });
}

const requoteOrderUuidPattern = orderUuidPattern;
const requoteRequestSchema = shippingQuoteRequestSchema.extend({
  shippingQuoteId: z.string().uuid(),
  confirmedTotal: z.number().finite().nonnegative(),
  expectedUpdatedAt: z.string().datetime(),
}).strict();

const conflictMessages: Record<string, string> = {
  attempt_not_terminal: 'Existe un intento activo o desconocido.',
  order_unavailable: 'El pedido ya no está disponible para re-cotizar.',
  payment_unavailable: 'El pago ya no está disponible para re-cotizar.',
  quote_unavailable: 'La cotización venció o no coincide con el pedido.',
  rate_changed: 'La tarifa cambió; solicita una cotización nueva.',
  rate_snapshot_changed: 'La tarifa cambió; solicita una cotización nueva.',
  cart_changed: 'El carrito del pedido cambió; vuelve a cotizar.',
  product_changed: 'Un producto cambió; vuelve a cotizar.',
  shipping_data_missing: 'Faltan datos logísticos del producto.',
  weight_band_changed: 'El peso ya no coincide con la tarifa.',
  inventory_unavailable: 'No hay inventario disponible para re-reservar.',
  reservation_consumed: 'La reserva ya fue consumida.',
  quote_stale: 'La cotización ya no coincide con los precios o condiciones actuales.',
};

async function parseRequoteBody(req: any): Promise<unknown> {
  if (req.body !== undefined) {
    if (typeof req.body !== 'string') return req.body;
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }

  if (typeof req?.[Symbol.asyncIterator] !== 'function') return null;
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += part.byteLength;
    if (size > 16384) throw new Error('BODY_TOO_LARGE');
    chunks.push(part);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    return null;
  }
}

export async function handleOrderRequote(req: any, res: any) {
  if (req.method !== 'POST') return jsonError(res, 405, 'Método no permitido.');
  const user = await authenticateOrderRequest(req, res);
  if (!user) return;
  const orderId = req.query?.id;
  if (typeof orderId !== 'string' || !requoteOrderUuidPattern.test(orderId)) {
    return jsonError(res, 400, 'El identificador del pedido no es válido.');
  }
  if (!supabaseAdmin) return jsonError(res, 503, 'El servicio de pedidos no está disponible.');

  let body: unknown;
  try {
    body = await parseRequoteBody(req);
  } catch (error: any) {
    return jsonError(res, error?.message === 'BODY_TOO_LARGE' ? 413 : 400, 'La solicitud no es válida.');
  }
  const parsed = requoteRequestSchema.safeParse(body);
  if (!parsed.success) return jsonError(res, 400, parsed.error.issues[0]?.message ?? 'La solicitud no es válida.');

  const { data, error } = await supabaseAdmin.rpc('confirm_pending_order_requote', {
    p_order_id: orderId,
    p_user_id: user.id,
    p_shipping_quote_id: parsed.data.shippingQuoteId,
    p_destination_code: parsed.data.destinationCode,
    p_address: parsed.data.address,
    p_items: [...parsed.data.items].sort((left, right) => left.productId.localeCompare(right.productId)),
    p_confirmed_total: parsed.data.confirmedTotal,
    p_expected_updated_at: parsed.data.expectedUpdatedAt,
  });
  if (error) return respondWithOrderError(res, 'Confirm pending order reprice failed', error);
  if (!data || typeof data !== 'object' || typeof (data as any).status !== 'string') {
    return jsonError(res, 503, 'No se confirmó el nuevo total.');
  }

  const result = data as Record<string, unknown>;
  if (result.status === 'confirmation_required') {
    return jsonResponse(res, {
      ok: false,
      error: { code: 'confirmation_required', message: 'El total cambió. Revisa y confirma el nuevo importe.' },
      data: {
        previousTotal: result.previous_total,
        subtotal: result.subtotal,
        shipping: result.shipping,
        total: result.total,
      },
    }, 409);
  }
  if (result.status === 'conflict') {
    const reason = typeof result.reason === 'string' ? result.reason : 'order_unavailable';
    return jsonResponse(res, {
      ok: false,
      error: { code: reason, message: conflictMessages[reason] ?? 'No se puede retomar el pedido.' },
    }, 409);
  }
  if (result.status !== 'updated' && result.status !== 'already_applied') {
    return jsonError(res, 409, 'No se puede retomar el pedido.');
  }

  return jsonResponse(res, {
    ok: true,
    data: {
      status: result.status,
      orderId,
      total: result.total,
      shippingQuoteId: result.shipping_quote_id ?? parsed.data.shippingQuoteId,
      expiresAt: result.expires_at,
      reservationExpiresAt: result.reservation_expires_at,
    },
  });
}
