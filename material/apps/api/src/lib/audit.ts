import type { ClientSession, Types } from 'mongoose';
import type { AuditDocType } from '@cm/shared';
import { AuditLog } from '../models/system.js';

/**
 * Prototype: logA(type, id, action, note).
 * Written inside the same transaction as the change it describes (§9), so a
 * failed action leaves no trail entry behind.
 */
export async function writeAudit(
  session: ClientSession,
  docType: AuditDocType,
  docId: Types.ObjectId | string,
  action: string,
  userId: Types.ObjectId | string,
  note = '',
): Promise<void> {
  await AuditLog.create(
    [{ docType, docId, action, userId, at: new Date(), note }],
    { session, ordered: true },
  );
}

/** The exact action strings the prototype writes, so the Trail reads the same. */
export const AUDIT = {
  MR_DRAFT_SAVED: 'Draft saved',
  MR_SUBMITTED: 'Submitted to the Project Manager',
  MR_RESUBMITTED: 'Resubmitted to the Project Manager',
  MR_PM_APPROVED: 'PM approved and passed to QS',
  MR_PM_CHANGED: (n: number) => `PM changed ${n} line(s)`,
  MR_PM_SENT_BACK: 'Sent back by the Project Manager',
  MR_PM_REJECTED: 'Rejected by the Project Manager',
  MR_QS_APPROVED: 'QS approved split',
  MR_QS_CHANGED: (n: number) => `QS changed ${n} line(s)`,
  MR_SENT_BACK: 'Sent back by QS',
  MR_REJECTED: 'Rejected by QS',
  MR_NEW_ITEM_APPROVED: 'New item approved to master',
  MR_NEW_ITEM_MAPPED: 'New item mapped',
  MR_NEW_ITEM_REJECTED: 'New item line rejected',
  MR_CLOSED: 'Closed',
  MR_DELETED: 'Deleted by the administrator',
  MR_ISSUED: 'Material issued',
  MR_SITE_ACCEPTED: (issueNo: string) => `Site accepted ${issueNo}`,

  RFQ_SENT: 'Enquiry sent',
  RFQ_DUE_CHANGED: 'Due time changed',
  RFQ_CANCELLED: 'Enquiry cancelled',
  RFQ_VENDOR_ACCEPTED: 'Vendor accepted',
  RFQ_VENDOR_DECLINED: 'Vendor declined',
  RFQ_QUOTE_SUBMITTED: 'Quote submitted',
  RFQ_QUOTE_UPDATED: 'Quote updated',
  RFQ_AWARDED: 'Awarded',

  PO_DRAFT_CREATED: 'Draft PO created',
  PO_RAISED: 'PO raised',
  PO_EDITED: 'Edited',
  PO_EDITED_SUBMITTED: 'Edited and submitted',
  PO_REVISED: (rev: number) => `Revised (Rev ${rev})`,
  PO_PROC_MGR_APPROVED: 'Procurement Manager approved — sent to QS for validation',
  PO_QS_VALIDATED: 'QS validated — everything QS asked for is on the PO',
  PO_QS_VALIDATION_FAILED: 'QS could not validate — something is missing',
  PO_APPROVED: (rev: number) => `PO approved by management${rev ? ` (Rev ${rev})` : ''}`,
  PO_REJECTED: 'PO rejected — procurement can edit and resubmit',
  PO_MGMT_REJECTED: 'Management rejected the PO',
  PO_CANCELLED: 'PO cancelled — quantities back to pool',
  PO_VENDOR_ACK: 'Vendor acknowledged',
  PO_DOC_UPLOADED: (kind: 'INVOICE' | 'DO') =>
    `${kind === 'DO' ? 'Delivery order' : 'Invoice'} uploaded by vendor`,
  PO_DOC_VERIFIED: 'Document verified',
  PO_DOC_REJECTED: 'Document rejected',
  PO_GRN_POSTED: 'GRN posted',
} as const;
