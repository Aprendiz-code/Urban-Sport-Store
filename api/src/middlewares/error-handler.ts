import { NextFunction, Request, Response } from 'express';
import { logger } from '../config/logger.js';
import { errorResponse } from '../utils/responses.js';

export class HttpError extends Error {
  statusCode: number;
  code: string;
  details: string[];

  constructor(statusCode: number, code: string, message: string, details: string[] = []) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const errorHandler = (err: unknown, _req: Request, res: Response, _next: NextFunction): void => {
  if (err instanceof HttpError) {
    logger.warn({ statusCode: err.statusCode, code: err.code, message: err.message }, 'http error');
    res.status(err.statusCode).json(errorResponse(err.code, err.message, err.details));
    return;
  }

  logger.error({ err }, 'unhandled error');
  res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Unexpected server error'));
};
