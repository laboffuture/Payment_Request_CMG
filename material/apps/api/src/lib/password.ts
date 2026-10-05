import bcrypt from 'bcryptjs';

/** §13: bcrypt, cost 12. Hashes are `select: false` and never serialized. */
const COST = 12;

export const hashPassword = (plain: string): Promise<string> =>
  bcrypt.hash(plain, COST);

export const verifyPassword = (plain: string, hash: string): Promise<boolean> =>
  bcrypt.compare(plain, hash);

/** Plan decision (d)(14): one rule everywhere — ≥ 8 chars, a letter and a digit. */
export const passwordAcceptable = (plain: string): boolean =>
  plain.length >= 8 && /[A-Za-z]/.test(plain) && /[0-9]/.test(plain);
