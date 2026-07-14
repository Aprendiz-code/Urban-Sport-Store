import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { validateBody } from '../middlewares/validation.js';
import { z } from 'zod';
import { confirmSimulatedPayment, createPaymentSession } from '../controllers/payment.controller.js';

const router = Router();

const createSessionSchema = z.object({ orderId: z.string().uuid() });
const confirmSchema = z.object({ orderId: z.string().uuid(), idempotencyKey: z.string().min(1) });

router.post('/create-session', requireAuth, validateBody(createSessionSchema), createPaymentSession);
router.post('/confirm-simulated', requireAuth, validateBody(confirmSchema), confirmSimulatedPayment);

export default router;
