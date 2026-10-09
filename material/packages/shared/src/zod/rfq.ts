import { z } from 'zod';
import { money, objectId, qty } from './common.js';
import { MSG } from '../messages.js';

/**
 * Consolidation, enquiries and the vendor portal.
 * Prototype origin: poolSel(), A.createRFQ, A.doExtend, A.closeRFQ,
 * A.awardRFQ, A.vAccept, A.vDecline, A.vQuote.
 */

export const poolQuery = z.object({
  projectId: objectId.or(z.literal('')).optional().default(''),
  category: z.string().optional().default(''),
});
export type PoolQuery = z.infer<typeof poolQuery>;

/** A picked pool line: which MR line, and how much of it to take. */
export const poolPick = z.object({
  mrLineId: objectId,
  qty: qty.refine((v) => v > 0, MSG.poolSelectLine),
});
export type PoolPick = z.infer<typeof poolPick>;

/** Procurement sends ticked pool lines back to QS: a query, or a rejection. Remarks always. */
export const poolHoldInput = z.object({
  mrLineIds: z.array(objectId).min(1, MSG.poolSelectLine).max(200),
  action: z.enum(['QUERY', 'REJECT']),
  remark: z.string().trim().min(1, 'Write your remarks').max(500),
});
export type PoolHoldInput = z.infer<typeof poolHoldInput>;

/**
 * QS answers: RETURN puts the line back with procurement to buy; CANCEL takes the
 * quantity still to be bought off the MR line.
 */
export const procHoldAnswerInput = z.object({
  decision: z.enum(['RETURN', 'CANCEL']),
  remark: z.string().trim().min(1, 'Write your remarks').max(500),
});
export type ProcHoldAnswerInput = z.infer<typeof procHoldAnswerInput>;

/** Prototype: analysisHtml() — the site-wise matrix for the picked lines. */
export const poolAnalysisInput = z.object({
  picks: z.array(poolPick).default([]),
});
export type PoolAnalysisInput = z.infer<typeof poolAnalysisInput>;

export const createRfqInput = z.object({
  picks: z.array(poolPick).min(1, MSG.poolSelectLine),
  vendorIds: z.array(objectId).min(1, MSG.rfqPickVendor),
  /** ISO datetime; must be in the future */
  dueAt: z.string().datetime({ offset: true }),
  note: z.string().trim().max(2000).optional().default(''),
});
export type CreateRfqInput = z.infer<typeof createRfqInput>;

export const extendRfqInput = z.object({
  dueAt: z.string().datetime({ offset: true }),
  rv: z.number().int().min(0).optional(),
});
export type ExtendRfqInput = z.infer<typeof extendRfqInput>;

/**
 * Award: one vendor per RFQ line, plus a reason when any line is not the
 * lowest quote (§8).
 */
export const awardRfqInput = z.object({
  awards: z
    .array(z.object({ rfqLineId: objectId, vendorId: objectId }))
    .min(1),
  reason: z.string().trim().max(500).optional().default(''),
  /** true = submit the POs for approval, false = leave them as drafts */
  submit: z.boolean().default(false),
  rv: z.number().int().min(0).optional(),
});
export type AwardRfqInput = z.infer<typeof awardRfqInput>;

// ---------------------------------------------------------------------------
// Vendor portal
// ---------------------------------------------------------------------------

export const vendorQuoteInput = z.object({
  lines: z
    .array(
      z.object({
        rfqLineId: objectId,
        /** blank/0 means "not quoting this item" */
        rate: money.default(0),
        remark: z.string().trim().max(250).optional().default(''),
      }),
    )
    .min(1),
  leadDays: z.coerce
    .number({ invalid_type_error: MSG.vendorLeadTime })
    .int()
    .min(0, MSG.vendorLeadTime),
  vatPct: money.default(5),
  validity: z.string().optional().default(''),
  terms: z.string().trim().max(200).optional().default(''),
  rv: z.number().int().min(0).optional(),
});
export type VendorQuoteInput = z.infer<typeof vendorQuoteInput>;

/** The uploaded quotation sheet, parsed on the client and posted as rows. */
export const quotationSheetRow = z.object({
  sn: z.number().int().min(1),
  rate: money,
  remark: z.string().optional().default(''),
});
export type QuotationSheetRow = z.infer<typeof quotationSheetRow>;
