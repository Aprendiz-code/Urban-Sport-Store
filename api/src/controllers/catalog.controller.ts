import { NextFunction, Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { successResponse } from '../utils/responses.js';

export const listCategories = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const categories = await prisma.category.findMany({ where: { deletedAt: null } });
    res.status(200).json(successResponse(categories));
  } catch (error) {
    next(error);
  }
};

export const getCategoryBySlug = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const slug = Array.isArray(req.params.slug) ? req.params.slug[0] : req.params.slug;
    const category = await prisma.category.findFirst({ where: { slug, deletedAt: null } });
    res.status(200).json(successResponse(category));
  } catch (error) {
    next(error);
  }
};

export const listBrands = async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const brands = await prisma.brand.findMany({ where: { deletedAt: null } });
    res.status(200).json(successResponse(brands));
  } catch (error) {
    next(error);
  }
};
