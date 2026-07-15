import { Router } from 'express';
import { requireAuth, requireRole } from '../middlewares/auth.js';
import { validateBody, validateParams } from '../middlewares/validation.js';
import { z } from 'zod';
import { adminDashboard, createBrand, createCategory, createCoupon, createInventoryMovement, createProduct, deleteCategory, deleteCoupon, deleteProduct, getLowStockProducts, inventoryReport, salesReport, updateBrand, updateCategory, updateCoupon, updateOrderStatus, updateProduct } from '../controllers/admin.controller.js';

const router = Router();

const productSchema = z.object({
  name: z.string().min(1),
  slug: z.string().min(1),
  sku: z.string().min(1),
  description: z.string().optional(),
  price: z.number().positive(),
  compareAtPrice: z.number().positive().optional(),
  stock: z.number().int().min(0),
  status: z.enum(['ACTIVE', 'INACTIVE', 'DRAFT']).default('ACTIVE'),
  categoryId: z.string().uuid(),
  brandId: z.string().uuid(),
});

const categorySchema = z.object({ name: z.string().min(1), slug: z.string().min(1), description: z.string().optional() });
const brandSchema = z.object({ name: z.string().min(1), slug: z.string().min(1), description: z.string().optional() });
const inventorySchema = z.object({ productId: z.string().uuid(), type: z.enum(['IN', 'OUT', 'ADJUSTMENT']), quantity: z.number().int(), reason: z.string().optional(), reference: z.string().optional() });
const orderStatusSchema = z.object({ status: z.enum(['PENDING_PAYMENT', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']) });
const couponSchema = z.object({ code: z.string().min(1), type: z.enum(['PERCENTAGE', 'FIXED']), value: z.number().min(0), minimumAmount: z.number().min(0).optional(), totalLimit: z.number().int().min(1).optional(), perUserLimit: z.number().int().min(1).optional(), startsAt: z.string().datetime().transform((v) => new Date(v)), expiresAt: z.string().datetime().transform((v) => new Date(v)), isActive: z.boolean().optional() });

router.get('/dashboard', requireAuth, requireRole('ADMIN'), adminDashboard);
router.post('/products', requireAuth, requireRole('ADMIN'), validateBody(productSchema), createProduct);
router.patch('/products/:productId', requireAuth, requireRole('ADMIN'), validateParams(z.object({ productId: z.string().uuid() })), validateBody(productSchema.partial()), updateProduct);
router.delete('/products/:productId', requireAuth, requireRole('ADMIN'), validateParams(z.object({ productId: z.string().uuid() })), deleteProduct);
router.post('/categories', requireAuth, requireRole('ADMIN'), validateBody(categorySchema), createCategory);
router.patch('/categories/:categoryId', requireAuth, requireRole('ADMIN'), validateParams(z.object({ categoryId: z.string().uuid() })), validateBody(categorySchema.partial()), updateCategory);
router.delete('/categories/:categoryId', requireAuth, requireRole('ADMIN'), validateParams(z.object({ categoryId: z.string().uuid() })), deleteCategory);
router.post('/brands', requireAuth, requireRole('ADMIN'), validateBody(brandSchema), createBrand);
router.patch('/brands/:brandId', requireAuth, requireRole('ADMIN'), validateParams(z.object({ brandId: z.string().uuid() })), validateBody(brandSchema.partial()), updateBrand);
router.post('/inventory/movements', requireAuth, requireRole('ADMIN'), validateBody(inventorySchema), createInventoryMovement);
router.get('/inventory/low-stock', requireAuth, requireRole('ADMIN'), getLowStockProducts);
router.get('/audit', requireAuth, requireRole('ADMIN'), (req, res, next) => { return require('../controllers/admin.controller.js').getAuditLogs(req, res, next); });
router.patch('/orders/:orderId/status', requireAuth, requireRole('ADMIN'), validateParams(z.object({ orderId: z.string().uuid() })), validateBody(orderStatusSchema), updateOrderStatus);
router.post('/coupons', requireAuth, requireRole('ADMIN'), validateBody(couponSchema), createCoupon);
router.patch('/coupons/:couponId', requireAuth, requireRole('ADMIN'), validateParams(z.object({ couponId: z.string().uuid() })), validateBody(couponSchema.partial()), updateCoupon);
router.delete('/coupons/:couponId', requireAuth, requireRole('ADMIN'), validateParams(z.object({ couponId: z.string().uuid() })), deleteCoupon);
router.get('/reports/sales', requireAuth, requireRole('ADMIN'), salesReport);
router.get('/reports/inventory', requireAuth, requireRole('ADMIN'), inventoryReport);

export default router;
