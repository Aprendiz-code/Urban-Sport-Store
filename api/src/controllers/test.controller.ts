import { Request, Response, NextFunction } from 'express';
import { prisma } from '../db/prisma.js';
import { env } from '../config/env.js';
import { generateAccessToken } from '../utils/auth.js';
import { successResponse } from '../utils/responses.js';
import { HttpError } from '../middlewares/error-handler.js';

export const getTestToken = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { secret } = req.body ?? {};
    if (!env.e2eSecret || secret !== env.e2eSecret) {
      throw new HttpError(403, 'FORBIDDEN', 'Invalid test secret');
    }

    const admin = await prisma.user.findFirst({
      where: { isActive: true },
      include: { userRoles: { include: { role: true } } },
      orderBy: { createdAt: 'asc' },
    });

    if (!admin) {
      throw new HttpError(404, 'NOT_FOUND', 'No admin user found');
    }

    const roles = admin.userRoles.map(({ role }) => role.name as 'CUSTOMER' | 'ADMIN');

    const token = generateAccessToken({ id: admin.id, email: admin.email, roles });
    res.status(200).json(successResponse({ token }));
  } catch (err) {
    next(err);
  }
};
