import type { StoreStockDto } from '@cm/shared';
import { inTransaction } from '../db.js';
import { conflict, notFound } from '../lib/errors.js';
import { nextStoreStockCode } from '../lib/counters.js';
import { buildLookups } from '../lib/lookups.js';
import { StoreStock, type IStoreStock } from '../models/stock.js';
import type { Actor } from '../middleware/auth.js';

/**
 * The Store Stock register: what the main store holds, entered by the store or the
 * administrator. It stands on its own - the item master, the stock ledger and the
 * MR / PO / GRN flow neither read nor change it.
 */
export interface StoreStockInput {
  name: string;
  category: string;
  specification: string;
  brand: string;
  unit: string;
  qty: number;
  location: string;
  remarks: string;
}

type Row = IStoreStock & { _id: unknown; rv?: number; updatedAt?: Date };

const toDto = (r: Row, nameOf: (id: unknown) => string): StoreStockDto => ({
  id: String(r._id),
  code: r.code,
  name: r.name,
  category: r.category ?? '',
  specification: r.specification ?? '',
  brand: r.brand ?? '',
  unit: r.unit ?? '',
  qty: Number(r.qty) || 0,
  location: r.location ?? '',
  remarks: r.remarks ?? '',
  updatedAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : '',
  updatedByName: r.updatedBy || r.createdBy ? nameOf(r.updatedBy ?? r.createdBy) : '',
  rv: Number(r.rv ?? 0),
});

export async function listStoreStock(): Promise<StoreStockDto[]> {
  const [rows, lookups] = await Promise.all([
    StoreStock.find({}).sort({ code: 1 }).lean(),
    buildLookups(),
  ]);
  return rows.map((r) => toDto(r as Row, (id) => lookups.userName(id)));
}

export async function createStoreStock(actor: Actor, input: StoreStockInput): Promise<StoreStockDto> {
  const id = await inTransaction(async (session) => {
    const [row] = await StoreStock.create(
      [
        {
          ...input,
          code: await nextStoreStockCode(session),
          createdBy: actor.id,
          updatedBy: actor.id,
        },
      ],
      { session },
    );
    return row!._id;
  });
  const lookups = await buildLookups();
  const saved = await StoreStock.findById(id).lean();
  return toDto(saved as Row, (u) => lookups.userName(u));
}

export async function updateStoreStock(
  actor: Actor,
  id: string,
  input: StoreStockInput & { rv: number },
): Promise<StoreStockDto> {
  const { rv, ...fields } = input;
  const row = await StoreStock.findOneAndUpdate(
    { _id: id, rv },
    { $set: { ...fields, updatedBy: actor.id }, $inc: { rv: 1 } },
    { new: true },
  ).lean();
  if (!row) {
    if (!(await StoreStock.exists({ _id: id }))) throw notFound();
    throw conflict('Someone else changed this entry just now - reload and try again');
  }
  const lookups = await buildLookups();
  return toDto(row as Row, (u) => lookups.userName(u));
}

export async function deleteStoreStock(id: string): Promise<{ code: string }> {
  const row = await StoreStock.findByIdAndDelete(id).lean();
  if (!row) throw notFound();
  return { code: row.code };
}
