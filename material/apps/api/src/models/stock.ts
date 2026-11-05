import { Schema, Types } from 'mongoose';
import {
  DELIVER_TO,
  ISSUE_STATUSES,
  LEDGER_DOC_TYPES,
  type DeliverTo,
  type IssueStatus,
  type LedgerDocType,
} from '@cm/shared';
import {
  defineModel,
  appendOnlyOptions,
  baseOptions,
  fileSchema,
  optionalRefTo,
  qtyField,
  refTo,
  type StoredFileDoc,
  type Timestamped,
} from './base.js';

// ---------------------------------------------------------------------------
// GRN
// ---------------------------------------------------------------------------

export interface IGrn extends Timestamped {
  no: string;
  poId: Types.ObjectId;
  location: DeliverTo;
  dnNo: string;
  invNo: string;
  remark: string;
  createdBy: Types.ObjectId;
  /** Delivery note / photos taken at receipt. Required for a site receipt. */
  files: StoredFileDoc[];
}

const grnSchema = new Schema<IGrn>(
  {
    no: { type: String, required: true, trim: true },
    poId: refTo('Po'),
    location: { type: String, enum: DELIVER_TO, required: true, index: true },
    dnNo: { type: String, required: true, trim: true },
    invNo: { type: String, default: '' },
    remark: { type: String, default: '' },
    createdBy: refTo('User'),
    files: { type: [fileSchema], default: [] },
  },
  baseOptions(),
);

grnSchema.index({ no: 1 }, { unique: true });
grnSchema.index({ poId: 1, createdAt: -1 });

export const Grn = defineModel<IGrn>('Grn', grnSchema);

export interface IGrnLine extends Timestamped {
  grnId: Types.ObjectId;
  poAllocId: Types.ObjectId;
  qtyReceived: number;
  /** Recorded for the report and the print only — it stays open on the PO. */
  qtyRejected: number;
}

const grnLineSchema = new Schema<IGrnLine>(
  {
    grnId: refTo('Grn'),
    poAllocId: refTo('PoAlloc'),
    qtyReceived: qtyField(false),
    qtyRejected: qtyField(false),
  },
  baseOptions(),
);

export const GrnLine = defineModel<IGrnLine>('GrnLine', grnLineSchema);

// ---------------------------------------------------------------------------
// Issue notes
// ---------------------------------------------------------------------------

export interface IIssue extends Timestamped {
  no: string;
  mrId: Types.ObjectId;
  projectId: Types.ObjectId;
  status: IssueStatus;
  vehicle: string;
  createdBy: Types.ObjectId;
  acceptedBy: Types.ObjectId | null;
  acceptedAt: Date | null;
  remark: string;
  /** What the site attached when accepting the issue: the signed note, a photo. */
  acceptFiles: StoredFileDoc[];
}

const issueSchema = new Schema<IIssue>(
  {
    no: { type: String, required: true, trim: true },
    mrId: refTo('Mr'),
    projectId: refTo('Project'),
    status: {
      type: String,
      enum: ISSUE_STATUSES,
      default: 'ISSUED',
      required: true,
      index: true,
    },
    vehicle: { type: String, default: '' },
    createdBy: refTo('User'),
    acceptedBy: optionalRefTo('User'),
    acceptedAt: { type: Date, default: null },
    remark: { type: String, default: '' },
    acceptFiles: { type: [fileSchema], default: [] },
  },
  baseOptions(),
);

issueSchema.index({ no: 1 }, { unique: true });
// "Issues waiting for my site" — plan decision (d)(7).
issueSchema.index({ status: 1, projectId: 1 });

export const Issue = defineModel<IIssue>('Issue', issueSchema);

export interface IIssueLine extends Timestamped {
  issueId: Types.ObjectId;
  mrLineId: Types.ObjectId;
  itemId: Types.ObjectId;
  qtyIssued: number;
  qtyAccepted: number;
}

const issueLineSchema = new Schema<IIssueLine>(
  {
    issueId: refTo('Issue'),
    mrLineId: refTo('MrLine'),
    itemId: refTo('Item'),
    qtyIssued: qtyField(),
    qtyAccepted: qtyField(false),
  },
  baseOptions(),
);

export const IssueLine = defineModel<IIssueLine>('IssueLine', issueLineSchema);

// ---------------------------------------------------------------------------
// Stock ledger — append only. There is no update or delete route, ever (§5).
// ---------------------------------------------------------------------------

export interface IStockLedger {
  at: Date;
  itemId: Types.ObjectId;
  docType: LedgerDocType;
  docNo: string;
  refNo: string;
  projectId: Types.ObjectId | null;
  mrLineId: Types.ObjectId | null;
  qtyIn: number;
  qtyOut: number;
  note: string;
  createdAt: Date;
}

const stockLedgerSchema = new Schema<IStockLedger>(
  {
    at: { type: Date, required: true, default: Date.now },
    itemId: refTo('Item'),
    docType: { type: String, enum: LEDGER_DOC_TYPES, required: true, index: true },
    docNo: { type: String, default: '' },
    refNo: { type: String, default: '' },
    projectId: optionalRefTo('Project'),
    mrLineId: optionalRefTo('MrLine'),
    qtyIn: qtyField(false),
    qtyOut: qtyField(false),
    note: { type: String, default: '' },
  },
  appendOnlyOptions(),
);

stockLedgerSchema.index({ itemId: 1, at: 1 });

export const StockLedger = defineModel<IStockLedger>('StockLedger', stockLedgerSchema);

// ---------------------------------------------------------------------------
// store stock — the Store Stock register: what the main store holds, kept by
// hand. Separate from the item master and the stock ledger; nothing in the MR,
// PO or GRN flow reads or changes it.
// ---------------------------------------------------------------------------

export interface IStoreStock extends Timestamped {
  /** SS-0001, given on create */
  code: string;
  name: string;
  category: string;
  specification: string;
  brand: string;
  unit: string;
  qty: number;
  /** where in the store: rack, bin, room */
  location: string;
  remarks: string;
  createdBy: Types.ObjectId | null;
  updatedBy: Types.ObjectId | null;
}

const storeStockSchema = new Schema<IStoreStock>(
  {
    code: { type: String, required: true, unique: true },
    name: { type: String, required: true, trim: true },
    category: { type: String, default: '', trim: true },
    specification: { type: String, default: '', trim: true },
    brand: { type: String, default: '', trim: true },
    unit: { type: String, default: '', trim: true },
    qty: { type: Number, default: 0 },
    location: { type: String, default: '', trim: true },
    remarks: { type: String, default: '', trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
  },
  baseOptions(),
);

export const StoreStock = defineModel<IStoreStock>('StoreStock', storeStockSchema);
