import {
  MSG,
  type CreateItemInput,
  type ItemDto,
  type Unit,
  type UpdateItemInput,
} from '@cm/shared';
import { conflict, notFound } from '../lib/errors.js';
import { inTransaction } from '../db.js';
import { nextItemCode } from '../lib/counters.js';
import { bumpSyncStamp } from '../lib/sync.js';
import { Item, Vendor } from '../models/masters.js';
import { MrLine } from '../models/mr.js';
import { PoLine } from '../models/po.js';
import { RfqLine } from '../models/rfq.js';
import { IssueLine, StockLedger } from '../models/stock.js';
import { logger } from '../logger.js';

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

/**
 * Corrects an item in the master. The code stays as it is: MRs, POs and the stock
 * ledger know the item by it. The name must stay unique, as when an item is added.
 */
export async function updateItem(
  id: string,
  input: UpdateItemInput,
  actorId: string,
): Promise<ItemDto> {
  const item = await Item.findById(id).exec();
  if (!item) throw notFound();

  if (input.name !== undefined) {
    const clash = await Item.findOne({ name: input.name, _id: { $ne: item._id } })
      .collation(ci)
      .select('_id')
      .lean();
    if (clash) throw conflict(MSG.itemExists);
  }

  for (const key of [
    'name',
    'unit',
    'category',
    'subCategory',
    'spec',
    'brand',
    'packing',
    'hsn',
    'gstRate',
    'lastRate',
    'active',
  ] as const) {
    if (input[key] !== undefined) item.set(key, input[key]);
  }
  await item.save();
  await bumpSyncStamp();
  logger.info({ itemId: id, code: item.code, actorId }, 'item master: item updated');
  return getItem(id);
}

/**
 * Removes an item from the master - only one that nothing has used yet. An item on an
 * MR, an enquiry, a PO, an issue or the stock ledger stays, or those documents would
 * point at nothing.
 */
export async function deleteItem(id: string, actorId: string): Promise<{ code: string }> {
  const item = await Item.findById(id).select('code name').lean();
  if (!item) throw notFound();

  const itemId = item._id;
  const [onMr, onRfq, onPo, onIssue, inStock] = await Promise.all([
    MrLine.exists({ itemId }),
    RfqLine.exists({ itemId }),
    PoLine.exists({ itemId }),
    IssueLine.exists({ itemId }),
    StockLedger.exists({ itemId }),
  ]);
  const usedOn = [
    onMr && 'an MR',
    onRfq && 'an enquiry',
    onPo && 'a PO',
    onIssue && 'an issue note',
    inStock && 'the stock ledger',
  ].filter(Boolean);
  if (usedOn.length) {
    throw conflict(
      `${item.code} is already used on ${usedOn.join(', ')} and cannot be deleted. Edit it instead.`,
    );
  }

  await Item.deleteOne({ _id: itemId });
  await bumpSyncStamp();
  logger.info({ itemId: id, code: item.code, name: item.name, actorId }, 'item master: item deleted');
  return { code: item.code };
}

/** Prototype: the "N new item request(s) waiting for QS" banner. */
export const pendingNewItemCount = (): Promise<number> =>
  MrLine.countDocuments({ newStatus: 'PENDING' });
