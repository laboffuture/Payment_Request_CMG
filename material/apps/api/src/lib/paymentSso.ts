/**
 * Single sign-on with the Payment app — one person, one password.
 *
 * The Payment app owns identity: names, email addresses, passwords and whether
 * an account is active. Material owns what a person may do here: their role,
 * their projects, their vendor. The two meet on the Material user's
 * `paymentUserId`, falling back to the email address the first time.
 *
 * Both apps sit behind one gateway on one domain, so the Payment session cookie
 * reaches this API with every request. We never read or trust its contents: we
 * hand it back to the Payment app, which says who it belongs to or that it is
 * no good. Deactivating someone or signing them out there therefore takes
 * effect here within CACHE_MS.
 *
 * Vendors and anyone else without a Payment account keep signing in with a
 * Material login and password exactly as before.
 */

import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { Types } from 'mongoose';
import type { Role } from '@cm/shared';
import { env, ssoEnabled } from '../env.js';
import { logger } from '../logger.js';
import { User } from '../models/masters.js';
import { hashPassword } from './password.js';
import { bumpSyncStamp } from './sync.js';

export interface PaymentActor {
  userId: string;
  email: string;
  name: string;
  roles: string[];
  /** Material scope held on the login: a site engineer's projects, a vendor's supplier. */
  material?: { projectIds?: string[]; vendorId?: string };
}

/**
 * The one application's role names for this API's role codes. Keep in step
 * with Payment_Request_CMG-main/lib/roles.ts. Administrator runs both sides.
 */
const ROLE_CODES: Record<string, Role> = {
  Administrator: 'ADMIN',
  'Material Admin': 'ADMIN',
  'Site Engineer': 'SITE',
  'Project Manager': 'PM',
  QS: 'QS',
  Procurement: 'PROC',
  'Procurement Manager': 'PROC_MGR',
  Store: 'STORE',
  'Management (Material)': 'MGMT',
  Vendor: 'VENDOR',
};

/** The material roles a person holds, in the order their account lists them. */
export const materialRolesOf = (actor: PaymentActor): Role[] =>
  Array.from(new Set(actor.roles.map((r) => ROLE_CODES[r]).filter((r): r is Role => !!r)));

/** The header the web app sends to say which of those roles is in use. */
export const ROLE_HEADER = 'x-cm-role';

/** How long a verified Payment session is trusted before asking again. */
const CACHE_MS = 30_000;
const cache = new Map<string, { actor: PaymentActor | null; at: number }>();

const base = () => env.PAYMENT_INTERNAL_URL.replace(/\/+$/, '');

export const paymentSessionOf = (req: Request): string =>
  (req.cookies?.[env.PAYMENT_SESSION_COOKIE] as string | undefined) ?? '';

const cookieHeader = (token: string) =>
  `${env.PAYMENT_SESSION_COOKIE}=${encodeURIComponent(token)}`;

/** Who does this Payment session belong to? null when it is not valid. */
export async function paymentActorFor(token: string): Promise<PaymentActor | null> {
  if (!ssoEnabled || !token) return null;

  const hit = cache.get(token);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.actor;

  let actor: PaymentActor | null = null;
  try {
    const res = await fetch(`${base()}/api/auth/session`, {
      headers: { cookie: cookieHeader(token) },
    });
    if (res.ok) {
      const body = (await res.json()) as { actor?: PaymentActor | null };
      if (body.actor?.userId) {
        actor = { ...body.actor, email: (body.actor.email ?? '').toLowerCase() };
      }
    }
  } catch (err) {
    // The Payment app being down must not look like "signed out" for long.
    logger.warn({ err }, 'payment sso: session check failed');
    return hit?.actor ?? null;
  }

  if (cache.size > 5000) cache.clear();
  cache.set(token, { actor, at: Date.now() });
  return actor;
}

export const forgetPaymentSession = (token: string): void => {
  cache.delete(token);
};

const validIds = (ids: string[] = []) => ids.filter((id) => Types.ObjectId.isValid(id));

/**
 * The Material user behind a Payment person, and the role they are using.
 *
 * Who may do what is decided on the Payment side: the roles and the material
 * scope on their one login. This keeps a Material user record in step with it
 * (the record exists because MRs, POs and GRNs refer to people by ObjectId):
 *
 * 1. Linked by paymentUserId - the normal case.
 * 2. Same email, not yet linked, not a vendor - the same person already had a
 *    Material account: link it, so their history stays theirs.
 * 3. Otherwise created on first use.
 *
 * No material role on the login means no access here. The active role is the
 * one the header asks for when the person holds it, else their first.
 */
