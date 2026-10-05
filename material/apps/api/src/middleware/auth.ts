import type { NextFunction, Request, Response } from 'express';
import type { Role } from '@cm/shared';
import { MSG } from '@cm/shared';
import { forbidden, unauthenticated } from '../lib/errors.js';
import { ACCESS_COOKIE, verifyAccessToken } from '../lib/tokens.js';
import { User } from '../models/masters.js';
import { ROLE_HEADER, materialUserFor, paymentActorFor, paymentSessionOf } from '../lib/paymentSso.js';

export interface Actor {
  id: string;
  role: Role;
  vendorId: string | null;
  /** empty = every project (SITE users only) */
  projectIds: string[];
  name: string;
  email: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      actor?: Actor;
    }
  }
}

/**
 * Reads the access token from the httpOnly cookie (the SPA never sees it) and
 * loads the live user, so deactivating an account takes effect immediately
 * rather than at token expiry.
 */
export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;

    let claims;
    try {
      claims = token ? verifyAccessToken(token) : null;
    } catch {
      claims = null;
    }

    // A Material session first (vendors, Material-only logins), then the
    // Payment app's session for everyone who signs in there.
    let user = claims ? await User.findById(claims.sub).lean() : null;
    let role = user?.role as Role | undefined;
    if (!user) {
      const paymentActor = await paymentActorFor(paymentSessionOf(req));
      const found = paymentActor
        ? await materialUserFor(paymentActor, String(req.get(ROLE_HEADER) ?? req.query._role ?? ''))
        : null;
      if (found) ({ user, role } = found);
    }
    if (!user || !user.active || !role) throw unauthenticated();

    req.actor = {
      id: String(user._id),
      role,
      vendorId: user.vendorId ? String(user.vendorId) : null,
      projectIds: (user.projectIds ?? []).map(String),
      name: user.name,
      email: user.email ?? '',
    };
    next();
  } catch (err) {
    next(err);
  }
}

export const actorOf = (req: Request): Actor => {
  if (!req.actor) throw unauthenticated();
  return req.actor;
};

/**
 * §3: role gate. PROC_MGR can do everything PROC can, so listing PROC also
 * admits PROC_MGR unless PROC_MGR is listed on its own elsewhere.
 */
export function authorize(...roles: Role[]) {
  const allowed = new Set<Role>(roles);
  if (allowed.has('PROC')) allowed.add('PROC_MGR');
  return (req: Request, _res: Response, next: NextFunction): void => {
    const actor = req.actor;
    if (!actor) return next(unauthenticated());
    if (!allowed.has(actor.role)) return next(forbidden());
    next();
  };
}

/** MGMT is read-only everywhere (§3). */
export function denyReadOnly(req: Request, _res: Response, next: NextFunction): void {
  const actor = req.actor;
  if (actor?.role === 'MGMT') return next(forbidden(MSG.forbidden));
  next();
}

/** A SITE user with an empty projectIds list may see every project. */
export const projectScopeOf = (actor: Actor): string[] | null =>
  actor.role === 'SITE' && actor.projectIds.length ? actor.projectIds : null;

export const canSeeProject = (actor: Actor, projectId: string): boolean => {
  const scope = projectScopeOf(actor);
  return !scope || scope.includes(String(projectId));
};
