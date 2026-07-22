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

export const errorHandler = (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
  const requestMeta = {
    method: req.method,
    url: req.originalUrl,
    requestId: req.requestId,
  };

  if (res.headersSent) {
    logger.error({ ...requestMeta, err }, 'headers already sent while handling error');
    return;
  }

  if (err instanceof HttpError) {
    logger.warn({ ...requestMeta, statusCode: err.statusCode, code: err.code, message: err.message }, 'http error');
    res.status(err.statusCode).json(errorResponse(err.code, err.message, err.details));
    return;
  }

  // Handle Prisma errors
  const error = err as any;
  
  if (error?.name === 'PrismaClientInitializationError' || error?.code === 'P1001') {
    logger.error({ ...requestMeta, error: error?.message }, 'database connection error');
    res.status(503).json(errorResponse('DATABASE_UNAVAILABLE', 'Backend database is temporarily unavailable. Please try again later.'));
    return;
  }

  if (error?.name === 'PrismaClientRustPanicError') {
    logger.error({ error: error?.message }, 'prisma runtime panic');
    res.status(500).json(errorResponse('DATABASE_ERROR', 'A critical database error occurred'));
    return;
  }

  if (error?.code?.startsWith('P')) {
    logger.error({ error: error?.message, code: error?.code }, 'prisma error');
    res.status(500).json(errorResponse('DATABASE_ERROR', 'Database error occurred'));
    return;
  }

  // Handle validation errors
  if (error?.name === 'ZodError') {
    logger.warn({ issues: error?.issues }, 'validation error');
    res.status(400).json(errorResponse('VALIDATION_ERROR', 'Input validation failed', error?.issues?.map((i: any) => i.message) || []));
    return;
  }

  // Handle other HTTP errors (e.g., from fetch)
  if (error instanceof TypeError && error.message.includes('fetch')) {
    logger.error({ error: error.message }, 'fetch error');
    res.status(503).json(errorResponse('SERVICE_UNAVAILABLE', 'External service temporarily unavailable'));
    return;
  }

  logger.error({ err, stack: (err as Error)?.stack }, 'unhandled error');
  res.status(500).json(errorResponse('INTERNAL_SERVER_ERROR', 'Unexpected server error'));
};
