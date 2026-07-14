import { NextFunction, Request, Response } from 'express';
import { prisma } from '../db/prisma.js';
import { HttpError } from './error-handler.js';
import { verifyAccessToken } from '../utils/auth.js';

export const requireAuth = async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
    const cookieToken = req.cookies?.token;
    const effectiveToken = token ?? cookieToken;

    if (!effectiveToken) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    const payload = verifyAccessToken(effectiveToken);
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
