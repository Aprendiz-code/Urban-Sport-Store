import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service.js';
import { successResponse } from '../utils/responses.js';
import { logger } from '../config/logger.js';

const authService = new AuthService();

export const register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await authService.register(req.body);
    res.status(201).json(successResponse({ user: data.user, token: data.token }));
  } catch (error) {
    next(error);
  }
};

export const login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const data = await authService.login(req.body);
    res.status(200).json(successResponse({ user: data.user, token: data.token }));
  } catch (error) {
    next(error);
  }
};

export const logout = (_req: Request, res: Response): void => {
  res.status(200).json(successResponse({ ok: true }));
};

export const forgotPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await authService.forgotPassword(req.body.email);
    res.status(200).json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const resetPassword = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const result = await authService.resetPassword(req.body.token, req.body.password);
    res.status(200).json(successResponse(result));
  } catch (error) {
    next(error);
  }
};

export const me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await authService.me(req.user!.id);
    res.status(200).json(successResponse(user));
  } catch (error) {
    next(error);
  }
};

export const bridge = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;
    logger.info({ hasAuthorizationHeader: Boolean(authHeader), authorizationPrefix: authHeader?.split(' ')[0] }, 'bridge: received token header');
    const token = authHeader?.startsWith('Bearer ') ? authHeader!.slice(7) : req.body?.access_token;
    if (!token) {
      logger.warn('bridge: missing token in Authorization header or body');
      res.status(400).json({ ok: false, error: 'MISSING_TOKEN' });
      return;
    }
    logger.info('bridge: exchanging supabase token for backend JWT');
    const data = await authService.exchangeSupabaseToken(token);
    logger.info({ userId: data.user.id, email: data.user.email }, 'bridge: token exchange successful');
    res.status(200).json(successResponse(data));
  } catch (error) {
    logger.error({ error: (error as any)?.message }, 'bridge: token exchange failed');
    next(error);
  }
};
