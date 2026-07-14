import { NextFunction, Request, Response } from 'express';
import { CouponService } from '../services/coupon.service.js';
import { successResponse } from '../utils/responses.js';

const couponService = new CouponService();

export const validateCoupon = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await couponService.validateCoupon(req.body.code, req.user!.id, req.body.subtotal);
    res.status(200).json(successResponse(result));
  } catch (error) {
    next(error);
  }
};
