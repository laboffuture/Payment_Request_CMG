import { z } from 'zod';
import { isoDate, objectId, qty } from './common.js';
import { UNITS } from '../enums.js';
import { MSG } from '../messages.js';

/**
 * Material requests.
 * Prototype origin: A.saveMR, A.qsApprove, A.sendBack, A.rejectMR,
 * A.approveNew, A.mapNew, A.rejectNew.
 *
 * The approval chain is site engineer → Project Manager → QS. Both approvers
 * may change the quantity, the measurement and the unit before passing it on;
 * what the site engineer originally asked for is kept alongside so the change
 * is visible to everyone.
 */

/** One line as the MR form posts it. */
export const mrLineInput = z
  .object({
    /** present when editing an existing line */
    id: objectId.optional(),
    /** an item from the master … */
    itemId: objectId.nullable().optional(),
    /** … or a new item for QS to clear */
    newItemName: z.string().trim().max(160).optional().default(''),
    newUnit: z.enum(UNITS).optional(),
    newCategory: z.string().trim().optional().default(''),
    newSpec: z.string().trim().max(160).optional().default(''),
    qty: qty,
    /**
     * What is actually wanted, in the engineer's own words. Required on
     * submit — unlike remarks, which are an aside. It is what the approvers,
     * the buyer and the vendor all read on the paper form.
     */
    description: z.string().trim().max(400).optional().default(''),
    /** free text: "2400 × 1200 × 12.5 mm", "M20", "6 m lengths" … */
    measurement: z.string().trim().max(120).optional().default(''),
    /** the unit this line is ordered in; defaults to the item's own unit */
    unit: z.enum(UNITS).optional(),
    boqRef: z.string().trim().max(30).optional().default(''),
    remarks: z.string().trim().max(250).optional().default(''),
  })
  .refine((l) => !!l.itemId || !!l.newItemName, {
    message: MSG.mrItemNameAndCategory,
    path: ['itemId'],
  });
export type MrLineInput = z.infer<typeof mrLineInput>;

export const upsertMrInput = z.object({
  projectId: objectId,
  /** only required on submit — a draft may be saved without one */
  requiredDate: isoDate.or(z.literal('')).optional().default(''),
  remarks: z.string().trim().max(2000).optional().default(''),
  lines: z.array(mrLineInput).default([]),
  /** true = submit to the Project Manager, false = save as a draft */
  submit: z.boolean().default(false),
  rv: z.number().int().min(0).optional(),
});
export type UpsertMrInput = z.infer<typeof upsertMrInput>;

/**
 * An approver's edit of one line. Both the PM and QS post these; QS adds the
 * store / PO split on top.
 */
export const reviewedLine = z.object({
  id: objectId,
  qty: qty,
  measurement: z.string().trim().max(120).optional().default(''),
  unit: z.enum(UNITS).optional(),
  /** drop this line from the request entirely */
  rejected: z.boolean().optional().default(false),
  remark: z.string().trim().max(250).optional().default(''),
});
export type ReviewedLine = z.infer<typeof reviewedLine>;

/** PM approval — the quantities may have been changed on the way through. */
export const pmApproveInput = z.object({
  lines: z.array(reviewedLine).min(1),
  comment: z.string().trim().max(2000).optional().default(''),
  rv: z.number().int().min(0).optional(),
});
export type PmApproveInput = z.infer<typeof pmApproveInput>;

/** QS split — one row per active line, with the same editable fields. */
export const qsApproveInput = z.object({
  lines: z
    .array(
      reviewedLine.extend({
        storeQty: qty,
        poQty: qty,
        qsRemark: z.string().trim().max(250).optional().default(''),
      }),
    )
    .min(1),
  comment: z.string().trim().max(2000).optional().default(''),
  rv: z.number().int().min(0).optional(),
});
export type QsApproveInput = z.infer<typeof qsApproveInput>;

/** Send back / reject both need a comment (§8). */
export const mrCommentInput = z.object({
  comment: z.string().trim().min(1, MSG.qsCommentRequired).max(2000),
  rv: z.number().int().min(0).optional(),
});
export type MrCommentInput = z.infer<typeof mrCommentInput>;

/** Map a new-item line onto an existing item. Prototype: A.mapNew. */
export const mapNewItemInput = z.object({
  itemId: objectId,
});
export type MapNewItemInput = z.infer<typeof mapNewItemInput>;

export const MR_LIST_TABS = [
  '',
  'DRAFT',
  'PM_PENDING',
  'QS_PENDING',
  'SENT_BACK',
  'APPROVED',
  'CLOSED',
  'REJECTED',
] as const;

export const mrListQuery = z.object({
  status: z.enum(MR_LIST_TABS).optional().default(''),
  projectId: objectId.or(z.literal('')).optional().default(''),
  /** the approval queues: 'pm' waits for the Project Manager, 'qs' for QS */
  queue: z.enum(['pm', 'qs']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});
export type MrListQuery = z.infer<typeof mrListQuery>;

/** The optional bill of quantities attached when the MR is raised. */
export const MAX_BOQ_BYTES = 5 * 1024 * 1024;

/**
 * A BOQ usually arrives as several sheets — one per floor, or a drawing
 * alongside the priced schedule — so the form takes a batch rather than one
 * file at a time.
 */
export const MAX_BOQ_FILES = 10;

export const BOQ_ACCEPT =
  '.pdf,.png,.jpg,.jpeg,.webp,.csv,.xls,.xlsx,application/pdf,image/*,text/csv';
