import { prisma } from '../db/prisma.js';
import { comparePassword, generateAccessToken, hashPassword } from '../utils/auth.js';
import { HttpError } from '../middlewares/error-handler.js';
import { randomUUID } from 'crypto';

export class AuthService {
  async register(payload: { name: string; email: string; password: string }) {
    const existing = await prisma.user.findUnique({ where: { email: payload.email } });
    if (existing) {
      throw new HttpError(409, 'USER_EXISTS', 'User already exists');
    }

    const passwordHash = await hashPassword(payload.password);
    const customerRole = await prisma.role.findUnique({ where: { name: 'CUSTOMER' } });
    if (!customerRole) {
      throw new HttpError(500, 'ROLE_NOT_FOUND', 'Role not found');
    }

    const user = await prisma.user.create({
      data: {
        name: payload.name,
        email: payload.email,
        passwordHash,
        userRoles: { create: { roleId: customerRole.id } },
      },
      include: { userRoles: { include: { role: true } } },
    });

    return {
      user: { id: user.id, email: user.email, name: user.name },
      token: generateAccessToken({ id: user.id, email: user.email, name: user.name, roles: user.userRoles.map(({ role }) => role.name as 'CUSTOMER' | 'ADMIN') }),
    };
  }

  async login(payload: { email: string; password: string }) {
    const user = await prisma.user.findUnique({
      where: { email: payload.email },
      include: { userRoles: { include: { role: true } } },
    });

    if (!user || !await comparePassword(payload.password, user.passwordHash)) {
      throw new HttpError(401, 'INVALID_CREDENTIALS', 'Invalid credentials');
    }

    if (!user.isActive) {
      throw new HttpError(403, 'USER_INACTIVE', 'User is inactive');
    }

    return {
      user: { id: user.id, email: user.email, name: user.name },
      token: generateAccessToken({ id: user.id, email: user.email, name: user.name, roles: user.userRoles.map(({ role }) => role.name as 'CUSTOMER' | 'ADMIN') }),
    };
  }

  async me(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new HttpError(404, 'USER_NOT_FOUND', 'User not found');
    return user;
  }

  async updateMe(userId: string, payload: { name?: string; email?: string }) {
    return prisma.user.update({ where: { id: userId }, data: payload });
  }

  async forgotPassword(email: string) {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return { ok: true };
    }

    const token = randomUUID();
    const tokenHash = token;
    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + 1000 * 60 * 30),
      },
    });

    return { ok: true, token };
  }

  async resetPassword(token: string, password: string) {
    const record = await prisma.passwordResetToken.findUnique({ where: { tokenHash: token } });
    if (!record || record.usedAt || record.expiresAt < new Date()) {
      throw new HttpError(400, 'INVALID_RESET_TOKEN', 'Invalid reset token');
    }

    const passwordHash = await hashPassword(password);
    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
      await tx.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
    });

    return { ok: true };
  }

  async exchangeSupabaseToken(accessToken: string) {
    // call Supabase auth user endpoint to validate token
    const supabaseUrl = process.env.SUPABASE_URL || '';
    if (!supabaseUrl) throw new Error('SUPABASE_URL not configured');
    const resp = await fetch(`${supabaseUrl}/auth/v1/user`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!resp.ok) throw new HttpError(401, 'INVALID_SUPABASE_TOKEN', 'Invalid Supabase token');
    const userInfo = await resp.json();
    const email = userInfo?.email;
    if (!email) throw new HttpError(401, 'INVALID_SUPABASE_TOKEN', 'Invalid Supabase token');

    const user = await prisma.user.findUnique({ where: { email }, include: { userRoles: { include: { role: true } } } });
    if (!user) throw new HttpError(401, 'USER_NOT_FOUND', 'User not found in backend');
    if (!user.isActive) throw new HttpError(403, 'USER_INACTIVE', 'User inactive');

    const token = generateAccessToken({ id: user.id, email: user.email, name: user.name, roles: user.userRoles.map(({ role }) => role.name as 'CUSTOMER' | 'ADMIN') });
    return { user: { id: user.id, email: user.email, name: user.name }, token };
  }
}
