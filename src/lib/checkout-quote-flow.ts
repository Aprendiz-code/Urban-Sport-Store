import type { CheckoutRequest, Order, OrderAddressSnapshot, OrderRequestItem } from '../types/domain';
import type { PendingOrderRequoteResult, ShippingQuote, ShippingQuoteRequest } from './order-service';

export type { ShippingQuoteRequest } from './order-service';

export function getShippingQuoteRequestKey(
  request: ShippingQuoteRequest,
  addressId: string,
): string {
  return JSON.stringify({
    addressId,
    destinationCode: request.destinationCode,
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
  discountCop = 0,
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
    totalCop: validQuote ? validQuote.subtotalCop + validQuote.amountCop - discountCop : null,
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
  request: ShippingQuoteRequest;
  existingOrder?: Order | null;
  onOrderReady?: (order: Order) => void;
  confirmRequote?: boolean;
  confirmedTotal?: number;
  now?: number;
}

export interface CheckoutPaymentDependencies {
  createOrder: (request: CheckoutRequest) => Promise<Order>;
  requoteOrder: (input: {
    order: Order;
    quote: ShippingQuote;
    request: ShippingQuoteRequest;
    confirmedTotal: number;
  }) => Promise<PendingOrderRequoteResult>;
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
    input.existingOrder?.discountAmount ?? 0,
  );
  if (!summary.canContinue || !summary.quote) {
    throw new Error('Confirma una cotización de envío vigente antes de pagar.');
  }
  if (summary.quote.destination.code !== input.request.destinationCode) {
    throw new Error('El destino de la cotización no coincide con la solicitud actual.');
  }

  let order: Order;
  if (!input.existingOrder) {
    order = await dependencies.createOrder({
      shippingQuoteId: summary.quote.id,
      address: input.request.address,
      items: input.request.items,
    });
  } else if (input.existingOrder.shippingQuoteId === summary.quote.id) {
    order = input.existingOrder;
  } else {
    const proposal = {
      status: 'confirmation_required' as const,
      proposal: {
        previousTotal: input.existingOrder.total,
        subtotal: summary.subtotalCop,
        shipping: summary.shippingCop ?? 0,
        total: summary.totalCop ?? 0,
      },
    };
    if (!input.confirmRequote) return proposal;

    const result = await dependencies.requoteOrder({
      order: input.existingOrder,
      quote: summary.quote,
      request: input.request,
      confirmedTotal: input.confirmedTotal ?? summary.totalCop ?? 0,
    });
    if (result.status === 'confirmation_required') {
      return { status: 'confirmation_required' as const, proposal: result };
    }
    if (result.status === 'conflict') throw new Error(result.message);
    order = result.order;
    if (order.id !== input.existingOrder.id) {
      throw new Error('La re-cotización no conservó el pedido original.');
    }
  }
  if (order.total !== summary.totalCop) {
    throw new Error('El total del pedido no coincide con la cotización vigente.');
  }
  input.onOrderReady?.(order);
  const session = await dependencies.createPaymentSession(order.id);
  return { status: 'ready' as const, order, session };
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