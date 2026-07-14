import { NextFunction, Request, Response } from 'express';
import { ZodSchema } from 'zod';
import { HttpError } from './error-handler.js';

export const validateBody = (schema: ZodSchema) => (req: Request, _res: Response, next: NextFunction): void => {
  try {
    req.body = schema.parse(req.body);
    next();
  } catch (error) {
    next(new HttpError(400, 'VALIDATION_ERROR', 'Invalid request body', [error instanceof Error ? error.message : 'Invalid request body']));
  }
};

export const validateQuery = (schema: ZodSchema) => (req: Request, _res: Response, next: NextFunction): void => {
  try {
    req.query = schema.parse(req.query);
    next();
  } catch (error) {
    next(new HttpError(400, 'VALIDATION_ERROR', 'Invalid query parameters', [error instanceof Error ? error.message : 'Invalid query parameters']));
  }
};

export const validateParams = (schema: ZodSchema) => (req: Request, _res: Response, next: NextFunction): void => {
  try {
    req.params = schema.parse(req.params);
    next();
  } catch (error) {
    next(new HttpError(400, 'VALIDATION_ERROR', 'Invalid request parameters', [error instanceof Error ? error.message : 'Invalid request parameters']));
  }
};
