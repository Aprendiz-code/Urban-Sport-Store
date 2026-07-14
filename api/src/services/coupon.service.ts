import { prisma } from '../db/prisma.js';
import { HttpError } from '../middlewares/error-handler.js';

export class CouponService {
  async validateCoupon(code: string, userId: string, subtotal: number) {
    const coupon = await prisma.coupon.findFirst({ where: { code, isActive: true, deletedAt: null } });
    if (!coupon) throw new HttpError(404, 'COUPON_NOT_FOUND', 'Coupon not found');
    if (coupon.startsAt > new Date() || coupon.expiresAt < new Date()) throw new HttpError(400, 'COUPON_EXPIRED', 'Coupon is not active');
    if (coupon.minimumAmount && subtotal < Number(coupon.minimumAmount)) throw new HttpError(400, 'COUPON_MINIMUM_AMOUNT', 'Minimum amount not met');

    const usageCount = await prisma.couponUsage.count({ where: { couponId: coupon.id } });
    if (coupon.totalLimit && usageCount >= coupon.totalLimit) throw new HttpError(400, 'COUPON_LIMIT_REACHED', 'Coupon limit reached');

    const userUsageCount = await prisma.couponUsage.count({ where: { couponId: coupon.id, userId } });
    if (coupon.perUserLimit && userUsageCount >= coupon.perUserLimit) throw new HttpError(400, 'COUPON_USER_LIMIT_REACHED', 'Coupon usage limit reached for user');

    let discountAmount = 0;
    if (coupon.type === 'PERCENTAGE') {
      discountAmount = subtotal * Number(coupon.value) / 100;
    } else {
      discountAmount = Number(coupon.value);
    }

    return { coupon, discountAmount: Math.min(discountAmount, subtotal) };
  }
}
