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
  destinationCode: '11001000',
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
  calculatedBy: 'urban_sport_store',
  currency: 'COP',
  amountCop: 9010,
  subtotalCop: 1000,
  coverage: { covered: true, originCode: '11001000', destinationCode: '11001000' },
  destination: { code: '11001000', department: 'Cundinamarca', municipality: 'Bogotá' },
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
    requoteOrder: vi.fn(async ({ order: existing }: { order: Order }) => ({
      status: 'updated' as const,
      order: existing,
    })),
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
      request,
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
    const selectedAddressKey = getShippingQuoteRequestKey(request, 'address-2');
    const changedDestinationKey = getShippingQuoteRequestKey({
      ...request,
      destinationCode: '22001000',
    }, 'address-1');

    expect(getCheckoutQuoteSummary(quote, quoteKey, changedAddressKey, 1000).canContinue).toBe(false);
    expect(getCheckoutQuoteSummary(quote, quoteKey, changedQuantityKey, 1000).canContinue).toBe(false);
    expect(getCheckoutQuoteSummary(quote, quoteKey, selectedAddressKey, 1000).canContinue).toBe(false);
    expect(getCheckoutQuoteSummary(quote, quoteKey, changedDestinationKey, 1000).canContinue).toBe(false);
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
      request,
      now: Date.parse('2026-10-14T01:30:00.000Z'),
    }, dependencies);

    expect(dependencies.createOrder).toHaveBeenCalledWith({
      shippingQuoteId: quote.id,
      address: request.address,
      items: request.items,
    });
    expect(dependencies.createPaymentSession).toHaveBeenCalledWith(order.id);
  });

  it('does not reprice or create a session until a changed total is explicitly confirmed', async () => {
    const key = getShippingQuoteRequestKey(request, 'order-1');
    const dependencies = makeDependencies();
    const newQuote = {
      ...quote,
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      amountCop: 9500,
      subtotalCop: 1100,
    };

    const result = await submitCheckoutPayment({
      quote: newQuote,
      quoteKey: key,
      currentQuoteKey: key,
      request,
      existingOrder: order,
      now: Date.parse('2026-10-14T01:30:00.000Z'),
    }, dependencies);

    expect(result).toMatchObject({
      status: 'confirmation_required',
      proposal: { previousTotal: order.total, total: 10600 },
    });
    expect(dependencies.requoteOrder).not.toHaveBeenCalled();
    expect(dependencies.createPaymentSession).not.toHaveBeenCalled();
    expect(dependencies.createOrder).not.toHaveBeenCalled();
  });

  it('reuses the same order id and creates one session only after successful reprice', async () => {
    const key = getShippingQuoteRequestKey(request, 'order-1');
    const dependencies = makeDependencies();
    const newQuote = {
      ...quote,
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      amountCop: 9500,
      subtotalCop: 1100,
    };
    dependencies.requoteOrder.mockResolvedValueOnce({
      status: 'updated',
      order: { ...order, subtotal: 1100, shippingAmount: 9500, total: 10600 },
    });

    const result = await submitCheckoutPayment({
      quote: newQuote,
      quoteKey: key,
      currentQuoteKey: key,
      request,
      existingOrder: order,
      confirmRequote: true,
      confirmedTotal: 10600,
      now: Date.parse('2026-10-14T01:30:00.000Z'),
    }, dependencies);

    expect(dependencies.createOrder).not.toHaveBeenCalled();
    expect(dependencies.requoteOrder).toHaveBeenCalledWith({
      order,
      quote: newQuote,
      request,
      confirmedTotal: 10600,
    });
    expect(dependencies.createPaymentSession).toHaveBeenCalledTimes(1);
    expect(dependencies.createPaymentSession).toHaveBeenCalledWith(order.id);
    expect(result).toMatchObject({ status: 'ready', order: { id: order.id } });
  });

  it('blocks the payment session after server confirmation_required or conflict', async () => {
    const key = getShippingQuoteRequestKey(request, 'order-1');
    const dependencies = makeDependencies();
    const newQuote = { ...quote, id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' };
    dependencies.requoteOrder.mockResolvedValueOnce({
      status: 'confirmation_required',
      previousTotal: 9000,
      subtotal: 1000,
      shipping: 9010,
      total: 10010,
    });

    const proposal = await submitCheckoutPayment({
      quote: newQuote, quoteKey: key, currentQuoteKey: key,
      request, existingOrder: order,
      confirmRequote: true, now: Date.parse('2026-10-14T01:30:00.000Z'),
    }, dependencies);

    expect(proposal.status).toBe('confirmation_required');
    expect(dependencies.createPaymentSession).not.toHaveBeenCalled();

    dependencies.requoteOrder.mockResolvedValueOnce({
      status: 'conflict', message: 'Existe un intento activo o desconocido.',
    });
    await expect(submitCheckoutPayment({
      quote: newQuote, quoteKey: key, currentQuoteKey: key,
      request, existingOrder: order,
      confirmRequote: true, now: Date.parse('2026-10-14T01:30:00.000Z'),
    }, dependencies)).rejects.toThrow('Existe un intento activo o desconocido.');
    expect(dependencies.createPaymentSession).not.toHaveBeenCalled();
  });

  it('reuses one in-flight payment operation on double click', async () => {
    const lock: { current: Promise<string> | null } = { current: null };
    let finish!: (value: string) => void;
    const operation = vi.fn(() => new Promise<string>((resolve) => { finish = resolve; }));

    const first = runSingleFlight(lock, operation);
    const second = runSingleFlight(lock, operation);

    expect(first).toBe(second);
    expect(operation).toHaveBeenCalledTimes(1);
    finish('done');
    await expect(first).resolves.toBe('done');
    expect(lock.current).toBeNull();
  });

  it('retains a newly created order when session creation fails so retry does not create a second order', async () => {
    const key = getShippingQuoteRequestKey(request, 'address-1');
    const dependencies = makeDependencies();
    const onOrderReady = vi.fn();
    dependencies.createPaymentSession.mockRejectedValueOnce(new Error('session unavailable'));

    await expect(submitCheckoutPayment({
      quote,
      quoteKey: key,
      currentQuoteKey: key,
      request,
      onOrderReady,
      now: Date.parse('2026-10-14T01:30:00.000Z'),
    }, dependencies)).rejects.toThrow('session unavailable');

    expect(onOrderReady).toHaveBeenCalledWith(order);
    await submitCheckoutPayment({
      quote,
      quoteKey: key,
      currentQuoteKey: key,
      request,
      existingOrder: order,
      onOrderReady,
      now: Date.parse('2026-10-14T01:30:00.000Z'),
    }, dependencies);
    expect(dependencies.createOrder).toHaveBeenCalledTimes(1);
    expect(dependencies.createPaymentSession).toHaveBeenCalledTimes(2);
  });

  it('subtracts the persisted discount when comparing a resumed order total', async () => {
    const key = getShippingQuoteRequestKey(request, 'order-1');
    const discountedOrder = { ...order, discountAmount: 500, total: 9510 };
    const dependencies = makeDependencies();

    await expect(submitCheckoutPayment({
      quote,
      quoteKey: key,
      currentQuoteKey: key,
      request,
      existingOrder: discountedOrder,
      now: Date.parse('2026-10-14T01:30:00.000Z'),
    }, dependencies)).resolves.toMatchObject({ status: 'ready', order: discountedOrder });
    expect(dependencies.createOrder).not.toHaveBeenCalled();
    expect(dependencies.createPaymentSession).toHaveBeenCalledWith(discountedOrder.id);
  });
});