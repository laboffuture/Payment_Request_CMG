import { MSG, type FirstSetupInput, type LoginInput, type Me, type Role, type UpdateMeInput } from '@cm/shared';
import { badRequest, conflict, forbidden, unauthenticated } from '../lib/errors.js';
import { hashPassword, verifyPassword } from '../lib/password.js';
import { issueRefreshToken, revokeAllForUser, signAccessToken } from '../lib/tokens.js';
import { User, Vendor } from '../models/masters.js';
import { bumpSyncStamp } from '../lib/sync.js';
import { ssoEnabled } from '../env.js';

const MAX_FAILED = 10;
const LOCK_MINUTES = 15;

export interface SessionMeta {
  userAgent?: string;
  ip?: string;
}

export interface SignedIn {
  accessToken: string;
  refreshToken: string;
  me: Me;
}

async function toMe(userId: string): Promise<Me> {
  const user = await User.findById(userId).lean();
  if (!user) throw unauthenticated();
  const vendor = user.vendorId ? await Vendor.findById(user.vendorId).lean() : null;
  return {
    id: String(user._id),
    name: user.name,
    login: user.login,
    email: user.email ?? '',
    role: user.role as Role,
    vendorId: user.vendorId ? String(user.vendorId) : null,
    vendorName: vendor?.name ?? null,
    projectIds: (user.projectIds ?? []).map(String),
    emailOn: !!user.emailOn,
  };
}

/**
 * Prototype: doLogin().
 * §13: one generic message for every failure, so the form never reveals
 * whether a login id exists. Account locks after 10 consecutive failures.
 */
export async function login(
  input: LoginInput,
  meta: SessionMeta,
): Promise<SignedIn> {
  const user = await User.findOne({ login: input.login })
    .select('+passwordHash +failedLogins +lockedUntil')
    .exec();

  if (!user || !user.active) throw unauthenticated(MSG.badCredentials);

  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    throw forbidden(MSG.accountLocked);
  }

  const ok = await verifyPassword(input.password, user.passwordHash);
  if (!ok) {
    const failed = (user.failedLogins ?? 0) + 1;
    user.failedLogins = failed;
    if (failed >= MAX_FAILED) {
      user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
      user.failedLogins = 0;
    }
    await user.save();
    throw unauthenticated(MSG.badCredentials);
  }

  if (user.failedLogins || user.lockedUntil) {
    user.failedLogins = 0;
    user.lockedUntil = null;
    await user.save();
  }

  const id = String(user._id);
  return {
    accessToken: signAccessToken({
      sub: id,
      role: user.role as Role,
      vendorId: user.vendorId ? String(user.vendorId) : null,
    }),
    refreshToken: await issueRefreshToken(id, meta),
    me: await toMe(id),
  };
}

/**
 * Prototype: A.doFirstSetup — works only while the database has no users.
 */
export async function firstSetup(
  input: FirstSetupInput,
  meta: SessionMeta,
): Promise<SignedIn> {
  const count = await User.estimatedDocumentCount();
  // With single sign-on the Payment administrator is the first admin here.
  if (count > 0 || ssoEnabled) {
    throw conflict('The first admin already exists — sign in instead');
  }

  const user = await User.create({
    name: input.name,
    login: input.login,
    email: input.email ?? '',
    role: 'ADMIN',
    active: true,
    emailOn: true,
    passwordHash: await hashPassword(input.password),
  });

  await bumpSyncStamp();

  const id = String(user._id);
  return {
    accessToken: signAccessToken({ sub: id, role: 'ADMIN', vendorId: null }),
    refreshToken: await issueRefreshToken(id, meta),
    me: await toMe(id),
  };
}

/** A rotated refresh token buys a fresh access token. */
export async function accessTokenFor(userId: string): Promise<string> {
  const user = await User.findById(userId).lean();
  if (!user || !user.active) throw unauthenticated();
  return signAccessToken({
    sub: String(user._id),
    role: user.role as Role,
    vendorId: user.vendorId ? String(user.vendorId) : null,
  });
}

export const me = toMe;

/**
 * Prototype: A.saveProfile — email alerts and change password.
 * Changing a password revokes every other session (§13).
 */
export async function updateMe(
  userId: string,
  input: UpdateMeInput,
): Promise<{ me: Me; signedOutElsewhere: boolean }> {
  const user = await User.findById(userId).select('+passwordHash').exec();
  if (!user) throw unauthenticated();

  if (typeof input.emailOn === 'boolean') user.emailOn = input.emailOn;

  let signedOutElsewhere = false;
  if (input.newPassword) {
    // One password per person: a linked account's lives in the Payment app.
    if (user.paymentUserId) {
      throw badRequest('Your password is the one you use for the Payment app — change it there');
    }
    const ok = await verifyPassword(input.currentPassword ?? '', user.passwordHash);
    if (!ok) throw badRequest(MSG.currentPasswordWrong);
    user.passwordHash = await hashPassword(input.newPassword);
    signedOutElsewhere = true;
  }

  await user.save();
  if (signedOutElsewhere) await revokeAllForUser(userId);
  await bumpSyncStamp();

  return { me: await toMe(userId), signedOutElsewhere };
}

/** Is the very first admin still to be created? Drives the login page link. */
export const needsFirstSetup = async (): Promise<boolean> =>
  !ssoEnabled && (await User.estimatedDocumentCount()) === 0;
