/**
 * Status machines and their chip labels/colours.
 * Prototype origin: MR_ST, PO_ST, RFQ_ST, RV_ST, IS_ST, DOC_ST, st().
 *
 * Decision (d)(1): the prototype tests for both `SUBMITTED` and `QS_PENDING`
 * but only ever writes `QS_PENDING`. Only `QS_PENDING` exists here.
 */

/** Colour token names as used by the CSS variables (--<tone> / --<tone>s). */
export type ChipTone =
  | 'gry'
  | 'blu'
  | 'pur'
  | 'red'
  | 'ac'
  | 'grn'
  | 'amb';

export interface ChipSpec {
  label: string;
  tone: ChipTone;
}

export const MR_STATUSES = [
  'DRAFT',
  'PM_PENDING',
  'QS_PENDING',
  'SENT_BACK',
  'REJECTED',
  'APPROVED',
  'CLOSED',
] as const;
export type MrStatus = (typeof MR_STATUSES)[number];

/** Prototype: MR_ST */
export const MR_ST: Record<MrStatus, ChipSpec> = {
  DRAFT: { label: 'Draft', tone: 'gry' },
  PM_PENDING: { label: 'With PM', tone: 'amb' },
  QS_PENDING: { label: 'With QS', tone: 'blu' },
  SENT_BACK: { label: 'Sent back', tone: 'pur' },
  REJECTED: { label: 'Rejected', tone: 'red' },
  APPROVED: { label: 'In progress', tone: 'ac' },
  CLOSED: { label: 'Closed', tone: 'grn' },
};

export const MR_LINE_STATUSES = ['ACTIVE', 'REJECTED'] as const;
export type MrLineStatus = (typeof MR_LINE_STATUSES)[number];

/**
 * Procurement can send an approved line back to QS from Consolidate MRs - with a query,
 * or rejecting it. While QS has it the line is out of the pool.
 */
export const PROC_HOLDS = ['NONE', 'QUERY', 'REJECT'] as const;
export type ProcHold = (typeof PROC_HOLDS)[number];

export const NEW_ITEM_STATUSES = [
  'NONE',
  'PENDING',
  'APPROVED',
  'MAPPED',
  'REJECTED',
] as const;
export type NewItemStatus = (typeof NEW_ITEM_STATUSES)[number];

