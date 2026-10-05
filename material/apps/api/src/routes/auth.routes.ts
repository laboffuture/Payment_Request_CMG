import { Router } from 'express';
import { firstSetupInput, loginInput, updateMeInput, MSG } from '@cm/shared';
import { wrap } from '../lib/http.js';
import { validateBody } from '../middleware/validate.js';
import { loginLimiter } from '../middleware/rateLimit.js';
import { actorOf, requireAuth } from '../middleware/auth.js';
import {
  accessTokenFor,
  firstSetup,
  login as loginService,
  me as meService,
  needsFirstSetup,
  updateMe,
} from '../services/auth.service.js';
import {
  ACCESS_COOKIE,
  REFRESH_COOKIE,
  clearAuthCookies,
  rotateRefreshToken,
  revokeRefreshToken,
  setAuthCookies,
} from '../lib/tokens.js';
import { forbidden, unauthenticated } from '../lib/errors.js';
import { ssoEnabled } from '../env.js';
import { User } from '../models/masters.js';
import { materialUserFor, paymentLogin, paymentLogout } from '../lib/paymentSso.js';

const SSO_MUST_CHANGE =
  'Your password was set by the administrator — sign in to the Payment app once to choose your own, then come back';
const SSO_NO_ACCESS =
  'Your account has no access to Material Management yet — ask the administrator to add you';
import { countsFor } from '../services/counts.service.js';

export const authRouter: Router = Router();

const meta = (req: import('express').Request) => ({
  userAgent: req.get('user-agent') ?? '',
  ip: req.ip ?? '',
});

/** Prototype: loginView() — is the "create the first admin" link needed? */
authRouter.get(
  '/auth/state',
  wrap(async (_req, res) => {
    res.json({ needsFirstSetup: await needsFirstSetup() });
  }),
);

authRouter.post(
  '/auth/login',
  loginLimiter,
  validateBody(loginInput),
  wrap(async (req, res) => {
    // One password per person: anyone the Payment app knows signs in with it,
    // on this screen or on the Payment one. Linked accounts are found by their
    // Material login too, and use the email address held against it.
    if (ssoEnabled) {
      const { login, password } = req.body as { login: string; password: string };
      const local = await User.findOne({ login }).select('paymentUserId email').lean();
      const email = local?.paymentUserId ? local.email : !local && login.includes('@') ? login : '';
      if (email) {
        const signed = await paymentLogin(email, password, res);
        if (!signed) throw unauthenticated(MSG.badCredentials);
        if (signed.mustChange) throw forbidden(SSO_MUST_CHANGE);
        const found = await materialUserFor(signed.actor);
        if (!found || !found.user.active) throw forbidden(SSO_NO_ACCESS);
        res.json({ me: { ...(await meService(String(found.user._id))), role: found.role } });
        return;
      }
    }

    const result = await loginService(req.body, meta(req));
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.json({ me: result.me });
  }),
);

authRouter.post(
  '/auth/first-setup',
  validateBody(firstSetupInput),
  wrap(async (req, res) => {
    const result = await firstSetup(req.body, meta(req));
    setAuthCookies(res, result.accessToken, result.refreshToken);
    res.status(201).json({ me: result.me });
  }),
);

/** Rotation: the presented refresh token is consumed and replaced (§13). */
authRouter.post(
  '/auth/refresh',
  wrap(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) throw unauthenticated();

    const rotated = await rotateRefreshToken(token, meta(req));
    if (!rotated) {
      clearAuthCookies(res);
      throw unauthenticated();
    }

    setAuthCookies(res, await accessTokenFor(rotated.userId), rotated.token);
    res.json({ me: await meService(rotated.userId) });
  }),
);

authRouter.post(
  '/auth/logout',
  wrap(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (token) await revokeRefreshToken(token);
    clearAuthCookies(res);
    await paymentLogout(req, res);
    res.json({ ok: true });
  }),
);

authRouter.get(
  '/me',
  requireAuth,
  wrap(async (req, res) => {
    const actor = actorOf(req);
    // The role in use, which the header may have switched to.
    res.json({ ...(await meService(actor.id)), role: actor.role });
  }),
);

/** Prototype: A.saveProfile — email alerts and change password. */
authRouter.patch(
  '/me',
  requireAuth,
  validateBody(updateMeInput),
  wrap(async (req, res) => {
    const actor = actorOf(req);
    const { me, signedOutElsewhere } = await updateMe(actor.id, req.body);
    if (signedOutElsewhere) {
      // This session keeps its access token but loses its refresh token.
      res.clearCookie(REFRESH_COOKIE, { path: '/' });
      res.clearCookie(ACCESS_COOKIE, { path: '/' });
    }
    res.json({ me, signedOutElsewhere, message: 'Saved' });
  }),
);

/** Prototype: counts(role) — the sidebar badges. */
authRouter.get(
  '/me/counts',
  requireAuth,
  wrap(async (req, res) => {
    res.json(await countsFor(actorOf(req)));
  }),
);

export const AUTH_MESSAGES = MSG;