export async function materialUserFor(actor: PaymentActor, requested = '') {
  const roles = materialRolesOf(actor);
  if (!roles.length) return null;
  const role: Role = roles.includes(requested as Role) ? (requested as Role) : roles[0]!;

  const projectIds = validIds(actor.material?.projectIds);
  const vendorId =
    actor.material?.vendorId && Types.ObjectId.isValid(actor.material.vendorId)
      ? actor.material.vendorId
      : null;
  if (role === 'VENDOR' && !vendorId) {
    logger.warn({ email: actor.email }, 'payment sso: vendor login has no supplier assigned');
    return null;
  }

  let user = await User.findOne({ paymentUserId: actor.userId }).lean();

  if (!user && actor.email) {
    // A vendor login links only to that supplier's own record; staff never to a vendor's.
    const sameEmail = await User.find({
      email: actor.email,
      ...(roles.includes('VENDOR') && vendorId
        ? { role: 'VENDOR', vendorId }
        : { role: { $ne: 'VENDOR' } }),
      $or: [{ paymentUserId: '' }, { paymentUserId: { $exists: false } }],
    }).lean();
    if (sameEmail.length > 1) {
      // Two Material accounts share this address; guessing would hand one
      // person the other's history. The merge report lists these.
      logger.warn({ email: actor.email }, 'payment sso: several Material users share this email');
      return null;
    }
    if (sameEmail.length === 1) {
      user = sameEmail[0]!;
      logger.info({ userId: String(user._id), email: actor.email }, 'payment sso: linked by email');
    }
  }

  // What the login says, written onto the Material record when it differs.
  const want = {
    paymentUserId: actor.userId,
    name: actor.name || actor.email,
    email: actor.email,
    role: roles[0]!,
    projectIds: roles.includes('SITE') ? projectIds : [],
    vendorId: roles.includes('VENDOR') ? vendorId : null,
    active: true,
  };

  if (!user) {
    let login = actor.email || `payment-${actor.userId}`;
    for (let n = 2; await User.exists({ login }); n += 1) login = `${actor.email}-${n}`;
    const created = await User.create({
      ...want,
      login,
      emailOn: true,
      // Never used: everyone signs in through the one login screen.
      passwordHash: await hashPassword(`sso-${randomUUID()}-9a`),
    });
    await bumpSyncStamp();
    logger.info({ email: actor.email, role }, 'payment sso: material user created');
    return { user: created.toObject(), role };
  }

  const differs =
    user.paymentUserId !== want.paymentUserId ||
    user.name !== want.name ||
    (user.email ?? '') !== want.email ||
    user.role !== want.role ||
    !user.active ||
    String(user.vendorId ?? '') !== String(want.vendorId ?? '') ||
    (user.projectIds ?? []).map(String).join(',') !== want.projectIds.join(',');
  if (differs) {
    await User.updateOne({ _id: user._id }, { $set: want });
    await bumpSyncStamp();
    user = { ...user, ...want, vendorId: want.vendorId as never, projectIds: want.projectIds as never };
  }
  return { user, role };
}

/**
 * Sign in to the Payment app with an email and password, server to server,
 * and pass its session cookie on to the browser. Lets a Payment person use the
 * Material sign-in screen with their one password.
 */
export async function paymentLogin(
  email: string,
  password: string,
  res: Response,
): Promise<{ actor: PaymentActor; mustChange: boolean } | null> {
  if (!ssoEnabled) return null;
  let upstream: globalThis.Response;
  try {
    upstream = await fetch(`${base()}/api/auth/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
  } catch (err) {
    logger.warn({ err }, 'payment sso: sign-in request failed');
    return null;
  }
  if (!upstream.ok) return null;
  const body = (await upstream.json().catch(() => ({}))) as {
    actor?: PaymentActor;
    mustChange?: boolean;
  };
  if (!body.actor?.userId) return null;

  const setCookie = upstream.headers.getSetCookie?.() ?? [];
  if (setCookie.length) res.append('Set-Cookie', setCookie);

  return {
    actor: { ...body.actor, email: (body.actor.email ?? '').toLowerCase() },
    mustChange: !!body.mustChange,
  };
}

/** Sign out of the Payment app too, and pass its cookie-clearing header on. */
export async function paymentLogout(req: Request, res: Response): Promise<void> {
  const token = paymentSessionOf(req);
  if (!ssoEnabled || !token) return;
  forgetPaymentSession(token);
  try {
    const upstream = await fetch(`${base()}/api/auth/session`, {
      method: 'DELETE',
      headers: { cookie: cookieHeader(token) },
    });
    const setCookie = upstream.headers.getSetCookie?.() ?? [];
    if (setCookie.length) res.append('Set-Cookie', setCookie);
  } catch (err) {
    logger.warn({ err }, 'payment sso: sign-out request failed');
  }
}
