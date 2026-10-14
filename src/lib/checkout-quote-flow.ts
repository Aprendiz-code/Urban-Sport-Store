import type { CheckoutRequest, Order, OrderAddressSnapshot, OrderRequestItem } from '../types/domain';
import type { ShippingQuote } from './order-service';

export interface ShippingQuoteRequest {
  address: OrderAddressSnapshot;
  items: OrderRequestItem[];
}

export function getShippingQuoteRequestKey(
  request: ShippingQuoteRequest,
  addressId: string,
): string {
  return JSON.stringify({
    addressId,
    address: request.address,
    items: [...request.items].sort((left, right) => left.productId.localeCompare(right.productId)),
  });
}

export function getCheckoutQuoteSummary(
  quote: ShippingQuote | null,
  quoteKey: string | null,
  currentQuoteKey: string | null,
  fallbackSubtotalCop: number,
  now = Date.now(),
) {
  const matchesCurrentRequest = Boolean(quote && quoteKey && quoteKey === currentQuoteKey);
  const quoteExpiry = quote ? Date.parse(quote.expiresAt) : Number.NaN;
  const isExpired = matchesCurrentRequest && (!Number.isFinite(quoteExpiry) || quoteExpiry <= now);
  const validQuote = matchesCurrentRequest && !isExpired ? quote : null;

  return {
    quote: matchesCurrentRequest ? quote : null,
    isExpired,
    canContinue: validQuote !== null,
    subtotalCop: validQuote?.subtotalCop ?? fallbackSubtotalCop,
    shippingCop: validQuote?.amountCop ?? null,
    totalCop: validQuote ? validQuote.subtotalCop + validQuote.amountCop : null,
  };
}

export function createLatestQuoteRequestTracker() {
  let latestRequestId = 0;
  return {
    begin() {
      latestRequestId += 1;
      return latestRequestId;
    },
    isCurrent(requestId: number) {
      return requestId === latestRequestId;
    },
    invalidate(requestId: number) {
      if (requestId === latestRequestId) latestRequestId += 1;
    },
  };
}

export interface CheckoutPaymentInput {
  quote: ShippingQuote | null;
  quoteKey: string | null;
  currentQuoteKey: string | null;
  address: OrderAddressSnapshot;
  items: OrderRequestItem[];
  existingOrder?: Order | null;
  now?: number;
}

export interface CheckoutPaymentDependencies {
  createOrder: (request: CheckoutRequest) => Promise<Order>;
  createPaymentSession: (orderId: string) => Promise<{ checkoutUrl: string; expiresAt: string }>;
}

export async function submitCheckoutPayment(
  input: CheckoutPaymentInput,
  dependencies: CheckoutPaymentDependencies,
) {
  const summary = getCheckoutQuoteSummary(
    input.quote,
    input.quoteKey,
    input.currentQuoteKey,
    0,
    input.now,
  );
  if (!summary.canContinue || !summary.quote) {
    throw new Error('Confirma una cotización de envío vigente antes de pagar.');
  }

  if (input.existingOrder && input.existingOrder.shippingQuoteId !== summary.quote.id) {
    throw new Error('El pedido pendiente corresponde a otra cotización. No se creará otro pedido.');
  }

  const order = input.existingOrder ?? await dependencies.createOrder({
    shippingQuoteId: summary.quote.id,
    address: input.address,
    items: input.items,
  });
  const session = await dependencies.createPaymentSession(order.id);
  return { order, session };
}

export function runSingleFlight<T>(
  lock: { current: Promise<T> | null },
  operation: () => Promise<T>,
): Promise<T> {
  if (lock.current) return lock.current;

  let current: Promise<T>;
  current = operation().finally(() => {
    if (lock.current === current) lock.current = null;
  });
  lock.current = current;
  return current;
}
