import { NextFunction, Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { HttpError } from './error-handler.js';
import { verifyAccessToken } from '../utils/auth.js';
import { logger } from '../config/logger.js';

export const requireAuth = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const cookieToken = req.cookies?.token;
    const effectiveToken = token ?? cookieToken;

    logger.debug({ hasAuthHeader: Boolean(authHeader), authHeaderPrefix: authHeader?.split(' ')[0], tokenLength: effectiveToken?.length }, 'requireAuth: auth header check');

    if (!effectiveToken) {
      logger.warn({ hasAuthHeader: Boolean(authHeader), hasCookieToken: Boolean(cookieToken) }, 'requireAuth: missing authentication token');
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    let payload;
    try {
      payload = verifyAccessToken(effectiveToken);
    } catch (error) {
      if (error instanceof Error && ['JsonWebTokenError', 'TokenExpiredError'].includes(error.name)) {
        logger.warn({ error: error.message, errorName: error.name }, 'requireAuth: invalid access token');
        next(new HttpError(401, 'INVALID_TOKEN', 'Authentication required')); 
        return;
      }
      throw error;
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.id },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user || !user.isActive) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    req.user = {
      id: user.id,
      email: user.email,
      name: user.name,
      roles: user.userRoles.map(({ role }) => role.name as 'CUSTOMER' | 'ADMIN'),
    };
    next();
  } catch (error) {
    next(error);
  }
};

export const requireRole = (role: 'ADMIN') => (req: Request, _res: Response, next: NextFunction): void => {
  if (!req.user?.roles.includes(role)) {
    next(new HttpError(403, 'FORBIDDEN', 'Insufficient permissions'));
    return;
  }
  next();
};
