/**
 * Notification events.
 * Prototype origin: EVENTS and rule().
 *
 * `label` and `goesTo` are the two columns of the Notification settings table.
 * `vendorEmailAllowed` mirrors the prototype's `vend` check — only RFQ_SENT and
 * PO_APPROVED expose the "Email (vendor)" checkbox.
 */

export const EVENT_CODES = [
  'MR_SUBMITTED',
  'MR_PM_APPROVED',
  'MR_PM_REJECTED',
  'MR_APPROVED',
  'MR_SENT_BACK',
  'MR_REJECTED',
  'MR_CLOSED',
  'PROC_LINE_SENT_BACK',
  'PROC_LINE_ANSWERED',
  'RFQ_SENT',
  'RFQ_RESPONSE',
  'QUOTE_SUBMITTED',
  'PO_SUBMITTED',
  'PO_QS_VALIDATION',
  'PO_VALIDATED',
  'PO_VALIDATION_FAILED',
  'PO_APPROVED',
  'PO_REJECTED',
  'VENDOR_DOC',
  'GRN_POSTED',
  'ISSUE_CREATED',
  'ISSUE_ACCEPTED',
] as const;
export type EventCode = (typeof EVENT_CODES)[number];

export interface EventSpec {
  label: string;
  goesTo: string;
  vendorEmailAllowed: boolean;
  /** rule() default when no notifyRules row exists yet */
  defaults: { portal: boolean; email: boolean; vendorEmail: boolean };
}

const ev = (
  label: string,
  goesTo: string,
  vendorEmailAllowed = false,
  vendorEmailDefault = false,
): EventSpec => ({
  label,
  goesTo,
  vendorEmailAllowed,
  defaults: { portal: true, email: true, vendorEmail: vendorEmailDefault },
});

export const EVENTS: Record<EventCode, EventSpec> = {
  MR_SUBMITTED: ev('MR submitted — waiting for the Project Manager', 'Project Manager'),
  MR_PM_APPROVED: ev(
    'MR approved by the Project Manager',
    'QS team · Requester',
  ),
  MR_PM_REJECTED: ev('MR rejected by the Project Manager', 'Requester'),
  MR_APPROVED: ev(
    'MR approved by QS',
    'Requester · Procurement (PO qty) · Store (store qty)',
  ),
  MR_SENT_BACK: ev('MR sent back', 'Requester'),
  MR_REJECTED: ev('MR rejected by QS', 'Requester · Project Manager'),
  MR_CLOSED: ev('MR closed — all received at site', 'Requester · QS'),
  PROC_LINE_SENT_BACK: ev('Procurement sent a material back to QS (query or rejection)', 'QS'),
  PROC_LINE_ANSWERED: ev('QS answered procurement on a material', 'Procurement · Requester'),
  // Prototype rule(): vendor_email defaults to 1 for RFQ_SENT only.
  RFQ_SENT: ev('Enquiry sent / due time changed', 'Invited vendors', true, true),
  RFQ_RESPONSE: ev('Vendor accepted or declined enquiry', 'Procurement'),
  QUOTE_SUBMITTED: ev('Vendor submitted quote', 'Procurement'),
  PO_SUBMITTED: ev(
    'PO waiting for approval (new or revised)',
    'Procurement Manager',
  ),
  PO_QS_VALIDATION: ev(
    'PO approved by the Procurement Manager — QS to validate',
    'QS · Procurement · Requesters · Project Managers',
  ),
  PO_VALIDATED: ev(
    'PO validated by QS — management to approve',
    'Management · Procurement · Requesters · Project Managers',
  ),
  PO_VALIDATION_FAILED: ev(
    'QS found something missing on the PO',
    'Procurement · Procurement Manager · Requesters · Project Managers',
  ),
  PO_APPROVED: ev(
    'PO approved by management — the vendor is told',
    'Procurement · Procurement Manager · QS · Store / Site · Requesters · Vendor',
    true,
    false,
  ),
  PO_REJECTED: ev(
    'PO rejected',
    'Procurement · Procurement Manager · QS · Requesters · Project Managers',
  ),
  VENDOR_DOC: ev('Vendor uploaded invoice / DO', 'Procurement'),
  GRN_POSTED: ev('Goods received (GRN)', 'Procurement · Requesters'),
  ISSUE_CREATED: ev('Material issued to site', 'Requester'),
  ISSUE_ACCEPTED: ev('Site accepted issue', 'Store'),
};

/** Prototype: the '[Chandramari] ' subject prefix in notify(). */
export const EMAIL_SUBJECT_PREFIX = '[Chandramari] ';

export const defaultRule = (code: EventCode) => ({
  _id: code,
  ...EVENTS[code].defaults,
});
