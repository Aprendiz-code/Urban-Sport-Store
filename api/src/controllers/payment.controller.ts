import { NextFunction, Request, Response } from 'express';
import { SimulatedPaymentProvider } from '../services/payment.service.js';
import { successResponse } from '../utils/responses.js';

const paymentProvider = new SimulatedPaymentProvider();

export const createPaymentSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await paymentProvider.createSession(req.body.orderId);
    res.status(201).json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const confirmSimulatedPayment = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await paymentProvider.confirm(req.body.orderId, req.body.idempotencyKey);
    res.status(200).json(successResponse(result));
  } catch (error) {
    next(error);
  }
};
