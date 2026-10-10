import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { jsonError, jsonResponse } from '../../../lib/api-helpers/response.ts';
import { supabaseAdmin } from '../../../lib/api-helpers/supabase.ts';
import {
  authenticateOrderRequest,
  respondWithOrderError,
} from '../../orders.js';

const orderUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const providerSessionIdPattern = /^[A-Za-z0-9_-]{1,128}$/;
const MAX_PROVIDER_WAIT_MS = 12_000;

interface WompiSandboxConfig {
  apiUrl: string;
  privateKey: string;
}

function getWompiSandboxConfig(): WompiSandboxConfig | null {
  const environment = process.env.WOMPI_ENVIRONMENT;
  const apiBaseUrl = process.env.WOMPI_API_BASE_URL;
  const publicKey = process.env.WOMPI_PUBLIC_KEY;
  const privateKey = process.env.WOMPI_PRIVATE_KEY;

  if (
    environment !== 'sandbox'
    || !apiBaseUrl
    || !publicKey?.startsWith('pub_test_')
    || !privateKey?.startsWith('prv_test_')
  ) {
    return null;
  }

  try {
    const parsed = new URL(apiBaseUrl);
    const pathname = parsed.pathname.replace(/\/+$/, '');
    if (
      parsed.protocol !== 'https:'
      || parsed.hostname !== 'sandbox.wompi.co'
      || parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
      || (pathname !== '' && pathname !== '/v1')
    ) {
      return null;
    }

    const apiRoot = pathname === '/v1'
      ? parsed.toString().replace(/\/+$/, '')
      : `${parsed.origin}/v1`;
    return { apiUrl: `${apiRoot}/payment_links`, privateKey };
  } catch {
    return null;
  }
}

function checkoutUrlIsAllowed(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 2048) return false;

  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'checkout.wompi.co'
      && !url.username
      && !url.password
      && !url.port
      && !url.search
      && !url.hash
      && url.pathname.startsWith('/l/');
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

function createUserOrderClient(token: string) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;

  return createClient(url, anonKey, {
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

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return jsonError(res, 405, 'Método no permitido.');
  }

  const user = await authenticateOrderRequest(req, res);
  if (!user) return;

  const orderId = req.query?.id;
  if (typeof orderId !== 'string' || !orderUuidPattern.test(orderId)) {
    return jsonError(res, 400, 'El identificador del pedido no es válido.');
  }
  if (!supabaseAdmin) {
    return jsonError(res, 503, 'El servicio de pedidos no está disponible.');
  }

  const userClient = createUserOrderClient(user.token);
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
  if (
    typeof attemptId !== 'string'
    || !uuidPattern.test(attemptId)
  ) {
    console.error('Claimed payment session has an invalid attempt identifier.');
    return respondWithTemporaryPaymentError(res);
  }
  if (
    typeof rpcClaimToken !== 'string'
    || !uuidPattern.test(rpcClaimToken)
    || rpcClaimToken !== claimToken
  ) {
    console.error('Claimed payment session has invalid claim identifiers.');
    const { error } = await completeClaim(attemptId, claimToken, 'retryable');
    if (error) {
      console.error('Release payment-session claim with invalid token failed', {
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
  if (
    !Array.isArray(reservations)
    || reservations.length === 0
    || !orderExpiry
    || reservations.some((reservation: any) => reservation.status !== 'active')
  ) {
    const { error } = await completeClaim(attemptId, rpcClaimToken, 'retryable');
    if (error) {
      console.error('Release invalid payment-session claim failed', {
        code: getSafeProviderErrorCode(error),
      });
      return respondWithTemporaryPaymentError(res);
    }
    return jsonError(res, 409, 'La reserva del pedido ya no está vigente.');
  }

  const reservationExpiries = reservations.map((reservation: any) =>
    parseFutureExpiry(reservation.expires_at));
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

  const earliestReservationExpiry = (
    reservationExpiries as Array<NonNullable<ReturnType<typeof parseFutureExpiry>>>
  ).reduce((earliest, expiry) => Math.min(earliest, expiry.milliseconds), Number.POSITIVE_INFINITY);
  const providerExpiresAt = new Date(
    Math.min(orderExpiry.milliseconds, earliestReservationExpiry),
  ).toISOString();

  const wompiConfig = getWompiSandboxConfig();
  if (!wompiConfig) {
    const { error } = await completeClaim(attemptId, rpcClaimToken, 'retryable');
    if (error) {
      console.error('Release payment-session claim without Sandbox config failed', {
        code: getSafeProviderErrorCode(error),
      });
    }
    return jsonError(res, 503, 'El servicio de pago Sandbox no está configurado.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), MAX_PROVIDER_WAIT_MS);
  let providerResponse: Response;
  try {
    providerResponse = await fetch(wompiConfig.apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${wompiConfig.privateKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Pago de pedido',
        description: 'Pago de pedido Urban Sport Store',
        single_use: true,
        collect_shipping: false,
        amount_in_cents: Math.round(amount * 100),
        currency,
        expires_at: providerExpiresAt,
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
    const isDefinitiveRejection = providerResponse.status >= 400
      && providerResponse.status < 500
      && providerResponse.status !== 408
      && providerResponse.status !== 429;
    const { data, error } = await completeClaim(
      attemptId,
      rpcClaimToken,
      isDefinitiveRejection ? 'failed' : 'outcome_unknown',
    );
    if (error || !data || typeof data !== 'object') {
      console.error('Complete rejected/ambiguous payment link failed', {
        code: getSafeProviderErrorCode(error),
      });
    }
    return jsonError(res, 502, 'Wompi Sandbox no pudo iniciar el enlace de pago.');
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
    return jsonError(res, 502, 'Wompi Sandbox devolvió una respuesta inválida.');
  }

  const providerSessionId = providerPayload?.data?.id;
  const providerUrl = providerPayload?.data?.url;
  const providerExpiry = parseFutureExpiry(providerPayload?.data?.expires_at);
  const validProviderSessionId = typeof providerSessionId === 'string'
    && providerSessionIdPattern.test(providerSessionId)
    ? providerSessionId
    : null;
  const safeProviderExpiry = providerExpiry
    && providerExpiry.milliseconds <= Date.parse(providerExpiresAt)
    ? providerExpiry
    : null;

  if (
    !validProviderSessionId
    || !checkoutUrlIsAllowed(providerUrl)
    || !safeProviderExpiry
  ) {
    const { error } = await completeClaim(
      attemptId,
      rpcClaimToken,
      'outcome_unknown',
      null,
      null,
      validProviderSessionId,
      providerExpiry?.iso ?? null,
    );
    if (error) {
      console.error('Persist invalid payment-link metadata failed', {
        code: getSafeProviderErrorCode(error),
      });
    }
    return jsonError(res, 502, 'Wompi Sandbox devolvió una respuesta inválida.');
  }

  const { data: completion, error: completionError } = await completeClaim(
    attemptId,
    rpcClaimToken,
    'ready',
    providerUrl,
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

  const { data: lookup, error: lookupError } = await supabaseAdmin.rpc(
    'lookup_payment_link_session',
    {
      p_provider_session_id: validProviderSessionId,
      p_expected_user_id: user.id,
      p_expected_order_id: orderId,
    },
  );
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
  if (
    !checkoutUrlIsAllowed(completion.checkout_url)
    || !persistedExpiry
    || persistedExpiry.milliseconds !== safeProviderExpiry.milliseconds
  ) {
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
