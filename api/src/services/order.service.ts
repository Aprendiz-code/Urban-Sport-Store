import { prisma } from '../db/prisma.js';
import { HttpError } from '../middlewares/error-handler.js';
import { CouponService } from './coupon.service.js';

export class OrderService {
  constructor(private couponService = new CouponService()) {}

  async createOrder(userId: string, payload: { addressId: string; couponCode?: string }) {
    const cart = await prisma.cart.findUnique({ where: { userId }, include: { items: { include: { product: true } } } });
    if (!cart || cart.items.length === 0) throw new HttpError(400, 'CART_EMPTY', 'Cart is empty');

    const address = await prisma.address.findFirst({ where: { id: payload.addressId, userId } });
    if (!address) throw new HttpError(404, 'ADDRESS_NOT_FOUND', 'Address not found');

    const subtotal = cart.items.reduce((sum, item) => sum + Number(item.product.price) * item.quantity, 0);
    let discountAmount = 0;
    let couponCode: string | undefined;
    if (payload.couponCode) {
      const validatedCoupon = await this.couponService.validateCoupon(payload.couponCode, userId, subtotal);
      discountAmount = validatedCoupon.discountAmount;
      couponCode = payload.couponCode;
    }
    const taxAmount = subtotal * 0.16;
    const total = subtotal - discountAmount + taxAmount;

    return prisma.$transaction(async (tx) => {
      for (const item of cart.items) {
        const product = await tx.product.findUnique({ where: { id: item.productId } });
        if (!product || product.deletedAt || product.status !== 'ACTIVE') throw new HttpError(400, 'PRODUCT_UNAVAILABLE', 'Product unavailable');
        if (product.stock < item.quantity) throw new HttpError(400, 'INSUFFICIENT_STOCK', 'Insufficient stock');
        await tx.product.update({ where: { id: item.productId }, data: { stock: product.stock - item.quantity } });
        await tx.inventoryMovement.create({ data: { productId: item.productId, type: 'OUT', quantity: item.quantity, reason: 'Order creation', reference: 'order' } });
      }

      const order = await tx.order.create({ data: { userId, subtotal, discountAmount, taxAmount, total, couponCode, status: 'PENDING_PAYMENT' } });
      await Promise.all(cart.items.map((item) => tx.orderItem.create({ data: { orderId: order.id, productId: item.productId, productName: item.product.name, productSku: item.product.sku, unitPrice: item.product.price, quantity: item.quantity, discountAmount: 0, taxAmount: 0, lineTotal: item.product.price.mul(item.quantity) } })));
      if (couponCode) {
        await tx.couponUsage.create({ data: { couponId: (await tx.coupon.findUniqueOrThrow({ where: { code: couponCode } })).id, userId } });
      }
      await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
      await tx.payment.create({ data: { orderId: order.id, provider: 'simulated', amount: total, idempotencyKey: `${order.id}:${Date.now()}`, status: 'PENDING' } });
      await tx.shipment.create({ data: { orderId: order.id, addressId: address.id, status: 'PENDING' } });
      return order;
    });
  }

  async listOrders(userId: string) {
    return prisma.order.findMany({ where: { userId }, orderBy: { createdAt: 'desc' } });
  }

  async getOrder(userId: string, orderId: string) {
    const order = await prisma.order.findFirst({ where: { id: orderId, userId } });
    if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found');
    return order;
  }

  async cancelOrder(userId: string, orderId: string) {
    const order = await prisma.order.findFirst({ where: { id: orderId, userId } });
    if (!order) throw new HttpError(404, 'ORDER_NOT_FOUND', 'Order not found');
    if (order.status === 'CANCELLED' || order.status === 'REFUNDED' || order.status === 'DELIVERED') throw new HttpError(400, 'INVALID_STATUS_TRANSITION', 'Cannot cancel this order');

    return prisma.order.update({ where: { id: order.id }, data: { status: 'CANCELLED' } });
  }
}
