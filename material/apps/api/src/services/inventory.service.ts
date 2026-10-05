import { lineCalc, num } from '@cm/calc';
import type { InventoryRowDto, LedgerRowDto } from '@cm/shared';
import { Item, Project, StockLedger } from '../models/index.js';
import { loadWorld } from '../lib/world.js';
import { notFound } from '../lib/errors.js';
import { listItems } from './item.service.js';

/**
 * Prototype: VIEWS.inventory and stock(itemId).
 *
 *   On hand   = Opening + In − Out
 *   Reserved  = issuable quantity of every line on an APPROVED MR for the item
 *   Available = On hand − Reserved
 *
 * The three ledger sums come from an aggregation pipeline; `reserved` needs the
 * per-line calculation, so it uses the shared `lineCalc` — the same function the
 * MR detail page and the QS split validation use, which is what keeps the two
 * screens from ever disagreeing.
 */
interface LedgerTotals {
  opening: number;
  in: number;
  out: number;
}

async function ledgerTotals(): Promise<Map<string, LedgerTotals>> {
  const rows = await StockLedger.aggregate<{
    _id: unknown;
    opening: number;
    inQty: number;
    outQty: number;
  }>([
    {
      $group: {
        _id: '$itemId',
        opening: {
          $sum: { $cond: [{ $eq: ['$docType', 'OPENING'] }, '$qtyIn', 0] },
        },
        inQty: {
          $sum: { $cond: [{ $ne: ['$docType', 'OPENING'] }, '$qtyIn', 0] },
        },
        outQty: { $sum: '$qtyOut' },
      },
    },
  ]);

  return new Map(
    rows.map((r) => [
      String(r._id),
      { opening: num(r.opening), in: num(r.inQty), out: num(r.outQty) },
    ]),
  );
}

export interface InventoryQuery {
  category?: string;
  q?: string;
}

export async function inventory(query: InventoryQuery = {}): Promise<InventoryRowDto[]> {
  const [items, totals, world] = await Promise.all([
    listItems({ category: query.category, q: query.q }),
    ledgerTotals(),
    loadWorld(),
  ]);

  // Reserved per item, computed once for every approved line.
  const reserved = new Map<string, number>();
  for (const line of world.mrLines) {
    if (!line.itemId || line.lineStatus === 'REJECTED') continue;
    const mr = world.mrs.find((m) => m.id === line.mrId);
    if (!mr || mr.status !== 'APPROVED') continue;
    const key = String(line.itemId);
    reserved.set(key, num((reserved.get(key) ?? 0) + lineCalc(world, line).issuable));
  }

  return items.map((item) => {
    const t = totals.get(item.id) ?? { opening: 0, in: 0, out: 0 };
    const onHand = num(t.opening + t.in - t.out);
    const res = reserved.get(item.id) ?? 0;
    return {
      ...item,
      itemId: item.id,
      opening: t.opening,
      in: t.in,
      out: t.out,
      onHand,
      reserved: res,
      available: num(onHand - res),
    };
  });
}

/** Prototype: A.ledger — the item movement modal, with a running balance. */
export async function itemLedger(itemId: string): Promise<LedgerRowDto[]> {
  const item = await Item.findById(itemId).select('_id').lean();
  if (!item) throw notFound();

  const rows = await StockLedger.find({ itemId }).sort({ at: 1, _id: 1 }).lean();
  const projectIds = [
    ...new Set(rows.map((r) => r.projectId).filter(Boolean).map(String)),
  ];
  const projects = await Project.find({ _id: { $in: projectIds } })
    .select('code')
    .lean();
  const codes = new Map(projects.map((p) => [String(p._id), p.code]));

  let balance = 0;
  return rows.map((r) => {
    balance = num(balance + num(r.qtyIn) - num(r.qtyOut));
    return {
      id: String(r._id),
      at: r.at.toISOString(),
      docType: r.docType,
      docNo: r.docNo ?? '',
      refNo: r.refNo ?? '',
      projectId: r.projectId ? String(r.projectId) : null,
      projectCode: r.projectId ? (codes.get(String(r.projectId)) ?? null) : null,
      qtyIn: num(r.qtyIn),
      qtyOut: num(r.qtyOut),
      note: r.note ?? '',
      balance,
    };
  });
}
