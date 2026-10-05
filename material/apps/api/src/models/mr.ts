import { Schema, Types } from 'mongoose';
import {
  MR_LINE_STATUSES,
  MR_STATUSES,
  NEW_ITEM_STATUSES,
  type MrLineStatus,
  type MrStatus,
  type NewItemStatus,
} from '@cm/shared';
import {
  defineModel,
  fileSchema,
  baseOptions,
  optionalRefTo,
  qtyField,
  refTo,
  type StoredFileDoc,
  type Timestamped,
} from './base.js';

/**
 * Material requests.
 * `no` is empty until the first submit — plan decision (d)(22), which keeps the
 * per-project counter gap-free.
 */
export interface IMr extends Timestamped {
  no: string;
  projectId: Types.ObjectId;
  /** YYYY-MM-DD */
  requiredDate: string;
  remarks: string;
  status: MrStatus;
  createdBy: Types.ObjectId;
  submittedAt: Date | null;
  lastComment: string;
  qsBy: Types.ObjectId | null;
  qsAt: Date | null;
  /** the Project Manager who let it through to QS */
  pmBy: Types.ObjectId | null;
  pmAt: Date | null;
  /** who left the last comment, so the UI can name them and their role */
  lastCommentBy: Types.ObjectId | null;
  lastCommentRole: string;
  /**
   * Optional bill of quantities. A BOQ normally arrives as several sheets, so
   * this is a list; each file is keyed by its own storage id.
   */
  boqFiles: StoredFileDoc[];
  /** the single file the first version of this feature stored — read only */
  boq: StoredFileDoc | null;
  closedAt: Date | null;
}

const mrSchema = new Schema<IMr>(
  {
    // Indexed below with a partial filter, since drafts share the empty string.
    no: { type: String, default: '', trim: true },
    projectId: refTo('Project'),
    requiredDate: { type: String, required: true },
    remarks: { type: String, default: '' },
    status: {
      type: String,
      enum: MR_STATUSES,
      default: 'DRAFT',
      required: true,
      index: true,
    },
    createdBy: refTo('User'),
    submittedAt: { type: Date, default: null },
    lastComment: { type: String, default: '' },
    qsBy: optionalRefTo('User'),
    qsAt: { type: Date, default: null },
    pmBy: optionalRefTo('User'),
    pmAt: { type: Date, default: null },
    lastCommentBy: optionalRefTo('User'),
    lastCommentRole: { type: String, default: '' },
    boqFiles: { type: [fileSchema], default: [] },
    boq: { type: fileSchema, default: null },
    closedAt: { type: Date, default: null },
  },
  baseOptions(),
);

// A number is unique once allocated; drafts (no === '') are exempt.
mrSchema.index(
  { no: 1 },
  { unique: true, partialFilterExpression: { no: { $gt: '' } } },
);
// The two list queries: "my MRs, newest first" and "the QS queue by due date".
mrSchema.index({ createdBy: 1, createdAt: -1 });
mrSchema.index({ status: 1, requiredDate: 1 });
mrSchema.index({ projectId: 1, status: 1 });

export const Mr = defineModel<IMr>('Mr', mrSchema);

/**
 * MR lines live in their own collection so PO allocations, RFQ allocations,
 * issue lines and GRN lines can all point at a stable id (§5).
 */
export interface IMrLine extends Timestamped {
  mrId: Types.ObjectId;
  sn: number;
  /** null while a new item is still waiting for QS */
  itemId: Types.ObjectId | null;
  newItemName: string;
  newUnit: string;
  newCategory: string;
  newSpec: string;
  newStatus: NewItemStatus;
  qty: number;
  /** what is wanted, in the engineer's words — required on submit */
  description: string;
  /** free text: "2400 × 1200 × 12.5 mm", "M20", "6 m lengths" … */
  measurement: string;
  /** the unit this line is ordered in; blank falls back to the item's unit */
  unit: string;
  /**
   * What the site engineer asked for before any approver touched it. Kept so
   * the change a PM or QS made stays visible to everyone.
   */
  requestedQty: number;
  requestedMeasurement: string;
  requestedUnit: string;
  boqRef: string;
  remarks: string;
  /** null until QS splits the line */
  storeQty: number | null;
  poQty: number | null;
  qsRemark: string;
  lineStatus: MrLineStatus;
}

const mrLineSchema = new Schema<IMrLine>(
  {
    mrId: refTo('Mr'),
    sn: { type: Number, required: true },
    itemId: optionalRefTo('Item'),
    newItemName: { type: String, default: '' },
    newUnit: { type: String, default: '' },
    newCategory: { type: String, default: '' },
    newSpec: { type: String, default: '' },
    newStatus: { type: String, enum: NEW_ITEM_STATUSES, default: 'NONE', index: true },
    qty: qtyField(),
    description: { type: String, default: '', maxlength: 400 },
    measurement: { type: String, default: '', maxlength: 120 },
    unit: { type: String, default: '' },
    requestedQty: qtyField(false),
    requestedMeasurement: { type: String, default: '' },
    requestedUnit: { type: String, default: '' },
    boqRef: { type: String, default: '', maxlength: 30 },
    remarks: { type: String, default: '', maxlength: 250 },
    storeQty: { type: Number, default: null, min: 0 },
    poQty: { type: Number, default: null, min: 0 },
    qsRemark: { type: String, default: '' },
    lineStatus: {
      type: String,
      enum: MR_LINE_STATUSES,
      default: 'ACTIVE',
      index: true,
    },
  },
  baseOptions(),
);

mrLineSchema.index({ mrId: 1, sn: 1 });
// The pool and the issue queue both scan approved lines by item.
mrLineSchema.index({ itemId: 1, lineStatus: 1 });

export const MrLine = defineModel<IMrLine>('MrLine', mrLineSchema);
