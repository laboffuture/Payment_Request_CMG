import {
  MSG,
  SOURCE_LABELS,
  type CategoryDto,
  type CompanyDto,
  type CreateCategoryInput,
  type CreateProjectInput,
  type MasterSource,
  type ProjectDto,
  type UpsertCompanyInput,
  type UpsertVendorInput,
  type VendorDto,
} from '@cm/shared';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import { bumpSyncStamp } from '../lib/sync.js';
import { inTransaction } from '../db.js';
import { nextVendorCode } from '../lib/counters.js';
import { Category, Company, Item, Project, User, Vendor } from '../models/masters.js';
import { Mr } from '../models/mr.js';
import { deleteFile, uploadImage } from '../lib/files.js';

const ci = { locale: 'en', strength: 2 } as const;

// ---------------------------------------------------------------------------
// Vendors — prototype VIEWS.vendors
// ---------------------------------------------------------------------------

export async function listVendors(): Promise<VendorDto[]> {
  const [vendors, logins] = await Promise.all([
    Vendor.find({}).sort({ name: 1 }).lean(),
    User.find({ role: 'VENDOR' }).select('login vendorId active').lean(),
  ]);

  const byVendor = new Map<string, string[]>();
  for (const u of logins) {
    if (!u.vendorId) continue;
    const key = String(u.vendorId);
    if (!byVendor.has(key)) byVendor.set(key, []);
    byVendor.get(key)!.push(u.login);
  }

  return vendors.map((v) => ({
    id: String(v._id),
    rv: v.rv ?? 0,
    createdAt: v.createdAt.toISOString(),
    updatedAt: v.updatedAt.toISOString(),
    code: v.code ?? '',
    name: v.name,
    country: v.country ?? '',
    email: v.email ?? '',
    phone: v.phone ?? '',
    taxNo: v.taxNo ?? '',
    address: v.address ?? '',
    source: v.source as MasterSource,
    sourceLabel: SOURCE_LABELS[v.source as MasterSource],
    portalLogins: byVendor.get(String(v._id)) ?? [],
  }));
}

export async function createVendor(input: UpsertVendorInput): Promise<VendorDto> {
  const clash = await Vendor.findOne({ name: input.name })
    .collation(ci)
    .select('_id')
    .lean();
  if (clash) throw conflict(MSG.vendorNameExists);
  await assertVendorCodeFree(input.code);

  const code = input.code || (await nextVendorCode());
  const vendor = await Vendor.create({ ...input, code, source: 'LOCAL' });
  await bumpSyncStamp();
  return (await listVendors()).find((v) => v.id === String(vendor._id))!;
}

/** Two vendors cannot share a vendor number. */
async function assertVendorCodeFree(code: string, exceptId?: string): Promise<void> {
  if (!code) return;
  const taken = await Vendor.findOne({ code, ...(exceptId ? { _id: { $ne: exceptId } } : {}) })
    .collation(ci)
    .select('_id')
    .lean();
  if (taken) throw conflict(`Vendor number ${code} is already used by another vendor`);
}

/** Payment-app vendors are read-only here (§10). */
export async function updateVendor(
  id: string,
  input: UpsertVendorInput,
): Promise<VendorDto> {
  const vendor = await Vendor.findById(id).exec();
  if (!vendor) throw notFound();
  if (vendor.source === 'PAYMENT_APP') {
    throw forbidden('This vendor comes from the Payment app and is read-only here');
  }

  const clash = await Vendor.findOne({ name: input.name, _id: { $ne: id } })
    .collation(ci)
    .select('_id')
    .lean();
  if (clash) throw conflict(MSG.vendorNameExists);
  await assertVendorCodeFree(input.code, id);

  // A vendor saved without a number (one added before numbers existed) gets the next one.
  Object.assign(vendor, input, { code: input.code || vendor.code || (await nextVendorCode()) });
  await vendor.save();
  await bumpSyncStamp();
  return (await listVendors()).find((v) => v.id === id)!;
}

// ---------------------------------------------------------------------------
// Projects — prototype VIEWS.projects
// ---------------------------------------------------------------------------

export async function listProjects(withCounts = false): Promise<ProjectDto[]> {
  const projects = await Project.find({}).sort({ code: 1 }).lean();

  let counts = new Map<string, number>();
  if (withCounts) {
    const rows = await Mr.aggregate<{ _id: unknown; n: number }>([
      { $group: { _id: '$projectId', n: { $sum: 1 } } },
    ]);
    counts = new Map(rows.map((r) => [String(r._id), r.n]));
  }

  return projects.map((p) => ({
    id: String(p._id),
    rv: p.rv ?? 0,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
    code: p.code,
    name: p.name,
    source: p.source as MasterSource,
    sourceLabel: SOURCE_LABELS[p.source as MasterSource],
    active: !!p.active,
    ...(withCounts ? { mrCount: counts.get(String(p._id)) ?? 0 } : {}),
  }));
}

export async function createProject(
  input: CreateProjectInput,
): Promise<ProjectDto> {
  const clash = await Project.findOne({ code: input.code })
    .collation(ci)
    .select('_id')
    .lean();
  if (clash) throw conflict(MSG.projectCodeExists);

  const project = await Project.create({ ...input, source: 'LOCAL', active: true });
  await bumpSyncStamp();
  return (await listProjects()).find((p) => p.id === String(project._id))!;
}

// ---------------------------------------------------------------------------
// Companies — prototype VIEWS.company
// ---------------------------------------------------------------------------

