import { Request, Response, NextFunction } from 'express';
import { AuthService } from '../services/auth.service.js';
import { successResponse } from '../utils/responses.js';

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
    const token = req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization!.slice(7) : req.body?.access_token;
    if (!token) {
      res.status(400).json({ ok: false, error: 'MISSING_TOKEN' });
      return;
    }
    const data = await authService.exchangeSupabaseToken(token);
    res.status(200).json(successResponse(data));
  } catch (error) {
    next(error);
  }
};
