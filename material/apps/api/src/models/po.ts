import { CURRENCIES, DEFAULT_CURRENCY } from '@cm/shared';
import { Schema, Types } from 'mongoose';
import {
  DELIVER_TO,
  PO_STATUSES,
  TAX_MODES,
  VENDOR_DOC_STATUSES,
  VENDOR_DOC_TYPES,
  type DeliverTo,
  type PoStatus,
  type TaxMode,
  type VendorDocStatus,
  type VendorDocType,
} from '@cm/shared';
import {
  defineModel,
  baseOptions,
  fileSchema,
  moneyField,
  optionalRefTo,
  qtyField,
  refTo,
  type StoredFileDoc,
  type Timestamped,
} from './base.js';

export interface IPo extends Timestamped {
  no: string;
  rev: number;
  status: PoStatus;
  vendorId: Types.ObjectId;
  companyId: Types.ObjectId;
  deliverTo: DeliverTo;
  /** YYYY-MM-DD */
  deliveryDate: string;
  terms: string;
  notes: string;
  taxMode: TaxMode;
  /** the currency the order is placed in; the company's is the default */
  currency: string;
  /** Why this vendor without an enquiry (prototype: PO wizard step 3). */
  reason: string;
  rfqId: Types.ObjectId | null;
  subtotal: number;
  taxTotal: number;
  total: number;
  createdBy: Types.ObjectId;
  /** the Procurement Manager who passed it to QS */
  procMgrBy: Types.ObjectId | null;
  procMgrAt: Date | null;
  /** QS, who confirmed the PO carries what QS asked for */
  qsBy: Types.ObjectId | null;
  qsAt: Date | null;
  qsRemark: string;
  /** management's final approval — what the paper PO signs off */
  approvedBy: Types.ObjectId | null;
  approvedAt: Date | null;
  lastComment: string;
  /** who said it and in which role, so every page can attribute the status */
  lastCommentBy: Types.ObjectId | null;
  lastCommentRole: string;
  vendorAckAt: Date | null;
}

const poSchema = new Schema<IPo>(
  {
    no: { type: String, required: true, trim: true },
    rev: { type: Number, default: 0, min: 0 },
    status: {
      type: String,
      enum: PO_STATUSES,
      default: 'DRAFT',
      required: true,
      index: true,
    },
    vendorId: refTo('Vendor'),
    companyId: refTo('Company'),
    deliverTo: { type: String, enum: DELIVER_TO, default: 'STORE', index: true },
    deliveryDate: { type: String, default: '' },
    terms: { type: String, default: '' },
    notes: { type: String, default: '' },
    taxMode: { type: String, enum: TAX_MODES, default: 'VAT' },
    currency: { type: String, enum: CURRENCIES, default: DEFAULT_CURRENCY },
    reason: { type: String, default: '' },
    rfqId: optionalRefTo('Rfq'),
    subtotal: moneyField(),
    taxTotal: moneyField(),
    total: moneyField(),
    createdBy: refTo('User'),
    procMgrBy: optionalRefTo('User'),
    procMgrAt: { type: Date, default: null },
    qsBy: optionalRefTo('User'),
    qsAt: { type: Date, default: null },
    qsRemark: { type: String, default: '' },
    approvedBy: optionalRefTo('User'),
    approvedAt: { type: Date, default: null },
    lastComment: { type: String, default: '' },
    lastCommentBy: optionalRefTo('User'),
    lastCommentRole: { type: String, default: '' },
    vendorAckAt: { type: Date, default: null },
  },
  baseOptions(),
);

poSchema.index({ no: 1 }, { unique: true });
// The vendor portal only ever reads its own approved POs (§3).
poSchema.index({ vendorId: 1, status: 1 });
// The GRN page: open POs for this location.
poSchema.index({ status: 1, deliverTo: 1 });
poSchema.index({ status: 1, createdBy: 1 });
poSchema.index({ createdAt: -1 });

export const Po = defineModel<IPo>('Po', poSchema);

/** One line per item, one rate per item (§5). */
export interface IPoLine extends Timestamped {
  poId: Types.ObjectId;
  itemId: Types.ObjectId;
  qty: number;
  rate: number;
  gstPct: number;
}

const poLineSchema = new Schema<IPoLine>(
  {
    poId: refTo('Po'),
    itemId: refTo('Item'),
    qty: qtyField(),
    rate: moneyField(true),
    gstPct: { type: Number, default: 0, min: 0 },
  },
  baseOptions(),
);

export const PoLine = defineModel<IPoLine>('PoLine', poLineSchema);

/** How each PO line is split across projects and MR lines. */
export interface IPoAlloc extends Timestamped {
  poId: Types.ObjectId;
  poLineId: Types.ObjectId;
  mrLineId: Types.ObjectId;
  projectId: Types.ObjectId;
  qty: number;
}

const poAllocSchema = new Schema<IPoAlloc>(
  {
    poId: refTo('Po'),
    poLineId: refTo('PoLine'),
    mrLineId: refTo('MrLine'),
    projectId: refTo('Project'),
    qty: qtyField(),
  },
  baseOptions(),
);

poAllocSchema.index({ mrLineId: 1, poId: 1 });

export const PoAlloc = defineModel<IPoAlloc>('PoAlloc', poAllocSchema);

export interface IPoRevision {
  poId: Types.ObjectId;
  rev: number;
  reason: string;
  by: Types.ObjectId;
  at: Date;
  /** Printed in the revision history — plan decision (d)(11). */
  totalBefore: number;
  /** Full pre-revision snapshot, for audit. */
  snapshot: unknown;
  createdAt: Date;
  updatedAt: Date;
}

const poRevisionSchema = new Schema<IPoRevision>(
  {
    poId: refTo('Po'),
    rev: { type: Number, required: true },
    reason: { type: String, required: true },
    by: refTo('User'),
    at: { type: Date, default: Date.now },
    totalBefore: moneyField(),
    snapshot: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true, versionKey: false },
);

export const PoRevision = defineModel<IPoRevision>('PoRevision', poRevisionSchema);

export interface IVendorDoc extends Timestamped {
  poId: Types.ObjectId;
  vendorId: Types.ObjectId;
  docType: VendorDocType;
  docNo: string;
  /** YYYY-MM-DD */
  docDate: string;
  amount: number;
  file: StoredFileDoc;
  status: VendorDocStatus;
  remark: string;
  uploadedBy: Types.ObjectId;
  uploadedAt: Date;
  checkedBy: Types.ObjectId | null;
}

const vendorDocSchema = new Schema<IVendorDoc>(
  {
    poId: refTo('Po'),
    vendorId: refTo('Vendor'),
    docType: { type: String, enum: VENDOR_DOC_TYPES, required: true },
    docNo: { type: String, required: true, trim: true },
    docDate: { type: String, default: '' },
    amount: moneyField(),
    file: { type: fileSchema, required: true },
    status: {
      type: String,
      enum: VENDOR_DOC_STATUSES,
      default: 'SUBMITTED',
      index: true,
    },
    remark: { type: String, default: '' },
    uploadedBy: refTo('User'),
    uploadedAt: { type: Date, default: Date.now },
    checkedBy: optionalRefTo('User'),
  },
  baseOptions(),
);

vendorDocSchema.index({ status: 1, uploadedAt: -1 });
vendorDocSchema.index({ vendorId: 1, uploadedAt: -1 });

export const VendorDoc = defineModel<IVendorDoc>('VendorDoc', vendorDocSchema);
