import type { StoreAvailableDto, StoreStockDto } from '@cm/shared';
import { stock } from '@cm/calc';
import { Types } from 'mongoose';
import { inTransaction } from '../db.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { nextStoreStockCode } from '../lib/counters.js';
import { buildLookups } from '../lib/lookups.js';
import { loadWorld } from '../lib/world.js';
import { Item } from '../models/masters.js';
import { StoreStock, type IStoreStock } from '../models/stock.js';
import type { Actor } from '../middleware/auth.js';

/**
 * The Store Stock register: what the main store holds, entered by the store or the
 * administrator. A row linked to an item master item is that item's stock in the main
 * store: an MR sees it as available, QS can send it from the store, and an issue to site
 * takes it off the register (store.service createIssue).
 */
export interface StoreStockInput {
  name: string;
  category: string;
  specification: string;
  brand: string;
  unit: string;
  qty: number;
  /** item master id, or '' / null for none */
  itemId?: string | null;
  location: string;
  remarks: string;
}

type Row = IStoreStock & { _id: unknown; rv?: number; updatedAt?: Date };

type ItemRef = { code: string; name: string } | undefined;

const toDto = (r: Row, nameOf: (id: unknown) => string, item: ItemRef): StoreStockDto => ({
  id: String(r._id),
  code: r.code,
  name: r.name,
  category: r.category ?? '',
  specification: r.specification ?? '',
  brand: r.brand ?? '',
  unit: r.unit ?? '',
  qty: Number(r.qty) || 0,
  itemId: r.itemId ? String(r.itemId) : '',
  itemCode: item?.code ?? '',
  itemName: item?.name ?? '',
  location: r.location ?? '',
  remarks: r.remarks ?? '',
  updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
  updatedByName: r.updatedBy || r.createdBy ? nameOf(r.updatedBy ?? r.createdBy) : '',
  rv: Number(r.rv ?? 0),
});

async function itemsOf(rows: Row[]): Promise<Map<string, { code: string; name: string }>> {
  const ids = [...new Set(rows.map((r) => r.itemId).filter(Boolean).map(String))];
  if (!ids.length) return new Map();
  const items = await Item.find({ _id: { $in: ids } }).select('code name').lean();
  return new Map(items.map((i) => [String(i._id), { code: i.code, name: i.name }]));
}

async function dtosOf(rows: Row[]): Promise<StoreStockDto[]> {
  const [lookups, items] = await Promise.all([buildLookups(), itemsOf(rows)]);
  return rows.map((r) =>
    toDto(r, (id) => lookups.userName(id), r.itemId ? items.get(String(r.itemId)) : undefined),
  );
}

/** '' or null clears the link; anything else must be an item in the master. */
async function itemLink(itemId: string | null | undefined): Promise<Types.ObjectId | null> {
  if (!itemId) return null;
  if (!Types.ObjectId.isValid(itemId) || !(await Item.exists({ _id: itemId }))) {
    throw badRequest('That item is not in the item master any more - pick it again');
  }
  return new Types.ObjectId(itemId);
}

export async function listStoreStock(): Promise<StoreStockDto[]> {
  const rows = await StoreStock.find({}).sort({ code: 1 }).lean();
  return dtosOf(rows as Row[]);
}

export async function createStoreStock(actor: Actor, input: StoreStockInput): Promise<StoreStockDto> {
  const itemId = await itemLink(input.itemId);
  const id = await inTransaction(async (session) => {
    const [row] = await StoreStock.create(
      [
        {
          ...input,
          itemId,
          code: await nextStoreStockCode(session),
          createdBy: actor.id,
          updatedBy: actor.id,
        },
      ],
      { session },
    );
    return row!._id;
  });
  const saved = await StoreStock.findById(id).lean();
  return (await dtosOf([saved as Row]))[0]!;
}

export async function updateStoreStock(
  actor: Actor,
  id: string,
  input: StoreStockInput & { rv: number },
): Promise<StoreStockDto> {
  const { rv, ...fields } = input;
  const itemId = await itemLink(fields.itemId);
  const row = await StoreStock.findOneAndUpdate(
    { _id: id, rv },
    { $set: { ...fields, itemId, updatedBy: actor.id }, $inc: { rv: 1 } },
    { new: true },
  ).lean();
  if (!row) {
    if (!(await StoreStock.exists({ _id: id }))) throw notFound();
    throw conflict('Someone else changed this entry just now - reload and try again');
  }
  return (await dtosOf([row as Row]))[0]!;
}

export async function deleteStoreStock(id: string): Promise<{ code: string }> {
  const row = await StoreStock.findByIdAndDelete(id).lean();
  if (!row) throw notFound();
  return { code: row.code };
}

/**
 * What the main store can send, per item: everything on hand there (the Store Stock
 * register plus received stock) less what approved MRs are already waiting to be issued.
 * Read by the MR form so the engineer sees what is in the store while picking items.
 */
export async function storeAvailable(): Promise<StoreAvailableDto[]> {
  const world = await loadWorld();
  const ids = new Set<string>([
    ...(world.storeStock ?? []).map((x) => x.itemId),
    ...world.ledger.map((x) => String(x.itemId)),
  ]);
  const items = new Map(world.items.map((i) => [i.id, i]));
  const out: StoreAvailableDto[] = [];
  for (const itemId of ids) {
    const item = items.get(itemId);
    if (!item) continue;
    const s = stock(world, itemId);
    if (s.onHand <= 0) continue;
    out.push({
      itemId,
      code: item.code,
      name: item.name,
      unit: item.unit,
      category: item.category,
      subCategory: item.subCategory ?? '',
      onHand: s.onHand,
      available: Math.max(0, s.available),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}
