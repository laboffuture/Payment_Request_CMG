import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import type { Request } from 'express';
import { ERR } from '@cm/shared';
import { redis } from '../redis.js';
import { isTest, redisEnabled } from '../env.js';

/**
 * §13: limits are backed by Redis so every API container shares one counter.
 *
 * Under NODE_ENV=test there is no Redis, and rate limiting is not what the API
 * tests are checking — they fall back to express-rate-limit's own in-memory
 * store (with the limits raised out of the way below).
 */
const store = (prefix: string) =>
  isTest || !redisEnabled
    ? undefined
    : new RedisStore({
        prefix,
        sendCommand: (...args: string[]) =>
          redis.call(...(args as [string, ...string[]])) as Promise<never>,
      });

const message = (text: string) => ({ error: text, code: ERR.RATE_LIMITED });

/** Broad protection for the whole API. */
export const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: isTest ? 100_000 : 600,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: store('cm:rl:api:'),
  message: message('Too many requests — slow down a moment'),
});

/**
 * §13: 5 failures / 15 min per login + IP. The key includes the submitted
 * login id so one noisy office IP cannot lock out a colleague.
 */
export const loginLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: isTest ? 100_000 : 5,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: store('cm:rl:login:'),
  keyGenerator: (req: Request) => {
    const login = String((req.body as { login?: string })?.login ?? '').toLowerCase();
    return `${req.ip}|${login}`;
  },
  message: message('Too many sign-in attempts — try again in 15 minutes'),
});

/** Uploads are expensive; keep them to a sane rate per user. */
export const uploadLimiter = rateLimit({
  windowMs: 60_000,
  limit: isTest ? 100_000 : 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  store: store('cm:rl:upload:'),
  keyGenerator: (req: Request) => req.actor?.id ?? req.ip ?? 'anon',
  message: message('Too many uploads — wait a moment and try again'),
});
