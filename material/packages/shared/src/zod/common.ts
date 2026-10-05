import { z } from 'zod';
import { MSG } from '../messages.js';

/** A Mongo ObjectId as it travels over the wire. */
export const objectId = z
  .string()
  .regex(/^[0-9a-fA-F]{24}$/, 'Invalid id');

/** `YYYY-MM-DD`, the format every date input in the prototype uses. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date in YYYY-MM-DD form');

export const isoDateTime = z.string().datetime({ offset: true });

/** Quantities: 3 decimals (prototype `num`). */
export const qty = z
  .number()
  .finite()
  .min(0, MSG.qsNegative)
  .transform((v) => Math.round(v * 1000) / 1000);

/** Money: 2 decimals (prototype `r2`). */
export const money = z
  .number()
  .finite()
  .min(0)
  .transform((v) => Math.round(v * 100) / 100);

export const percent = z
  .number()
  .finite()
  .min(0, MSG.poTaxNegative)
  .max(100);

/** §13: ≥ 8 characters with a letter and a digit. Plan decision (d)(14). */
export const password = z
  .string()
  .min(8, MSG.passwordRule)
  .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), MSG.passwordRule);

/** Prototype: /^[a-z0-9._@-]{2,}$/ on a lowercased login. */
export const login = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._@-]{2,}$/, MSG.userLoginFormat);

export const optionalEmail = z
  .string()
  .trim()
  .email()
  .or(z.literal(''))
  .optional();

export const pagination = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type Pagination = z.infer<typeof pagination>;

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  limit: number;
}

/** Optimistic locking: every mutation of an existing document carries `rv`. */
export const withRv = <T extends z.ZodRawShape>(shape: T) =>
  z.object({ ...shape, rv: z.number().int().min(0).optional() });

export const apiError = z.object({
  error: z.string(),
  code: z.string().optional(),
  details: z.unknown().optional(),
});
export type ApiError = z.infer<typeof apiError>;
