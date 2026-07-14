import { Router } from 'express';
import { requireAuth } from '../middlewares/auth.js';
import { validateBody, validateParams } from '../middlewares/validation.js';
import { z } from 'zod';
import { addCartItem, clearCart, getCart, removeCartItem, updateCartItem } from '../controllers/cart.controller.js';

const router = Router();

const addItemSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.number().int().min(1),
});

const updateItemSchema = z.object({
  quantity: z.number().int().min(0),
});

router.get('/', requireAuth, getCart);
router.post('/items', requireAuth, validateBody(addItemSchema), addCartItem);
router.patch('/items/:itemId', requireAuth, validateParams(z.object({ itemId: z.string().uuid() })), validateBody(updateItemSchema), updateCartItem);
router.delete('/items/:itemId', requireAuth, validateParams(z.object({ itemId: z.string().uuid() })), removeCartItem);
router.delete('/', requireAuth, clearCart);

export default router;
