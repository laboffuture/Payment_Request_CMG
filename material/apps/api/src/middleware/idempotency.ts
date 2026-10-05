import type { NextFunction, Request, Response } from 'express';
import { conflict } from '../lib/errors.js';
import { IDEMPOTENCY_PREFIX, redis } from '../redis.js';
import { logger } from '../logger.js';

const TTL_SECONDS = 24 * 60 * 60;

interface StoredResponse {
  status: number;
  body: unknown;
}

/**
 * §9: mutations accept an `Idempotency-Key` header, stored in Redis for 24 h,
 * so a client retry after a dropped connection cannot post a second GRN or a
 * duplicate PO.
 *
 * Three states per key:
 *   absent      -> claim it, run the handler, store the response
 *   "pending"   -> the first attempt is still running -> 409, retry shortly
 *   stored JSON -> replay the original response verbatim
 */
export async function idempotency(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.get('Idempotency-Key');
  if (!header) return next();

  const key = `${IDEMPOTENCY_PREFIX}${req.actor?.id ?? 'anon'}:${req.method}:${req.path}:${header}`;

  let claimed = false;
  try {
    claimed = (await redis.set(key, 'pending', 'EX', TTL_SECONDS, 'NX')) === 'OK';
  } catch (err) {
    // Redis down: better to process the request than to refuse it.
    logger.warn({ err }, 'idempotency store unavailable — passing through');
    return next();
  }

  if (!claimed) {
    const existing = await redis.get(key);
    if (existing && existing !== 'pending') {
      const stored = JSON.parse(existing) as StoredResponse;
      res.status(stored.status).json(stored.body);
      return;
    }
    return next(
      conflict('That request is already being processed — give it a moment'),
    );
  }

  const originalJson = res.json.bind(res);
  res.json = ((body: unknown) => {
    // Only a success is worth replaying; a failure should be retryable.
    if (res.statusCode < 400) {
      redis
        .set(key, JSON.stringify({ status: res.statusCode, body }), 'EX', TTL_SECONDS)
        .catch((err) => logger.warn({ err }, 'idempotency write failed'));
    } else {
      redis.del(key).catch(() => undefined);
    }
    return originalJson(body);
  }) as Response['json'];

  next();
}
