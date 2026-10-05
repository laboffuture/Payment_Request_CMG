import { MSG, type CreateItemInput, type ItemDto, type Unit } from '@cm/shared';
import { conflict, notFound } from '../lib/errors.js';
import { inTransaction } from '../db.js';
import { nextItemCode } from '../lib/counters.js';
import { bumpSyncStamp } from '../lib/sync.js';
import { Item, Vendor } from '../models/masters.js';
import { MrLine } from '../models/mr.js';

const ci = { locale: 'en', strength: 2 } as const;

const toDto = (
  i: Record<string, any>,
  vendorName?: string | null,
): ItemDto => ({
  id: String(i._id),
  rv: i.rv ?? 0,
  createdAt: i.createdAt.toISOString(),
  updatedAt: i.updatedAt.toISOString(),
  code: i.code,
  name: i.name,
  unit: i.unit as Unit,
  category: i.category,
  subCategory: i.subCategory ?? '',
  spec: i.spec ?? '',
  brand: i.brand ?? '',
  packing: i.packing ?? '',
  hsn: i.hsn ?? '',
  gstRate: i.gstRate ?? null,
  active: !!i.active,
  lastRate: i.lastRate ?? null,
  lastVendorId: i.lastVendorId ? String(i.lastVendorId) : null,
  lastVendorName: vendorName ?? null,
});

export interface ListItemsQuery {
  category?: string;
  q?: string;
  /** the MR item picker shows at most 50 matches */
  limit?: number;
  activeOnly?: boolean;
}

/** Prototype: VIEWS.items and itemList() (the picker). */
export async function listItems(query: ListItemsQuery = {}): Promise<ItemDto[]> {
  const filter: Record<string, unknown> = {};
  if (query.category) filter.category = query.category;
  if (query.activeOnly) filter.active = true;
  if (query.q) {
    // The picker searches code or name, exactly as the prototype does.
    const escaped = query.q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { name: { $regex: escaped, $options: 'i' } },
      { code: { $regex: escaped, $options: 'i' } },
    ];
  }

  const items = await Item.find(filter)
    .sort({ category: 1, name: 1 })
    .limit(query.limit ?? 0)
    .lean();

  const vendorIds = [
    ...new Set(items.map((i) => i.lastVendorId).filter(Boolean).map(String)),
  ];
  const vendors = await Vendor.find({ _id: { $in: vendorIds } })
    .select('name')
    .lean();
  const names = new Map(vendors.map((v) => [String(v._id), v.name]));

  return items.map((i) =>
    toDto(i, i.lastVendorId ? names.get(String(i.lastVendorId)) : null),
  );
}

export async function getItem(id: string): Promise<ItemDto> {
  const item = await Item.findById(id).lean();
  if (!item) throw notFound();
  const vendor = item.lastVendorId
    ? await Vendor.findById(item.lastVendorId).select('name').lean()
    : null;
  return toDto(item, vendor?.name ?? null);
}

/**
 * Prototype: A.addMaster. The duplicate-name check is global and
 * case-insensitive, matching the prototype's `i.name.toLowerCase() === n`.
 */
export async function createItem(
  input: CreateItemInput,
  createdBy: string,
): Promise<ItemDto> {
  return inTransaction(async (session) => {
    const clash = await Item.findOne({ name: input.name })
      .collation(ci)
      .select('code')
      .session(session)
      .lean();
    if (clash) throw conflict(MSG.itemExists);

    const [item] = await Item.create(
      [
        {
          code: await nextItemCode(session),
          name: input.name,
          unit: input.unit,
          category: input.category,
          subCategory: input.subCategory ?? '',
          spec: input.spec ?? '',
          brand: input.brand ?? '',
          packing: input.packing ?? '',
          hsn: input.hsn ?? '',
          gstRate: input.gstRate ?? null,
          active: true,
          lastRate: input.lastRate ?? null,
          createdBy,
        },
      ],
      { session, ordered: true },
    );

    await bumpSyncStamp(session);
    return toDto(item!.toObject());
  });
}

/** Prototype: the "N new item request(s) waiting for QS" banner. */
export const pendingNewItemCount = (): Promise<number> =>
  MrLine.countDocuments({ newStatus: 'PENDING' });
