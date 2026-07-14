import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.js';
import { AuthUser } from '../types/index.js';

export const hashPassword = async (password: string): Promise<string> => bcrypt.hash(password, 10);

export const comparePassword = async (password: string, hash: string): Promise<boolean> => bcrypt.compare(password, hash);

export const generateAccessToken = (user: AuthUser): string =>
  jwt.sign({ sub: user.id, email: user.email, roles: user.roles }, env.jwtSecret, { expiresIn: env.jwtExpiresIn as any });

export const verifyAccessToken = (token: string): AuthUser => {
  const payload = jwt.verify(token, env.jwtSecret) as { sub: string; email: string; roles: string[] };
  return { id: payload.sub, email: payload.email, name: '', roles: payload.roles as AuthUser['roles'] };
};
