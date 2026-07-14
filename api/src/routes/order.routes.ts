import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { validateBody, validateParams } from '../middlewares/validation.js';
import { z } from 'zod';
import { cancelOrder, createOrder, getOrder, listOrders } from '../controllers/order.controller.js';

const router = Router();

const createOrderSchema = z.object({
  addressId: z.string().uuid(),
  couponCode: z.string().optional(),
});

router.post('/', requireAuth, validateBody(createOrderSchema), createOrder);
router.get('/', requireAuth, listOrders);
router.get('/:orderId', requireAuth, validateParams(z.object({ orderId: z.string().uuid() })), getOrder);
router.patch('/:orderId/cancel', requireAuth, validateParams(z.object({ orderId: z.string().uuid() })), cancelOrder);

export default router;
