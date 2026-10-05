import { Schema, Types } from 'mongoose';
import {
  AUDIT_DOC_TYPES,
  EMAIL_STATUSES,
  EVENT_CODES,
  ROLES,
  type AuditDocType,
  type EmailStatus,
} from '@cm/shared';
import { defineModel, appendOnlyOptions, optionalRefTo, refTo } from './base.js';

// ---------------------------------------------------------------------------
// auditLogs — append only, written inside the same transaction as the change
// ---------------------------------------------------------------------------

export interface IAuditLog {
  docType: AuditDocType;
  docId: Types.ObjectId;
  action: string;
  userId: Types.ObjectId;
  at: Date;
  note: string;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    docType: { type: String, enum: AUDIT_DOC_TYPES, required: true },
    docId: { type: Schema.Types.ObjectId, required: true },
    action: { type: String, required: true },
    userId: refTo('User'),
    at: { type: Date, default: Date.now },
    note: { type: String, default: '' },
  },
  appendOnlyOptions(),
);

auditLogSchema.index({ docType: 1, docId: 1, at: 1 });

export const AuditLog = defineModel<IAuditLog>('AuditLog', auditLogSchema);

// ---------------------------------------------------------------------------
// counters — atomic document numbering inside the transaction (§5)
// ---------------------------------------------------------------------------

export interface ICounter {
  _id: string;
  n: number;
}

const counterSchema = new Schema<ICounter>(
  {
    _id: { type: String, required: true },
    n: { type: Number, default: 0 },
  },
  { versionKey: false, _id: false },
);

export const Counter = defineModel<ICounter>('Counter', counterSchema);

// ---------------------------------------------------------------------------
// notifications
// ---------------------------------------------------------------------------

export interface INotification {
  event: string;
  title: string;
  body: string;
  /** deep link, e.g. "mr:<id>" */
  link: string;
  /** addressed to one user … */
  userId: Types.ObjectId | null;
  /** … or to a whole role (PROC also reaches PROC_MGR) */
  role: string;
  vendorId: Types.ObjectId | null;
  /**
   * The actor. A role-addressed notification must not come back to the person
   * who caused it — plan decision (d)(9). Filtered out when the list is read.
   */
  exceptUserId: Types.ObjectId | null;
  readBy: Types.ObjectId[];
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    event: { type: String, enum: EVENT_CODES, required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    link: { type: String, default: '' },
    userId: optionalRefTo('User'),
    role: { type: String, enum: [...ROLES, ''], default: '' },
    vendorId: optionalRefTo('Vendor'),
    exceptUserId: optionalRefTo('User'),
    readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    createdAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: false, versionKey: false },
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ role: 1, createdAt: -1 });
notificationSchema.index({ vendorId: 1, createdAt: -1 });

export const Notification = defineModel<INotification>('Notification', notificationSchema);

// ---------------------------------------------------------------------------
// emailOutbox — one row per recipient, sent by the worker only (§1)
// ---------------------------------------------------------------------------

export interface IEmailOutbox {
  event: string;
  toUserId: Types.ObjectId | null;
  toRole: string;
  toVendorId: Types.ObjectId | null;
  /** Never mail the actor, even on a role fan-out — plan decision (d)(9). */
  exceptUserId: Types.ObjectId | null;
  subject: string;
  body: string;
  status: EmailStatus;
  tries: number;
  sentAt: Date | null;
  sentTo: string[];
  error: string;
  /** attachment to fetch at send time, e.g. the approved PO's PDF */
  attachPoId: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const emailOutboxSchema = new Schema<IEmailOutbox>(
  {
    event: { type: String, required: true },
    toUserId: optionalRefTo('User'),
    toRole: { type: String, default: '' },
    toVendorId: optionalRefTo('Vendor'),
    exceptUserId: optionalRefTo('User'),
    subject: { type: String, required: true },
    body: { type: String, default: '' },
    status: {
      type: String,
      enum: EMAIL_STATUSES,
      default: 'QUEUED',
      required: true,
      index: true,
    },
    tries: { type: Number, default: 0 },
    sentAt: { type: Date, default: null },
    sentTo: [{ type: String }],
    error: { type: String, default: '' },
    attachPoId: { type: Schema.Types.ObjectId, ref: 'Po', default: null },
  },
  { timestamps: true, versionKey: false },
);

emailOutboxSchema.index({ status: 1, createdAt: 1 });
emailOutboxSchema.index({ createdAt: -1 });

export const EmailOutbox = defineModel<IEmailOutbox>('EmailOutbox', emailOutboxSchema);

// ---------------------------------------------------------------------------
// notifyRules — one row per event code
// ---------------------------------------------------------------------------

export interface INotifyRule {
  _id: string;
  portal: boolean;
  email: boolean;
  vendorEmail: boolean;
}

const notifyRuleSchema = new Schema<INotifyRule>(
  {
    _id: { type: String, required: true },
    portal: { type: Boolean, default: true },
    email: { type: Boolean, default: true },
    vendorEmail: { type: Boolean, default: false },
  },
  { versionKey: false, _id: false, timestamps: true },
);

export const NotifyRule = defineModel<INotifyRule>('NotifyRule', notifyRuleSchema);

// ---------------------------------------------------------------------------
// syncStamp — bumped by every committed write, polled for live refresh (§9)
// ---------------------------------------------------------------------------

export interface ISyncStamp {
  _id: string;
  upd: number;
}

const syncStampSchema = new Schema<ISyncStamp>(
  {
    _id: { type: String, default: 'global' },
    upd: { type: Number, default: 0 },
  },
  { versionKey: false, _id: false },
);

export const SyncStamp = defineModel<ISyncStamp>('SyncStamp', syncStampSchema);