export const PO_STATUSES = [
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
export type PoStatus = (typeof PO_STATUSES)[number];

/** Prototype: PO_ST */
export const PO_ST: Record<PoStatus, ChipSpec> = {
  DRAFT: { label: 'Draft', tone: 'gry' },
  PENDING_APPROVAL: { label: 'With Procurement Manager', tone: 'amb' },
  QS_VALIDATION: { label: 'With QS for validation', tone: 'amb' },
  MGMT_APPROVAL: { label: 'With management', tone: 'amb' },
  APPROVED: { label: 'Approved', tone: 'ac' },
  PARTIAL: { label: 'Part received', tone: 'amb' },
  RECEIVED: { label: 'Received', tone: 'grn' },
  REJECTED: { label: 'Rejected', tone: 'red' },
  CANCELLED: { label: 'Cancelled', tone: 'gry' },
};

export const RFQ_STATUSES = ['OPEN', 'AWARDED', 'CLOSED'] as const;
export type RfqStatus = (typeof RFQ_STATUSES)[number];

/** Prototype: RFQ_ST */
export const RFQ_ST: Record<RfqStatus, ChipSpec> = {
  OPEN: { label: 'Open', tone: 'blu' },
  AWARDED: { label: 'Awarded', tone: 'grn' },
  CLOSED: { label: 'Closed', tone: 'gry' },
};

export const RFQ_VENDOR_STATUSES = [
  'INVITED',
  'ACCEPTED',
  'DECLINED',
  'QUOTED',
] as const;
export type RfqVendorStatus = (typeof RFQ_VENDOR_STATUSES)[number];

/** Prototype: RV_ST */
export const RV_ST: Record<RfqVendorStatus, ChipSpec> = {
  INVITED: { label: 'Invited', tone: 'blu' },
  ACCEPTED: { label: 'Accepted', tone: 'ac' },
  DECLINED: { label: 'Declined', tone: 'red' },
  QUOTED: { label: 'Quoted', tone: 'grn' },
};

export const ISSUE_STATUSES = ['ISSUED', 'ACCEPTED'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

/** Prototype: IS_ST */
export const IS_ST: Record<IssueStatus, ChipSpec> = {
  ISSUED: { label: 'Awaiting site', tone: 'amb' },
  ACCEPTED: { label: 'Accepted', tone: 'grn' },
};

export const VENDOR_DOC_STATUSES = [
  'SUBMITTED',
  'VERIFIED',
  'REJECTED',
] as const;
export type VendorDocStatus = (typeof VENDOR_DOC_STATUSES)[number];

/** Prototype: DOC_ST */
export const DOC_ST: Record<VendorDocStatus, ChipSpec> = {
  SUBMITTED: { label: 'Submitted', tone: 'blu' },
  VERIFIED: { label: 'Verified', tone: 'grn' },
  REJECTED: { label: 'Rejected', tone: 'red' },
};

export const EMAIL_STATUSES = [
  'QUEUED',
  'SENDING',
  'SENT',
  'FAILED',
  'SKIPPED',
] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

/** Prototype: the outbox status chips on VIEWS.outbox. */
export const EMAIL_ST: Record<EmailStatus, ChipSpec> = {
  QUEUED: { label: 'Queued', tone: 'amb' },
  SENDING: { label: 'Sending', tone: 'blu' },
  SENT: { label: 'Sent', tone: 'grn' },
  FAILED: { label: 'Failed', tone: 'red' },
  SKIPPED: { label: 'No address', tone: 'gry' },
};

/** Prototype: st() — unknown statuses fall back to a grey chip of their own name. */
export const chipFor = <T extends string>(
  map: Record<string, ChipSpec>,
  status: T,
): ChipSpec => map[status] ?? { label: status, tone: 'gry' };

// ---------------------------------------------------------------------------
// Legal transitions (§6). Services reject anything not listed with 409.
// ---------------------------------------------------------------------------

export const MR_TRANSITIONS: Record<MrStatus, readonly MrStatus[]> = {
  DRAFT: ['PM_PENDING'],
  // The Project Manager checks it first, then the Quantity Surveyor.
  PM_PENDING: ['QS_PENDING', 'SENT_BACK', 'REJECTED'],
  QS_PENDING: ['APPROVED', 'SENT_BACK', 'REJECTED'],
  SENT_BACK: ['PM_PENDING'],
  REJECTED: [],
  APPROVED: ['CLOSED'],
  CLOSED: [],
};

/**
 * A PO is checked three times before the vendor ever sees it: the Procurement
 * Manager approves it, QS validates that it really carries what QS asked for,
 * and management gives the final word.
 */
export const PO_TRANSITIONS: Record<PoStatus, readonly PoStatus[]> = {
  DRAFT: ['PENDING_APPROVAL', 'CANCELLED'],
  PENDING_APPROVAL: ['QS_VALIDATION', 'REJECTED', 'CANCELLED'],
  QS_VALIDATION: ['MGMT_APPROVAL', 'REJECTED', 'CANCELLED'],
  MGMT_APPROVAL: ['APPROVED', 'REJECTED', 'CANCELLED'],
  // APPROVED -> PENDING_APPROVAL is a revision (rev + 1).
  APPROVED: ['PARTIAL', 'RECEIVED', 'PENDING_APPROVAL', 'CANCELLED'],
  PARTIAL: ['RECEIVED', 'APPROVED', 'PENDING_APPROVAL'],
  RECEIVED: ['PARTIAL'],
  REJECTED: ['PENDING_APPROVAL', 'DRAFT', 'CANCELLED'],
  CANCELLED: [],
};

export const RFQ_TRANSITIONS: Record<RfqStatus, readonly RfqStatus[]> = {
  OPEN: ['AWARDED', 'CLOSED'],
  AWARDED: [],
  CLOSED: [],
};

export const RFQ_VENDOR_TRANSITIONS: Record<
  RfqVendorStatus,
  readonly RfqVendorStatus[]
> = {
  INVITED: ['ACCEPTED', 'DECLINED'],
  ACCEPTED: ['QUOTED', 'DECLINED'],
  QUOTED: ['QUOTED'],
  DECLINED: [],
};

export const ISSUE_TRANSITIONS: Record<IssueStatus, readonly IssueStatus[]> = {
  ISSUED: ['ACCEPTED'],
  ACCEPTED: [],
};

export const VENDOR_DOC_TRANSITIONS: Record<
  VendorDocStatus,
  readonly VendorDocStatus[]
> = {
  SUBMITTED: ['VERIFIED', 'REJECTED'],
  VERIFIED: [],
  REJECTED: [],
};

export const canTransition = <T extends string>(
  table: Record<string, readonly string[]>,
  from: T,
  to: T,
): boolean => (table[from] ?? []).includes(to);
