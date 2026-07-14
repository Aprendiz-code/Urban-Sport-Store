import { NextFunction, Request, Response } from 'express';
import { OrderService } from '../services/order.service.js';
import { successResponse } from '../utils/responses.js';

const orderService = new OrderService();

export const createOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const order = await orderService.createOrder(req.user!.id, req.body);
    res.status(201).json(successResponse(order));
  } catch (error) {
    next(error);
  }
};

export const listOrders = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const orders = await orderService.listOrders(req.user!.id);
    res.status(200).json(successResponse(orders));
  } catch (error) {
    next(error);
  }
};

export const getOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : req.params.orderId;
    const order = await orderService.getOrder(req.user!.id, orderId);
    res.status(200).json(successResponse(order));
  } catch (error) {
    next(error);
  }
};

export const cancelOrder = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const orderId = Array.isArray(req.params.orderId) ? req.params.orderId[0] : req.params.orderId;
    const order = await orderService.cancelOrder(req.user!.id, orderId);
    res.status(200).json(successResponse(order));
  } catch (error) {
    next(error);
  }
};
