import { Schema, Types } from 'mongoose';
import {
  MASTER_SOURCES,
  ROLES,
  TAX_MODES,
  UNITS,
  type MasterSource,
  type Role,
  type TaxMode,
  type Unit,
} from '@cm/shared';
import {
  defineModel,
  baseOptions,
  fileSchema,
  moneyField,
  optionalRefTo,
  type StoredFileDoc,
  type Timestamped,
} from './base.js';

// ---------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------

export interface IUser extends Timestamped {
  login: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  /** VENDOR users are bound to exactly one vendor (§3). */
  vendorId: Types.ObjectId | null;
  /** SITE users: empty = every project. */
  projectIds: Types.ObjectId[];
  paymentUserId: string;
  active: boolean;
  emailOn: boolean;
  passwordHash: string;
  failedLogins: number;
  lockedUntil: Date | null;
}

const userSchema = new Schema<IUser>(
  {
    login: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      match: /^[a-z0-9._@-]{2,}$/,
    },
    name: { type: String, required: true, trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    phone: { type: String, default: '', trim: true },
    role: { type: String, enum: ROLES, required: true, index: true },
    vendorId: optionalRefTo('Vendor'),
    projectIds: [{ type: Schema.Types.ObjectId, ref: 'Project' }],
    paymentUserId: { type: String, default: '', index: true },
    active: { type: Boolean, default: true, index: true },
    emailOn: { type: Boolean, default: true },
    passwordHash: { type: String, required: true, select: false },
    failedLogins: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, default: null, select: false },
  },
  baseOptions(),
);

userSchema.index({ login: 1 }, { unique: true });

export const User = defineModel<IUser>('User', userSchema);

// ---------------------------------------------------------------------------
// refreshTokens — rotated on use, revoked on logout / password change (§13)
// ---------------------------------------------------------------------------

export interface IRefreshToken {
  userId: Types.ObjectId;
  tokenHash: string;
  expiresAt: Date;
  userAgent: string;
  ip: string;
  createdAt: Date;
  updatedAt: Date;
}

const refreshTokenSchema = new Schema<IRefreshToken>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    userAgent: { type: String, default: '' },
    ip: { type: String, default: '' },
  },
  { timestamps: true, versionKey: false },
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshToken = defineModel<IRefreshToken>('RefreshToken', refreshTokenSchema);

// ---------------------------------------------------------------------------
// vendors
// ---------------------------------------------------------------------------

export interface IVendor extends Timestamped {
  name: string;
  email: string;
  phone: string;
  taxNo: string;
  address: string;
  source: MasterSource;
  externalId: string;
}

const vendorSchema = new Schema<IVendor>(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, default: '', trim: true, lowercase: true },
    phone: { type: String, default: '', trim: true },
    taxNo: { type: String, default: '', trim: true },
    address: { type: String, default: '' },
    source: { type: String, enum: MASTER_SOURCES, default: 'LOCAL', index: true },
    externalId: { type: String, default: '', index: true },
  },
  baseOptions(),
);

// Case-insensitive uniqueness — "vendor a" and "Vendor A" are the same supplier.
vendorSchema.index(
  { name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } },
);

export const Vendor = defineModel<IVendor>('Vendor', vendorSchema);

// ---------------------------------------------------------------------------
// projects
// ---------------------------------------------------------------------------

export interface IProject extends Timestamped {
  code: string;
  name: string;
  source: MasterSource;
  externalId: string;
  active: boolean;
}

const projectSchema = new Schema<IProject>(
  {
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    source: { type: String, enum: MASTER_SOURCES, default: 'LOCAL', index: true },
    externalId: { type: String, default: '', index: true },
    active: { type: Boolean, default: true },
  },
  baseOptions(),
);

projectSchema.index(
  { code: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } },
);

export const Project = defineModel<IProject>('Project', projectSchema);

// ---------------------------------------------------------------------------
// companies — one profile per billing entity, printed on every PO
// ---------------------------------------------------------------------------

export interface ICompany extends Timestamped {
  name: string;
  legalName: string;
  address: string;
  taxLabel: string;
  taxNo: string;
  phone: string;
  email: string;
  currency: string;
  taxMode: TaxMode;
  defaultTax: number;
  poTerms: string;
  logo: StoredFileDoc | null;
  /** Exactly one true — enforced in the company service, not by an index. */
  isDefault: boolean;
}

const companySchema = new Schema<ICompany>(
  {
    name: { type: String, required: true, trim: true },
    legalName: { type: String, default: '' },
    address: { type: String, default: '' },
    taxLabel: { type: String, default: 'TRN' },
    taxNo: { type: String, default: '' },
    phone: { type: String, default: '' },
    email: { type: String, default: '' },
    currency: { type: String, default: 'AED' },
    taxMode: { type: String, enum: TAX_MODES, default: 'VAT' },
    defaultTax: moneyField(),
    poTerms: { type: String, default: '' },
    logo: { type: fileSchema, default: null },
    isDefault: { type: Boolean, default: false, index: true },
  },
  baseOptions(),
);

export const Company = defineModel<ICompany>('Company', companySchema);

// ---------------------------------------------------------------------------
// categories — main categories and their sub-categories
// ---------------------------------------------------------------------------

export interface ICategory extends Timestamped {
  name: string;
  /** null = a main category */
  parentId: Types.ObjectId | null;
  active: boolean;
}

const categorySchema = new Schema<ICategory>(
  {
    name: { type: String, required: true, trim: true },
    parentId: optionalRefTo('Category'),
    active: { type: Boolean, default: true },
  },
  baseOptions(),
);

categorySchema.index(
  { name: 1, parentId: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } },
);

export const Category = defineModel<ICategory>('Category', categorySchema);

// ---------------------------------------------------------------------------
// items
// ---------------------------------------------------------------------------

export interface IItem extends Timestamped {
  code: string;
  name: string;
  unit: Unit;
  category: string;
  subCategory: string;
  spec: string;
  brand: string;
  packing: string;
  hsn: string;
  gstRate: number | null;
  active: boolean;
  /** Set when a PO is APPROVED — plan decision (d)(2). */
  lastRate: number | null;
  lastVendorId: Types.ObjectId | null;
  createdBy: Types.ObjectId | null;
}

const itemSchema = new Schema<IItem>(
  {
    code: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    unit: { type: String, enum: UNITS, required: true },
    category: { type: String, required: true, index: true },
    subCategory: { type: String, default: '' },
    spec: { type: String, default: '' },
    // From the product lists: maker, pack size, HSN code and GST %. GST is the
    // starting tax on a PO line for this item; the buyer can still change it.
    brand: { type: String, default: '' },
    packing: { type: String, default: '' },
    hsn: { type: String, default: '' },
    gstRate: { type: Number, default: null },
    active: { type: Boolean, default: true, index: true },
    lastRate: { type: Number, default: null },
    lastVendorId: optionalRefTo('Vendor'),
    createdBy: optionalRefTo('User'),
  },
  baseOptions(),
);

itemSchema.index({ code: 1 }, { unique: true });
itemSchema.index(
  { name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } },
);
// Item picker: category filter + search by code or name.
itemSchema.index({ category: 1, name: 1 });

export const Item = defineModel<IItem>('Item', itemSchema);
