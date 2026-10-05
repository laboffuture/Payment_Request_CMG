import { Schema, Types } from 'mongoose';
import {
  RFQ_STATUSES,
  RFQ_VENDOR_STATUSES,
  type RfqStatus,
  type RfqVendorStatus,
} from '@cm/shared';
import {
  defineModel,
  baseOptions,
  moneyField,
  qtyField,
  refTo,
  type Timestamped,
} from './base.js';

export interface IRfq extends Timestamped {
  no: string;
  status: RfqStatus;
  dueAt: Date;
  note: string;
  createdBy: Types.ObjectId;
  /** BullMQ job id of the delayed "quotes closed" notification (§6). */
  dueJobId: string;
}

const rfqSchema = new Schema<IRfq>(
  {
    no: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: RFQ_STATUSES,
      default: 'OPEN',
      required: true,
      index: true,
    },
    dueAt: { type: Date, required: true, index: true },
    note: { type: String, default: '' },
    createdBy: refTo('User'),
    dueJobId: { type: String, default: '' },
  },
  baseOptions(),
);

rfqSchema.index({ no: 1 }, { unique: true });
rfqSchema.index({ status: 1, createdAt: -1 });

export const Rfq = defineModel<IRfq>('Rfq', rfqSchema);

/**
 * One RFQ line per item, carrying the MR-line allocations that make up its
 * quantity. Embedded because they are only ever read with their line (§5).
 */
export interface IRfqAlloc {
  mrLineId: Types.ObjectId;
  projectId: Types.ObjectId;
  qty: number;
}

export interface IRfqLine extends Timestamped {
  rfqId: Types.ObjectId;
  itemId: Types.ObjectId;
  qty: number;
  allocs: IRfqAlloc[];
}

const rfqAllocSchema = new Schema<IRfqAlloc>(
  {
    mrLineId: { type: Schema.Types.ObjectId, ref: 'MrLine', required: true },
    projectId: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    qty: qtyField(),
  },
  { _id: false },
);

const rfqLineSchema = new Schema<IRfqLine>(
  {
    rfqId: refTo('Rfq'),
    itemId: refTo('Item'),
    qty: qtyField(),
    allocs: { type: [rfqAllocSchema], default: [] },
  },
  baseOptions(),
);

// lineCalc() asks "how much of this MR line is out on an open enquiry?"
rfqLineSchema.index({ 'allocs.mrLineId': 1 });

export const RfqLine = defineModel<IRfqLine>('RfqLine', rfqLineSchema);

export interface IRfqVendor extends Timestamped {
  rfqId: Types.ObjectId;
  vendorId: Types.ObjectId;
  status: RfqVendorStatus;
  leadDays: number | null;
  /** YYYY-MM-DD */
  validity: string;
  terms: string;
  vatPct: number | null;
  submittedAt: Date | null;
}

const rfqVendorSchema = new Schema<IRfqVendor>(
  {
    rfqId: refTo('Rfq'),
    vendorId: refTo('Vendor'),
    status: {
      type: String,
      enum: RFQ_VENDOR_STATUSES,
      default: 'INVITED',
      required: true,
      index: true,
    },
    leadDays: { type: Number, default: null, min: 0 },
    validity: { type: String, default: '' },
    terms: { type: String, default: '' },
    vatPct: { type: Number, default: null, min: 0 },
    submittedAt: { type: Date, default: null },
  },
  baseOptions(),
);

rfqVendorSchema.index({ rfqId: 1, vendorId: 1 }, { unique: true });
// The vendor portal's own list.
rfqVendorSchema.index({ vendorId: 1, status: 1 });

export const RfqVendor = defineModel<IRfqVendor>('RfqVendor', rfqVendorSchema);

export interface IQuote extends Timestamped {
  rfqId: Types.ObjectId;
  rfqLineId: Types.ObjectId;
  vendorId: Types.ObjectId;
  /** 0 means "not quoting this item" (the prototype leaves the input blank). */
  rate: number;
  remark: string;
}

const quoteSchema = new Schema<IQuote>(
  {
    rfqId: refTo('Rfq'),
    rfqLineId: refTo('RfqLine'),
    vendorId: refTo('Vendor'),
    rate: moneyField(),
    remark: { type: String, default: '' },
  },
  baseOptions(),
);

quoteSchema.index({ rfqLineId: 1, vendorId: 1 }, { unique: true });

export const Quote = defineModel<IQuote>('Quote', quoteSchema);
