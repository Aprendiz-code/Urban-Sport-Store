import { describe, expect, it, vi } from 'vitest';
import {
  createLatestQuoteRequestTracker,
  getCheckoutQuoteSummary,
  getShippingQuoteRequestKey,
  runSingleFlight,
  submitCheckoutPayment,
  type ShippingQuoteRequest,
} from '../checkout-quote-flow';
import type { ShippingQuote } from '../order-service';
import type { Order } from '../../types/domain';

const request: ShippingQuoteRequest = {
  address: {
    recipientName: 'Persona sintética',
    addressLine1: 'Calle 1 #2-3',
    city: 'Bogotá',
    state: 'Cundinamarca',
    postalCode: '110111',
    country: 'CO',
    phone: '+57 300 000 0000',
  },
  items: [{ productId: '11111111-1111-4111-8111-111111111111', quantity: 1 }],
};

const quote: ShippingQuote = {
  id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  provider: 'coordinadora',
  currency: 'COP',
  amountCop: 9010,
  subtotalCop: 1000,
  coverage: { covered: true, originCode: '11001000', destinationCode: '11001000' },
  estimatedDelivery: { minBusinessDays: 1, maxBusinessDays: 1 },
  expiresAt: '2026-10-14T02:00:00.000Z',
};

const order = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  orderNumber: 'ORD-TEST-1',
  userId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  email: 'buyer@example.test',
  customerName: 'Persona sintética',
  status: 'pending_payment',
  paymentStatus: 'pending',
  shipmentStatus: 'pending',
  currency: 'COP',
  subtotal: 1000,
  discountAmount: 0,
  shippingAmount: 9010,
  total: 10010,
  shippingAddress: request.address,
  items: [],
  shippingQuoteId: quote.id,
  createdAt: '2026-10-14T01:30:00.000Z',
  updatedAt: '2026-10-14T01:30:00.000Z',
} satisfies Order;

function makeDependencies() {
  return {
    createOrder: vi.fn(async () => order),
    createPaymentSession: vi.fn(async () => ({
      checkoutUrl: 'https://checkout.wompi.co/l/sandbox-link',
      expiresAt: '2026-10-14T02:00:00.000Z',
    })),
  };
}

describe('checkout quote flow', () => {
  it('uses the backend quote for displayed totals and permits continuing while current', () => {
    const key = getShippingQuoteRequestKey(request, 'address-1');
    const summary = getCheckoutQuoteSummary(quote, key, key, 777, Date.parse('2026-10-14T01:30:00.000Z'));

    expect(summary).toMatchObject({
      canContinue: true,
      subtotalCop: 1000,
      shippingCop: 9010,
      totalCop: 10010,
      quote,
    });
  });

  it.each([
    ['absent', null, '2026-10-14T01:30:00.000Z'],
    ['failed', null, '2026-10-14T01:30:00.000Z'],
    ['expired', quote, '2026-10-14T02:00:00.001Z'],
  ] as const)('does not create an order or session when the quote is %s', async (_state, currentQuote, now) => {
    const key = getShippingQuoteRequestKey(request, 'address-1');
    const dependencies = makeDependencies();

    await expect(submitCheckoutPayment({
      quote: currentQuote,
      quoteKey: currentQuote ? key : null,
      currentQuoteKey: key,
      address: request.address,
      items: request.items,
      now: Date.parse(now),
    }, dependencies)).rejects.toThrow('Confirma una cotización de envío vigente antes de pagar.');

    expect(dependencies.createOrder).not.toHaveBeenCalled();
    expect(dependencies.createPaymentSession).not.toHaveBeenCalled();
  });

  it('invalidates the quote when the address or item quantity changes', () => {
    const quoteKey = getShippingQuoteRequestKey(request, 'address-1');
    const changedAddressKey = getShippingQuoteRequestKey({
      ...request,
      address: { ...request.address, addressLine1: 'Otra dirección 4-5' },
    }, 'address-1');
    const changedQuantityKey = getShippingQuoteRequestKey({
      ...request,
      items: [{ ...request.items[0], quantity: 2 }],
    }, 'address-1');
    const changedProductKey = getShippingQuoteRequestKey({
      ...request,
      items: [{ productId: '22222222-2222-4222-8222-222222222222', quantity: 1 }],
    }, 'address-1');
    const selectedAddressKey = getShippingQuoteRequestKey(request, 'address-2');

    expect(getCheckoutQuoteSummary(quote, quoteKey, changedAddressKey, 1000).canContinue).toBe(false);
    expect(getCheckoutQuoteSummary(quote, quoteKey, changedQuantityKey, 1000).canContinue).toBe(false);
    expect(getCheckoutQuoteSummary(quote, quoteKey, changedProductKey, 1000).canContinue).toBe(false);
    expect(getCheckoutQuoteSummary(quote, quoteKey, selectedAddressKey, 1000).canContinue).toBe(false);
  });

  it('ignores an older quote response after a newer request begins', async () => {
    const tracker = createLatestQuoteRequestTracker();
    const olderRequestId = tracker.begin();
    let resolveOlder!: (value: string) => void;
    const olderResponse = new Promise<string>((resolve) => { resolveOlder = resolve; });
    const applied: string[] = [];
    const applyWhenCurrent = async (requestId: number, response: Promise<string>) => {
      const value = await response;
      if (tracker.isCurrent(requestId)) applied.push(value);
    };
    const olderApply = applyWhenCurrent(olderRequestId, olderResponse);

    const currentRequestId = tracker.begin();
    await applyWhenCurrent(currentRequestId, Promise.resolve('current quote'));
    resolveOlder('stale quote');
    await olderApply;

    expect(applied).toEqual(['current quote']);
  });

  it('passes exactly the current quote id to order creation before creating a session', async () => {
    const key = getShippingQuoteRequestKey(request, 'address-1');
    const dependencies = makeDependencies();

    await submitCheckoutPayment({
      quote,
      quoteKey: key,
      currentQuoteKey: key,
      address: request.address,
      items: request.items,
      now: Date.parse('2026-10-14T01:30:00.000Z'),
    }, dependencies);

    expect(dependencies.createOrder).toHaveBeenCalledWith({
      shippingQuoteId: quote.id,
      address: request.address,
      items: request.items,
    });
    expect(dependencies.createPaymentSession).toHaveBeenCalledWith(order.id);
  });

  it('creates one order and one payment session on a double click', async () => {
    const key = getShippingQuoteRequestKey(request, 'address-1');
    const lock: { current: Promise<unknown> | null } = { current: null };
    const dependencies = makeDependencies();
    let finishOrder!: (value: Order) => void;
    dependencies.createOrder = vi.fn(() => new Promise<Order>((resolve) => { finishOrder = resolve; }));
    const input = {
      quote,
      quoteKey: key,
      currentQuoteKey: key,
      address: request.address,
      items: request.items,
      now: Date.parse('2026-10-14T01:30:00.000Z'),
    };
    const operation = () => submitCheckoutPayment(input, dependencies);

    const first = runSingleFlight(lock, operation);
    const second = runSingleFlight(lock, operation);

    expect(first).toBe(second);
    expect(dependencies.createOrder).toHaveBeenCalledTimes(1);
    expect(dependencies.createPaymentSession).not.toHaveBeenCalled();
    finishOrder(order);
    await Promise.all([first, second]);
    expect(dependencies.createOrder).toHaveBeenCalledTimes(1);
    expect(dependencies.createPaymentSession).toHaveBeenCalledTimes(1);
    expect(lock.current).toBeNull();
  });
});
