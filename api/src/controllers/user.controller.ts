import { NextFunction, Request, Response } from 'express';
import { AuthService } from '../services/auth.service.js';
import { successResponse } from '../utils/responses.js';
import { prisma } from '../db/prisma.js';

const authService = new AuthService();

export const getMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await authService.me(req.user!.id);
    res.status(200).json(successResponse(user));
  } catch (error) {
    next(error);
  }
};

export const updateMe = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const user = await authService.updateMe(req.user!.id, req.body);
    res.status(200).json(successResponse(user));
  } catch (error) {
    next(error);
  }
};

export const getAddresses = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const addresses = await prisma.address.findMany({ where: { userId: req.user!.id, deletedAt: null } });
    res.status(200).json(successResponse(addresses));
  } catch (error) {
    next(error);
  }
};

export const createAddress = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const address = await prisma.address.create({ data: { ...req.body, userId: req.user!.id } });
    res.status(201).json(successResponse(address));
  } catch (error) {
    next(error);
  }
};

export const updateAddress = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const addressId = Array.isArray(req.params.addressId) ? req.params.addressId[0] : req.params.addressId;
    const address = await prisma.address.update({ where: { id: addressId }, data: req.body });
    res.status(200).json(successResponse(address));
  } catch (error) {
    next(error);
  }
};

export const deleteAddress = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const addressId = Array.isArray(req.params.addressId) ? req.params.addressId[0] : req.params.addressId;
    await prisma.address.update({ where: { id: addressId }, data: { deletedAt: new Date() } });
    res.status(200).json(successResponse({ ok: true }));
  } catch (error) {
    next(error);
  }
};
