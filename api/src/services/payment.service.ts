import { prisma } from '../db/prisma.js';
import { HttpError } from '../middlewares/error-handler.js';

export interface PaymentProvider {
  createSession(orderId: string): Promise<{ providerReference: string; amount: number; currency: string }>;
  confirm(orderId: string, idempotencyKey: string): Promise<{ success: boolean; paymentId: string }>;
}

export class SimulatedPaymentProvider implements PaymentProvider {
  async createSession(orderId: string) {
    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found');
    return { providerReference: `sim-${order.id}`, amount: Number(order.total), currency: order.currency };
  }

  async confirm(orderId: string, idempotencyKey: string) {
    const existing = await prisma.payment.findFirst({ where: { idempotencyKey } });
    if (existing) {
      return { success: true, paymentId: existing.id };
    }

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found');

    const payment = await prisma.payment.create({ data: { orderId, provider: 'simulated', amount: order.total, idempotencyKey, status: 'COMPLETED' } });
    await prisma.order.update({ where: { id: orderId }, data: { status: 'PAID' } });
    return { success: true, paymentId: payment.id };
  }
}