export const toCompanyDto = (c: Record<string, any>): CompanyDto => ({
  id: String(c._id),
  rv: c.rv ?? 0,
  createdAt: c.createdAt.toISOString(),
  updatedAt: c.updatedAt.toISOString(),
  name: c.name,
  legalName: c.legalName ?? '',
  address: c.address ?? '',
  taxLabel: c.taxLabel ?? 'TRN',
  taxNo: c.taxNo ?? '',
  phone: c.phone ?? '',
  email: c.email ?? '',
  currency: c.currency ?? 'AED',
  taxMode: c.taxMode,
  defaultTax: c.defaultTax ?? 5,
  poTerms: c.poTerms ?? '',
  logoUrl: c.logo?.url ?? null,
  isDefault: !!c.isDefault,
});

export async function listCompanies(): Promise<CompanyDto[]> {
  const rows = await Company.find({}).sort({ isDefault: -1, name: 1 }).lean();
  return rows.map(toCompanyDto);
}

export async function defaultCompany(): Promise<CompanyDto | null> {
  const row =
    (await Company.findOne({ isDefault: true }).lean()) ??
    (await Company.findOne({}).sort({ createdAt: 1 }).lean());
  return row ? toCompanyDto(row) : null;
}

/**
 * Only one company may be the default (§5). Enforced here, in a transaction,
 * rather than with a partial unique index so the swap is atomic.
 */
export async function upsertCompany(
  id: string | null,
  input: UpsertCompanyInput,
): Promise<CompanyDto> {
  return inTransaction(async (session) => {
    let company;
    if (id) {
      company = await Company.findById(id).session(session).exec();
      if (!company) throw notFound();
      Object.assign(company, input);
    } else {
      const [created] = await Company.create([input], { session, ordered: true });
      company = created!;
    }

    // The very first company is always the default.
    const total = await Company.countDocuments({}).session(session);
    if (total === 1) company.isDefault = true;

    await company.save({ session });

    if (company.isDefault) {
      await Company.updateMany(
        { _id: { $ne: company._id }, isDefault: true },
        { $set: { isDefault: false } },
        { session },
      );
    }

    await bumpSyncStamp(session);
    return toCompanyDto(company.toObject());
  });
}

export async function setCompanyLogo(
  id: string,
  file: Express.Multer.File,
): Promise<CompanyDto> {
  const company = await Company.findById(id).exec();
  if (!company) throw notFound();

  const previous = company.logo?.publicId;
  const uploaded = await uploadImage(file, 'logos');
  company.logo = uploaded as never;
  await company.save();
  if (previous) await deleteFile(previous, 'image');

  await bumpSyncStamp();
  return toCompanyDto(company.toObject());
}

export async function removeCompanyLogo(id: string): Promise<CompanyDto> {
  const company = await Company.findById(id).exec();
  if (!company) throw notFound();
  const previous = company.logo?.publicId;
  company.logo = null as never;
  await company.save();
  if (previous) await deleteFile(previous, 'image');
  await bumpSyncStamp();
  return toCompanyDto(company.toObject());
}

// ---------------------------------------------------------------------------
// Categories — prototype VIEWS.cats
// ---------------------------------------------------------------------------

export async function listCategories(): Promise<CategoryDto[]> {
  const [rows, itemCounts] = await Promise.all([
    Category.find({}).sort({ name: 1 }).lean(),
    Item.aggregate<{ _id: string; n: number }>([
      { $group: { _id: '$category', n: { $sum: 1 } } },
    ]),
  ]);
  const counts = new Map(itemCounts.map((r) => [r._id, r.n]));

  const toDto = (c: (typeof rows)[number]): CategoryDto => ({
    id: String(c._id),
    rv: c.rv ?? 0,
    createdAt: c.createdAt.toISOString(),
    updatedAt: c.updatedAt.toISOString(),
    name: c.name,
    parentId: c.parentId ? String(c.parentId) : null,
    active: !!c.active,
  });

  const mains = rows.filter((c) => !c.parentId).map(toDto);
  for (const main of mains) {
    main.children = rows
      .filter((c) => c.parentId && String(c.parentId) === main.id)
      .map(toDto);
    main.itemCount = counts.get(main.name) ?? 0;
  }
  return mains;
}

export async function createCategory(
  input: CreateCategoryInput,
): Promise<CategoryDto[]> {
  const parentId = input.parentId || null;
  if (parentId) {
    const parent = await Category.findById(parentId).select('parentId').lean();
    if (!parent) throw badRequest('Choose a main category');
    if (parent.parentId) {
      throw badRequest('Sub-categories cannot have sub-categories of their own');
    }
  }

  const clash = await Category.findOne({ name: input.name, parentId })
    .collation(ci)
    .select('_id')
    .lean();
  if (clash) throw conflict(MSG.categoryExists);

  await Category.create({ name: input.name, parentId, active: true });
  await bumpSyncStamp();
  return listCategories();
}

/** Prototype: A.toggleCat — deactivate rather than delete, so history survives. */
export async function toggleCategory(id: string): Promise<CategoryDto[]> {
  const category = await Category.findById(id).exec();
  if (!category) throw notFound();
  category.active = !category.active;
  await category.save();
  await bumpSyncStamp();
  return listCategories();
}

/** Active main category names — the item picker's filter. */
export async function activeCategoryNames(): Promise<string[]> {
  const rows = await Category.find({ parentId: null, active: true })
    .select('name')
    .sort({ name: 1 })
    .lean();
  return rows.map((c) => c.name);
}

export async function activeSubCategoryNames(main: string): Promise<string[]> {
  const parent = await Category.findOne({ name: main, parentId: null })
    .collation(ci)
    .select('_id')
    .lean();
  if (!parent) return [];
  const rows = await Category.find({ parentId: parent._id, active: true })
    .select('name')
    .sort({ name: 1 })
    .lean();
  return rows.map((c) => c.name);
}
