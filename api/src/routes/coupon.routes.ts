import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { validateBody } from '../middlewares/validation.js';
import { z } from 'zod';
import { validateCoupon } from '../controllers/coupon.controller.js';

const router = Router();

const couponSchema = z.object({
  code: z.string().min(1),
  subtotal: z.number().min(0),
});

router.post('/validate', requireAuth, validateBody(couponSchema), validateCoupon);

export default router;
