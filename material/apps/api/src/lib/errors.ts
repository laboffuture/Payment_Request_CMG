import { ERR, MSG, type ErrCode } from '@cm/shared';

/**
 * Every failure the client is meant to read is one of these.
 * §12: `{ error: "<human message>", code?: "<MACHINE_CODE>" }` with a proper
 * status — 400 validation, 401, 403, 404, 409 conflict/illegal transition, 429.
 */
export class AppError extends Error {
  readonly status: number;
  readonly code: ErrCode;
  readonly details?: unknown;

  constructor(status: number, message: string, code: ErrCode, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, message, ERR.VALIDATION, details);

export const unauthenticated = (message: string = MSG.sessionExpired) =>
  new AppError(401, message, ERR.UNAUTHENTICATED);

export const forbidden = (message: string = MSG.forbidden) =>
  new AppError(403, message, ERR.FORBIDDEN);

export const notFound = (message: string = MSG.notFound) =>
  new AppError(404, message, ERR.NOT_FOUND);

export const conflict = (message: string) =>
  new AppError(409, message, ERR.CONFLICT);

/** An illegal status transition (§6). */
export const illegalTransition = (message: string) =>
  new AppError(409, message, ERR.ILLEGAL_TRANSITION);

/** Optimistic lock lost (§9). */
export const stale = () => new AppError(409, MSG.stale, ERR.STALE);

export const tooManyRequests = (message: string) =>
  new AppError(429, message, ERR.RATE_LIMITED);

export const isAppError = (e: unknown): e is AppError =>
  e instanceof AppError;
