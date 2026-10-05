import type { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import mongoose from 'mongoose';
import { MulterError } from 'multer';
import { ERR, MSG } from '@cm/shared';
import { isAppError } from '../lib/errors.js';
import { logger } from '../logger.js';
import { isProd } from '../env.js';

export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: MSG.notFound, code: ERR.NOT_FOUND });
}

/**
 * §12: one error shape, `{ error, code? }`, with a status the client can act on.
 * Nothing internal ever reaches the browser in production.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (isAppError(err)) {
    res
      .status(err.status)
      .json({ error: err.message, code: err.code, details: err.details });
    return;
  }

  if (err instanceof ZodError) {
    // Surface the first message — it is already written for a human (§8).
    const first = err.issues[0];
    res.status(400).json({
      error: first?.message ?? 'Check the form and try again',
      code: ERR.VALIDATION,
      details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    });
    return;
  }

  // A rejected upload is the caller's mistake, not a server fault: the file was
  // too big, there were too many, or the form used the wrong field name.
  if (err instanceof MulterError) {
    const message =
      err.code === 'LIMIT_FILE_SIZE'
        ? MSG.boqTooLarge
        : err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE'
          ? `Too many files, or an unexpected one (${err.field ?? 'file'})`
          : 'That upload was rejected — check the file and try again';
    res.status(400).json({ error: message, code: ERR.VALIDATION });
    return;
  }

  // Optimistic concurrency lost (§9).
  if (err instanceof mongoose.Error.VersionError) {
    res.status(409).json({ error: MSG.stale, code: ERR.STALE });
    return;
  }

  if (err instanceof mongoose.Error.CastError) {
    res.status(400).json({ error: 'Invalid id', code: ERR.VALIDATION });
    return;
  }

  const mongoErr = err as { code?: number; keyPattern?: Record<string, unknown> };
  if (mongoErr?.code === 11000) {
    const field = Object.keys(mongoErr.keyPattern ?? {})[0] ?? 'value';
    res.status(409).json({
      error: `That ${field} is already used`,
      code: ERR.CONFLICT,
    });
    return;
  }

  logger.error({ err, reqId: req.id }, 'unhandled error');
  res.status(500).json({
    error: isProd ? 'Something went wrong — please try again' : String(err),
    code: 'INTERNAL',
  });
}
