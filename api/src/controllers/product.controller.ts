import { NextFunction, Request, Response } from 'express';
import { ProductService } from '../services/product.service.js';
import { successResponse } from '../utils/responses.js';

const productService = new ProductService();

export const listProducts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await productService.list(req.query as any);
    res.status(200).json(successResponse(result.data, result.meta as unknown as Record<string, unknown>));
  } catch (error) {
    next(error);
  }
};

export const getProductBySlug = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const slug = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;
    const product = await productService.getBySlug(slug);
    res.status(200).json(successResponse(product));
  } catch (error) {
    next(error);
  }
};

export const getFeaturedProducts = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const products = await productService.getFeatured();
    res.status(200).json(successResponse(products));
  } catch (error) {
    next(error);
  }
};

export const searchProducts = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await productService.list({ ...(req.query as any), search: req.query.search as string, page: 1, limit: 20 });
    res.status(200).json(successResponse(result.data));
  } catch (error) {
    next(error);
  }
};
