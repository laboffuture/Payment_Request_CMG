import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';

/**
 * Zod at the edge. Every body/query/params object is replaced by its parsed
 * value, so a controller can never read an unvalidated field by accident.
 */
export const validateBody =
  <T extends ZodTypeAny>(schema: T) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return next(parsed.error);
    req.body = parsed.data;
    next();
  };

export const validateQuery =
  <T extends ZodTypeAny>(schema: T) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const parsed = schema.safeParse(req.query);
    if (!parsed.success) return next(parsed.error);
    // req.query is a getter-only property on newer Express typings.
    Object.defineProperty(req, 'validatedQuery', { value: parsed.data, writable: true });
    next();
  };

export const queryOf = <T>(req: Request): T =>
  (req as unknown as { validatedQuery: T }).validatedQuery;

export const bodyOf = <T extends ZodTypeAny>(req: Request): z.infer<T> =>
  req.body as z.infer<T>;
