import { z } from 'zod';
import { login, money, objectId, optionalEmail, password } from './common.js';
import { ROLES, TAX_MODES, UNITS } from '../enums.js';
import { MSG } from '../messages.js';

// ---------------------------------------------------------------------------
// Users — prototype userModalHtml() / A.saveUser
// ---------------------------------------------------------------------------

export const upsertUserInput = z
  .object({
    name: z.string().trim().min(1, MSG.userNameLoginRequired),
    login,
    email: optionalEmail,
    phone: z.string().trim().max(40).optional().default(''),
    role: z.enum(ROLES),
    /** required when role === VENDOR */
    vendorId: objectId.or(z.literal('')).optional(),
    /** SITE only; empty array = every project */
    projectIds: z.array(objectId).default([]),
    active: z.boolean().default(true),
    emailOn: z.boolean().default(true),
    /** required when creating; blank on edit keeps the old password */
    password: password.optional(),
    confirmPassword: z.string().optional(),
  })
  .refine(
    (v) => v.role !== 'VENDOR' || !!v.vendorId,
    { message: MSG.userVendorRequired, path: ['vendorId'] },
  )
  .refine(
    (v) => !v.password || v.password === v.confirmPassword,
    { message: MSG.passwordMismatch, path: ['confirmPassword'] },
  );
export type UpsertUserInput = z.infer<typeof upsertUserInput>;

/** POST /admin/users/import-payment — prototype A.doImportUsers */
export const importPaymentUsersInput = z.object({
  externalIds: z.array(z.string().min(1)).min(1),
  role: z.enum(ROLES).refine((r) => r !== 'VENDOR', {
    message: 'Vendor logins are created from the Vendors page',
  }),
});
export type ImportPaymentUsersInput = z.infer<typeof importPaymentUsersInput>;

// ---------------------------------------------------------------------------
// Vendors — prototype vendorModalHtml() / A.saveVendor
// ---------------------------------------------------------------------------

export const upsertVendorInput = z.object({
  name: z.string().trim().min(1, MSG.vendorNameRequired),
  email: optionalEmail,
  phone: z.string().trim().max(40).optional().default(''),
  taxNo: z.string().trim().max(60).optional().default(''),
  address: z.string().trim().max(500).optional().default(''),
});
export type UpsertVendorInput = z.infer<typeof upsertVendorInput>;

// ---------------------------------------------------------------------------
// Projects — prototype A.addProject (payment-app projects are read-only)
// ---------------------------------------------------------------------------

export const createProjectInput = z.object({
  code: z.string().trim().min(1, MSG.projectFieldsRequired).max(40),
  name: z.string().trim().min(1, MSG.projectFieldsRequired).max(160),
});
export type CreateProjectInput = z.infer<typeof createProjectInput>;

// ---------------------------------------------------------------------------
// Companies — prototype VIEWS.company / A.saveCompany
// ---------------------------------------------------------------------------

export const upsertCompanyInput = z.object({
  name: z.string().trim().min(1, MSG.companyNameRequired),
  legalName: z.string().trim().max(200).optional().default(''),
  address: z.string().trim().max(600).optional().default(''),
  taxLabel: z.string().trim().max(40).optional().default('TRN'),
  taxNo: z.string().trim().max(60).optional().default(''),
  phone: z.string().trim().max(40).optional().default(''),
  email: optionalEmail,
  currency: z.string().trim().max(8).optional().default('AED'),
  taxMode: z.enum(TAX_MODES).default('VAT'),
  defaultTax: money.default(5),
  poTerms: z.string().max(4000).optional().default(''),
  isDefault: z.boolean().default(false),
});
export type UpsertCompanyInput = z.infer<typeof upsertCompanyInput>;

// ---------------------------------------------------------------------------
// Categories — prototype A.addCat / A.toggleCat
// ---------------------------------------------------------------------------

export const createCategoryInput = z.object({
  name: z.string().trim().min(1, MSG.categoryNameRequired).max(80),
  /** empty = a main category */
  parentId: objectId.or(z.literal('')).optional().default(''),
});
export type CreateCategoryInput = z.infer<typeof createCategoryInput>;

// ---------------------------------------------------------------------------
// Items — prototype A.addMaster
// ---------------------------------------------------------------------------

export const createItemInput = z.object({
  name: z.string().trim().min(1, MSG.itemNameCategoryRequired).max(160),
  unit: z.enum(UNITS),
  category: z.string().trim().min(1, MSG.itemNameCategoryRequired),
  subCategory: z.string().trim().optional().default(''),
  spec: z.string().trim().max(160).optional().default(''),
  brand: z.string().trim().max(80).optional().default(''),
  packing: z.string().trim().max(80).optional().default(''),
  hsn: z.string().trim().max(20).optional().default(''),
  gstRate: z.number().min(0).max(100).nullable().optional(),
  lastRate: money.optional(),
});
export type CreateItemInput = z.infer<typeof createItemInput>;

export const updateItemInput = createItemInput.partial().extend({
  active: z.boolean().optional(),
});
export type UpdateItemInput = z.infer<typeof updateItemInput>;

// ---------------------------------------------------------------------------
// Notification rules — prototype VIEWS.notifyrules
// ---------------------------------------------------------------------------

export const updateNotifyRuleInput = z.object({
  portal: z.boolean().optional(),
  email: z.boolean().optional(),
  vendorEmail: z.boolean().optional(),
});
export type UpdateNotifyRuleInput = z.infer<typeof updateNotifyRuleInput>;

// ---------------------------------------------------------------------------
// Mail — prototype A.mailTest
// ---------------------------------------------------------------------------

export const testEmailInput = z.object({
  to: z.string().trim().email(),
});
export type TestEmailInput = z.infer<typeof testEmailInput>;
