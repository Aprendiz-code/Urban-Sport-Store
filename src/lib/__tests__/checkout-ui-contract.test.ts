import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const appSource = readFileSync(new URL('../../app/App.tsx', import.meta.url), 'utf8');
const checkoutStart = appSource.indexOf('function CheckoutPage(');
const checkoutEnd = appSource.indexOf('// ─── LOGIN PAGE', checkoutStart);
const checkoutSource = appSource.slice(checkoutStart, checkoutEnd);

describe('CheckoutPage UI source contract (static; not component integration)', () => {
  it('requests quotes for the current address and cart and guards stale responses', () => {
    expect(checkoutSource).toContain('createShippingQuote(requestInput)');
    expect(checkoutSource).toContain('getShippingQuoteRequestKey(quoteRequestInput, selectedAddressId)');
    expect(checkoutSource).toContain('currentQuoteKeyRef.current !== requestKey');
  });

  it('renders backend shipping, total, and delivery values and gates progression', () => {
    expect(checkoutSource).toContain('fmt(shippingQuote.amountCop)');
    expect(checkoutSource).toContain('quoteSummary.totalCop');
    expect(checkoutSource).toContain('shippingQuote.estimatedDelivery.minBusinessDays');
    expect(checkoutSource).toContain('disabled={paymentStarting || !quoteCanProceed');
    expect(checkoutSource).toContain('submitCheckoutPayment({');
    expect(checkoutSource).toContain('runSingleFlight(paymentRequestLock');
  });

  it('offers quote renewal from both address and shipping steps', () => {
    expect(checkoutSource.match(/quoteSummary\.isExpired/g)).toHaveLength(2);
    expect(checkoutSource.match(/Volver a cotizar/g)).toHaveLength(2);
  });
});
