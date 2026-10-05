import { z } from 'zod';
import { login, password } from './common.js';
import { ROLES } from '../enums.js';

/** POST /auth/login — prototype doLogin(). */
export const loginInput = z.object({
  login: z.string().trim().toLowerCase().min(1),
  password: z.string().min(1),
});
export type LoginInput = z.infer<typeof loginInput>;

/** POST /auth/first-setup — prototype A.doFirstSetup. Only while 0 users exist. */
export const firstSetupInput = z.object({
  name: z.string().trim().min(1),
  login,
  email: z.string().trim().email().or(z.literal('')).optional(),
  password,
});
export type FirstSetupInput = z.infer<typeof firstSetupInput>;

/** PATCH /me — prototype A.saveProfile (email alerts + change password). */
export const updateMeInput = z
  .object({
    emailOn: z.boolean().optional(),
    currentPassword: z.string().optional(),
    newPassword: password.optional(),
  })
  .refine(
    (v) => !v.newPassword || !!v.currentPassword,
    { message: 'Enter your current password', path: ['currentPassword'] },
  );
export type UpdateMeInput = z.infer<typeof updateMeInput>;

export const meResponse = z.object({
  id: z.string(),
  name: z.string(),
  login: z.string(),
  email: z.string(),
  role: z.enum(ROLES),
  vendorId: z.string().nullable(),
  vendorName: z.string().nullable(),
  projectIds: z.array(z.string()),
  emailOn: z.boolean(),
});
export type Me = z.infer<typeof meResponse>;
