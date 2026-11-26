import type { OrderStatus, PaymentStatus } from '../types/domain';

export function getPaymentStatusMessage(
  paymentStatus: PaymentStatus | null | undefined | unknown,
  orderStatus: OrderStatus,
): string {
  if (paymentStatus === 'paid' && orderStatus === 'payment_review') {
    return 'Pago aprobado; el pedido requiere revisión antes de continuar.';
  }

  switch (paymentStatus) {
    case 'pending':
      return 'Pago pendiente de confirmación.';
    case 'paid':
      return 'Pago aprobado.';
    case 'failed':
      return 'El pago no fue aprobado.';
    case 'cancelled':
      return 'El pago fue anulado.';
    case 'refunded':
      return 'El pago fue reembolsado.';
    default:
      return 'Estado del pago no disponible.';
  }
}