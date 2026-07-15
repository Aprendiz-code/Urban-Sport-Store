import { NextFunction, Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { successResponse } from '../utils/responses.js';
import { ProductService } from '../services/product.service.js';

const productService = new ProductService();

export const adminDashboard = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [products, orders, users] = await Promise.all([
      prisma.product.count({ where: { deletedAt: null } }),
      prisma.order.count(),
      prisma.user.count(),
    ]);
    res.status(200).json(successResponse({ products, orders, users }));
  } catch (error) {
    next(error);
  }
};

export const createProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const product = await productService.create(req.body);
    // record audit
    try { await prisma.auditLog.create({ data: { actorId: req.user?.id ?? undefined, action: 'create_product', entity: 'product', entityId: product.id, changes: product } }); } catch (e) { /* ignore */ }
    res.status(201).json(successResponse(product));
  } catch (error) {
    next(error);
  }
};

export const updateProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const productId = Array.isArray(req.params.productId) ? req.params.productId[0] : req.params.productId;
    const product = await productService.update(productId, req.body);
    try { await prisma.auditLog.create({ data: { actorId: req.user?.id ?? undefined, action: 'update_product', entity: 'product', entityId: product.id, changes: req.body } }); } catch (e) { }
    res.status(200).json(successResponse(product));
  } catch (error) {
    next(error);
  }
};

export const deleteProduct = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const productId = Array.isArray(req.params.productId) ? req.params.productId[0] : req.params.productId;
    const product = await productService.remove(productId);
    try { await prisma.auditLog.create({ data: { actorId: req.user?.id ?? undefined, action: 'delete_product', entity: 'product', entityId: productId, changes: { deletedAt: new Date() } } }); } catch (e) { }
    res.status(200).json(successResponse(product));
  } catch (error) {
    next(error);
  }
};

export const createCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const category = await prisma.category.create({ data: req.body });
    res.status(201).json(successResponse(category));
  } catch (error) {
    next(error);
  }
};

export const updateCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const categoryId = Array.isArray(req.params.categoryId) ? req.params.categoryId[0] : req.params.categoryId;
    const category = await prisma.category.update({ where: { id: categoryId }, data: req.body });
    res.status(200).json(successResponse(category));
  } catch (error) {
    next(error);
  }
};

export const deleteCategory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const categoryId = Array.isArray(req.params.categoryId) ? req.params.categoryId[0] : req.params.categoryId;
    await prisma.category.update({ where: { id: categoryId }, data: { deletedAt: new Date() } });
    res.status(200).json(successResponse({ ok: true }));
  } catch (error) {
    next(error);
  }
};

export const createBrand = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const brand = await prisma.brand.create({ data: req.body });
    res.status(201).json(successResponse(brand));
  } catch (error) {
    next(error);
  }
};

export const updateBrand = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const brandId = Array.isArray(req.params.brandId) ? req.params.brandId[0] : req.params.brandId;
    const brand = await prisma.brand.update({ where: { id: brandId }, data: req.body });
    res.status(200).json(successResponse(brand));
  } catch (error) {
    next(error);
  }
};

export const createInventoryMovement = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const movement = await prisma.inventoryMovement.create({ data: req.body });
    try { await prisma.auditLog.create({ data: { actorId: req.user?.id ?? undefined, action: 'inventory_movement', entity: 'product', entityId: (req.body as any).productId, changes: req.body } }); } catch (e) { }
    res.status(201).json(successResponse(movement));
  } catch (error) {
    next(error);
  }
};

export const getLowStockProducts = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const products = await prisma.product.findMany({ where: { stock: { lt: 10 }, deletedAt: null }, take: 20 });
    res.status(200).json(successResponse(products));
  } catch (error) {
    next(error);
  }
};

export const updateOrderStatus = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : req.params.orderId;
    const order = await prisma.order.update({ where: { id: orderId }, data: { status: req.body.status } });
    res.status(200).json(successResponse(order));
  } catch (error) {
    next(error);
  }
};

export const createCoupon = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const coupon = await prisma.coupon.create({ data: req.body });
    res.status(201).json(successResponse(coupon));
  } catch (error) {
    next(error);
  }
};

export const updateCoupon = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const couponId = Array.isArray(req.params.couponId) ? req.params.couponId[0] : req.params.couponId;
    const coupon = await prisma.coupon.update({ where: { id: couponId }, data: req.body });
    res.status(200).json(successResponse(coupon));
  } catch (error) {
    next(error);
  }
};

export const deleteCoupon = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const couponId = Array.isArray(req.params.couponId) ? req.params.couponId[0] : req.params.couponId;
    await prisma.coupon.update({ where: { id: couponId }, data: { deletedAt: new Date() } });
    res.status(200).json(successResponse({ ok: true }));
  } catch (error) {
    next(error);
  }
};

export const salesReport = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const orders = await prisma.order.findMany({ where: { status: 'PAID' } });
    res.status(200).json(successResponse(orders));
  } catch (error) {
    next(error);
  }
};

export const inventoryReport = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const products = await prisma.product.findMany({ where: { deletedAt: null } });
    res.status(200).json(successResponse(products));
  } catch (error) {
    next(error);
  }
};

export const getAuditLogs = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const limit = Number((_req.query.limit as any) ?? 50);
    const logs = await prisma.auditLog.findMany({ orderBy: { createdAt: 'desc' }, take: Math.min(200, limit) });
    res.status(200).json(successResponse(logs));
  } catch (error) {
    next(error);
  }
};
