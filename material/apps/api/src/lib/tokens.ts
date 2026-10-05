import { createHash, randomBytes } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { Response } from 'express';
import type { Role } from '@cm/shared';
import { env, isProd } from '../env.js';
import { RefreshToken } from '../models/masters.js';

export interface AccessClaims {
  sub: string;
  role: Role;
  vendorId: string | null;
}

export const ACCESS_COOKIE = 'cm_at';
export const REFRESH_COOKIE = 'cm_rt';

const cookieBase = {
  httpOnly: true,
  secure: isProd,
  sameSite: 'lax' as const,
  path: '/',
  ...(env.COOKIE_DOMAIN ? { domain: env.COOKIE_DOMAIN } : {}),
};

export const signAccessToken = (claims: AccessClaims): string =>
  jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL,
  } as jwt.SignOptions);

export const verifyAccessToken = (token: string): AccessClaims =>
  jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessClaims;

/** Refresh tokens are opaque random strings; only their hash is stored (§13). */
export const newRefreshToken = (): string => randomBytes(48).toString('base64url');

export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');

export const refreshExpiry = (): Date =>
  new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);

export async function issueRefreshToken(
  userId: string,
  meta: { userAgent?: string; ip?: string },
): Promise<string> {
  const token = newRefreshToken();
  await RefreshToken.create({
    userId,
    tokenHash: hashToken(token),
    expiresAt: refreshExpiry(),
    userAgent: meta.userAgent ?? '',
    ip: meta.ip ?? '',
  });
  return token;
}

/** Rotation: the presented token is consumed, a fresh one takes its place. */
export async function rotateRefreshToken(
  token: string,
  meta: { userAgent?: string; ip?: string },
): Promise<{ userId: string; token: string } | null> {
  const row = await RefreshToken.findOneAndDelete({
    tokenHash: hashToken(token),
    expiresAt: { $gt: new Date() },
  }).lean();
  if (!row) return null;
  const userId = String(row.userId);
  return { userId, token: await issueRefreshToken(userId, meta) };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await RefreshToken.deleteOne({ tokenHash: hashToken(token) });
}

/** Used on password change — every other session is dropped (§13). */
export async function revokeAllForUser(userId: string): Promise<void> {
  await RefreshToken.deleteMany({ userId });
}

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
): void {
  res.cookie(ACCESS_COOKIE, accessToken, { ...cookieBase, maxAge: 15 * 60 * 1000 });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...cookieBase,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, cookieBase);
  res.clearCookie(REFRESH_COOKIE, cookieBase);
}
