import type { TrailRowDto } from '@cm/shared';
import type { AuditDocType } from '@cm/shared';
import { AuditLog } from '../models/system.js';
import { Company, Item, Project, User, Vendor } from '../models/masters.js';

/**
 * Name lookups.
 *
 * Prototype origin: uname(), vname(), pcode(), pname(), item(), company().
 * Those read from a fully-loaded in-browser dataset; here they are small maps
 * built once per request, which keeps the serializers free of per-row queries.
 */
export interface Lookups {
  userName(id: unknown): string;
  vendorName(id: unknown): string;
  projectCode(id: unknown): string;
  projectName(id: unknown): string;
  item(id: unknown): {
    id: string;
    code: string;
    name: string;
    unit: string;
    category: string;
    subCategory: string;
    gstRate: number | null;
    lastRate: number | null;
    lastVendorId: string | null;
  } | null;
}

export async function buildLookups(): Promise<Lookups> {
  const [users, vendors, projects, items] = await Promise.all([
    User.find({}).select('name').lean(),
    Vendor.find({}).select('name').lean(),
    Project.find({}).select('code name').lean(),
    Item.find({}).select('code name unit category subCategory gstRate lastRate lastVendorId').lean(),
  ]);

  const userMap = new Map(users.map((u) => [String(u._id), u.name]));
  const vendorMap = new Map(vendors.map((v) => [String(v._id), v.name]));
  const projectMap = new Map(
    projects.map((p) => [String(p._id), { code: p.code, name: p.name }]),
  );
  const itemMap = new Map(
    items.map((i) => [
      String(i._id),
      {
        id: String(i._id),
        code: i.code,
        name: i.name,
        unit: i.unit as string,
        category: i.category,
        subCategory: i.subCategory ?? '',
        gstRate: i.gstRate ?? null,
        lastRate: i.lastRate ?? null,
        lastVendorId: i.lastVendorId ? String(i.lastVendorId) : null,
      },
    ]),
  );

  return {
    userName: (id) => userMap.get(String(id)) ?? '—',
    vendorName: (id) => vendorMap.get(String(id)) ?? '—',
    projectCode: (id) => projectMap.get(String(id))?.code ?? '—',
    projectName: (id) => {
      const p = projectMap.get(String(id));
      return p ? `${p.code} · ${p.name}` : '—';
    },
    item: (id) => itemMap.get(String(id)) ?? null,
  };
}

/** Prototype: trail(types, id) — the audit log on a detail page. */
export async function trailFor(
  docType: AuditDocType,
  docId: string,
  lookups: Lookups,
): Promise<TrailRowDto[]> {
  const rows = await AuditLog.find({ docType, docId }).sort({ at: 1 }).lean();
  return rows.map((r) => ({
    id: String(r._id),
    at: r.at.toISOString(),
    action: r.action,
    userName: lookups.userName(r.userId),
    note: r.note ?? '',
  }));
}

/** The company a document prints under — its own, or the default. */
export async function companyFor(companyId?: unknown) {
  if (companyId) {
    const own = await Company.findById(companyId).lean();
    if (own) return own;
  }
  return (
    (await Company.findOne({ isDefault: true }).lean()) ??
    (await Company.findOne({}).sort({ createdAt: 1 }).lean())
  );
}

export const today = (): string => new Date().toISOString().slice(0, 10);
