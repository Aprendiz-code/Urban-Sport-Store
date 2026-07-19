import rateLimit from 'express-rate-limit';
import { Request, Response, NextFunction } from 'express';
import { env } from '../config/env.js';

export const globalLimiter = (rateLimit as any)({
  windowMs: env.rateLimitWindowMs,
  max: env.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
});

export const authLimiter = (rateLimit as any)({
  windowMs: env.rateLimitWindowMs,
  max: env.authRateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
});

export const setRequestId = (req: Request, _res: Response, next: NextFunction): void => {
  req.requestId = crypto.randomUUID();
  next();
};
