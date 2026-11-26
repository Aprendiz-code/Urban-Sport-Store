import { describe, expect, it } from 'vitest';
import { getPaymentStatusMessage } from '../payment-status-display';

describe('getPaymentStatusMessage', () => {
  it.each([
    ['pending', 'pending_payment', 'Pago pendiente de confirmación.'],
    ['paid', 'paid', 'Pago aprobado.'],
    ['failed', 'pending_payment', 'El pago no fue aprobado.'],
    ['cancelled', 'cancelled', 'El pago fue anulado.'],
    ['refunded', 'refunded', 'El pago fue reembolsado.'],
    ['paid', 'payment_review', 'Pago aprobado; el pedido requiere revisión antes de continuar.'],
  ] as const)('maps %s payment with %s order status', (paymentStatus, orderStatus, message) => {
    expect(getPaymentStatusMessage(paymentStatus, orderStatus)).toBe(message);
  });

  it.each([
    undefined,
    null,
    'unknown-status',
  ])('returns fallback for unavailable payment status %s', (paymentStatus) => {
    expect(getPaymentStatusMessage(paymentStatus, 'pending_payment')).toBe('Estado del pago no disponible.');
  });
});