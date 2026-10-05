import { z } from 'zod';
import { isoDate, money, objectId, percent, qty } from './common.js';
import { CURRENCIES, DELIVER_TO, TAX_MODES, VENDOR_DOC_TYPES } from '../enums.js';
import { MSG } from '../messages.js';

/**
 * Purchase orders.
 * Prototype origin: savePOCore(), A.savePO, A.poApprove, A.poReject,
 * A.poCancel, A.poRevise, A.poAck.
 */

/**
 * One row of the wizard's "On this PO" table: an MR line, how much of it, and
 * the rate/tax for its item. Lines are grouped into one `poLine` per
 * item+rate+tax, with a `poAlloc` per row (§5).
 */
export const poRowInput = z.object({
  mrLineId: objectId,
  qty: qty,
  rate: money,
  gstPct: percent.default(0),
});
export type PoRowInput = z.infer<typeof poRowInput>;

export const upsertPoInput = z.object({
  vendorId: objectId,
  companyId: objectId,
  deliverTo: z.enum(DELIVER_TO).default('STORE'),
  deliveryDate: isoDate.or(z.literal('')).optional().default(''),
  terms: z.string().trim().max(200).optional().default(''),
  notes: z.string().trim().max(4000).optional().default(''),
  taxMode: z.enum(TAX_MODES).default('VAT'),
  /** the currency the order is placed in — the company's is the default */
  currency: z.enum(CURRENCIES).optional(),
  /** why this vendor without an enquiry */
  reason: z.string().trim().max(200).optional().default(''),
  rows: z.array(poRowInput).min(1, MSG.poNoLines),
  /** true = submit for approval, false = save as a draft */
  submit: z.boolean().default(false),
  rv: z.number().int().min(0).optional(),
});
export type UpsertPoInput = z.infer<typeof upsertPoInput>;

/** A revision keeps the vendor but needs a reason (§6). */
export const revisePoInput = upsertPoInput.extend({
  revisionReason: z.string().trim().min(1, MSG.poRevisionReason).max(500),
});
export type RevisePoInput = z.infer<typeof revisePoInput>;

export const poCommentInput = z.object({
  comment: z.string().trim().max(2000).optional().default(''),
  rv: z.number().int().min(0).optional(),
});
export type PoCommentInput = z.infer<typeof poCommentInput>;

/** Rejecting needs a reason. */
export const poRejectInput = z.object({
  comment: z.string().trim().min(1, MSG.docRejectReason).max(2000),
  rv: z.number().int().min(0).optional(),
});
export type PoRejectInput = z.infer<typeof poRejectInput>;

/**
 * QS's validation answer: "is everything you specified on this PO?"
 * A "no" has to say what is missing, because procurement is the one who has to
 * put it right.
 */
export const poValidateInput = z
  .object({
    ok: z.boolean(),
    remark: z.string().trim().max(2000).optional().default(''),
    rv: z.number().int().min(0).optional(),
  })
  .refine((v) => v.ok || v.remark.length > 0, {
    message: MSG.poValidationRemark,
    path: ['remark'],
  });
export type PoValidateInput = z.infer<typeof poValidateInput>;

export const PO_LIST_TABS = [
  '',
  'DRAFT',
  'PENDING_APPROVAL',
  'QS_VALIDATION',
  'MGMT_APPROVAL',
  'APPROVED',
  'PARTIAL',
  'RECEIVED',
  'REJECTED',
  'CANCELLED',
] as const;

export const poListQuery = z.object({
  status: z.enum(PO_LIST_TABS).optional().default(''),
  projectId: objectId.or(z.literal('')).optional().default(''),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type PoListQuery = z.infer<typeof poListQuery>;

// ---------------------------------------------------------------------------
// Vendor documents (invoices and delivery orders)
// ---------------------------------------------------------------------------

/** Multipart, so the fields arrive as strings. */
export const vendorDocInput = z.object({
  poId: objectId,
  docType: z.enum(VENDOR_DOC_TYPES),
  docNo: z.string().trim().min(1, MSG.docNoRequired).max(60),
  docDate: isoDate.or(z.literal('')).optional().default(''),
  amount: z.coerce.number().min(0).default(0),
});
export type VendorDocInput = z.infer<typeof vendorDocInput>;

export const rejectDocInput = z.object({
  remark: z.string().trim().min(1, MSG.docRejectReason).max(500),
});
export type RejectDocInput = z.infer<typeof rejectDocInput>;

export const DOC_LIST_TABS = ['SUBMITTED', 'VERIFIED', 'REJECTED', ''] as const;

export const docListQuery = z.object({
  status: z.enum(DOC_LIST_TABS).optional().default('SUBMITTED'),
});
export type DocListQuery = z.infer<typeof docListQuery>;

/**
 * Asking the system which vendor to use for a set of items. The rows are the
 * ones already picked from the pool, so the answer is about this order rather
 * than about vendors in general.
 */
export const poRecommendQuery = z.object({
  rows: z
    .array(z.object({ itemId: objectId, qty: qty }))
    .min(1),
});
export type PoRecommendQuery = z.infer<typeof poRecommendQuery>;
