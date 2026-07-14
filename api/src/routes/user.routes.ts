import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { validateBody, validateParams } from '../middlewares/validation.js';
import { meUpdateSchema } from '../validators/auth.js';
import { z } from 'zod';
import { createAddress, deleteAddress, getAddresses, getMe, updateAddress, updateMe } from '../controllers/user.controller.js';

const router = Router();

const addressSchema = z.object({
  fullName: z.string().min(1),
  line1: z.string().min(1),
  line2: z.string().optional(),
  city: z.string().min(1),
  state: z.string().min(1),
  postalCode: z.string().min(1),
  country: z.string().min(1),
  phone: z.string().min(1),
  isDefault: z.boolean().optional(),
});

router.get('/me', requireAuth, getMe);
router.patch('/me', requireAuth, validateBody(meUpdateSchema), updateMe);
router.get('/me/addresses', requireAuth, getAddresses);
router.post('/me/addresses', requireAuth, validateBody(addressSchema), createAddress);
router.patch('/me/addresses/:addressId', requireAuth, validateParams(z.object({ addressId: z.string().uuid() })), validateBody(addressSchema.partial()), updateAddress);
router.delete('/me/addresses/:addressId', requireAuth, validateParams(z.object({ addressId: z.string().uuid() })), deleteAddress);

export default router;
