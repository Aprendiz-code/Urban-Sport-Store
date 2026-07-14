import { NextFunction, Request, Response } from 'express';
import { CartService } from '../services/cart.service.js';
import { successResponse } from '../utils/responses.js';

const cartService = new CartService();

export const getCart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cart = await cartService.getCart(req.user!.id);
    res.status(200).json(successResponse(cart));
  } catch (error) {
    next(error);
  }
};

export const addCartItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const item = await cartService.addItem(req.user!.id, req.body);
    res.status(201).json(successResponse(item));
  } catch (error) {
    next(error);
  }
};

export const updateCartItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const itemId = Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId;
    const item = await cartService.updateItem(req.user!.id, itemId, req.body.quantity);
    res.status(200).json(successResponse(item));
  } catch (error) {
    next(error);
  }
};

export const removeCartItem = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const itemId = Array.isArray(req.params.itemId) ? req.params.itemId[0] : req.params.itemId;
    await cartService.removeItem(req.user!.id, itemId);
    res.status(200).json(successResponse({ ok: true }));
  } catch (error) {
    next(error);
  }
};

export const clearCart = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await cartService.clear(req.user!.id);
    res.status(200).json(successResponse({ ok: true }));
  } catch (error) {
    next(error);
  }
};
