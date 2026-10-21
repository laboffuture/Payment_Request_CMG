'use client';

import { create } from 'zustand';
import { measurementKey } from '@cm/shared';

/**
 * The PO wizard's working copy.
 *
 * Prototype origin: `F.po` — the in-memory form the prototype carried between
 * the pool, the wizard's three steps and an edit/revise. It is deliberately not
 * server state: nothing exists in the database until the buyer saves.
 */
export interface PoDraftRow {
  mrLineId: string;
  itemId: string;
  itemCode?: string;
  itemName: string;
  /** procurement's description for the vendor, the same on every row of the item */
  description?: string;
  /** what the site engineer wrote on the MR line — reference only */
  mrDescription?: string;
  /** the size asked for; the same item in another measurement is a separate PO line */
  measurement?: string;
  unit: string;
  projectCode: string;
  mrNo: string;
  qty: number;
  rate: number;
  gstPct: number;
  /** already received against this line — the quantity cannot go below it */
  received: number;
  /** how much of the MR line is still available to take */
  openQty: number;
}

interface PoDraftState {
  rows: PoDraftRow[];
  setRows: (rows: PoDraftRow[]) => void;
  addRow: (row: PoDraftRow) => void;
  removeRow: (mrLineId: string) => void;
  patchRow: (mrLineId: string, patch: Partial<PoDraftRow>) => void;
  /** set the rate and tax for every row carrying this item */
  /** key: groupKeyOf(row) - one rate per item and measurement */
  patchItem: (key: string, patch: Partial<PoDraftRow>) => void;
  clear: () => void;
}

export const usePoDraft = create<PoDraftState>((set) => ({
  rows: [],
  setRows: (rows) => set({ rows }),
  addRow: (row) =>
    set((state) =>
      state.rows.some((r) => r.mrLineId === row.mrLineId)
        ? state
        : { rows: [...state.rows, row] },
    ),
  removeRow: (mrLineId) =>
    set((state) => ({ rows: state.rows.filter((r) => r.mrLineId !== mrLineId) })),
  patchRow: (mrLineId, patch) =>
    set((state) => ({
      rows: state.rows.map((r) => (r.mrLineId === mrLineId ? { ...r, ...patch } : r)),
    })),
  // One rate per item and measurement across the whole PO (§5), so editing one row edits
  // every row of that product - but not the same item in another size, which is priced apart.
  patchItem: (key, patch) =>
    set((state) => ({
      rows: state.rows.map((r) => (groupKeyOf(r) === key ? { ...r, ...patch } : r)),
    })),
  clear: () => set({ rows: [] }),
}));

/** Rows grouped into the one-line-per-item shape the PO is stored in. */
/** One product on the PO: the item and its measurement (another size is another line). */
export const groupKeyOf = (row: { itemId: string; measurement?: string }): string =>
  `${row.itemId}|${measurementKey(row.measurement)}`;

export function groupRows(rows: PoDraftRow[]) {
  const groups = new Map<string, { key: string; measurement: string; itemId: string; itemCode: string; itemName: string; description: string; mrDescriptions: string[]; unit: string; qty: number; rate: number; gstPct: number; projects: string[]; mrNos: string[] }>();

  for (const row of rows) {
    const key = groupKeyOf(row);
    const entry = groups.get(key) ?? {
      key,
      measurement: (row.measurement ?? '').trim(),
      itemId: row.itemId,
      itemCode: row.itemCode ?? '',
      itemName: row.itemName,
      description: '',
      mrDescriptions: [] as string[],
      unit: row.unit,
      qty: 0,
      rate: row.rate,
      gstPct: row.gstPct,
      projects: [] as string[],
      mrNos: [] as string[],
    };
    entry.qty = Math.round((entry.qty + row.qty) * 1000) / 1000;
    entry.rate = row.rate;
    entry.gstPct = row.gstPct;
    if (!entry.projects.includes(row.projectCode)) entry.projects.push(row.projectCode);
    if (row.mrNo && !entry.mrNos.includes(row.mrNo)) entry.mrNos.push(row.mrNo);
    if (!entry.description && row.description) entry.description = row.description;
    const said = (row.mrDescription ?? '').trim();
    if (said && !entry.mrDescriptions.includes(said)) entry.mrDescriptions.push(said);
    groups.set(key, entry);
  }

  return [...groups.values()];
}

/** Prototype: poTotals(f) — the live totals under the price table. */
export function draftTotals(rows: PoDraftRow[], taxMode: string) {
  let subtotal = 0;
  let taxTotal = 0;
  for (const row of rows) {
    const amount = row.qty * row.rate;
    subtotal += amount;
    taxTotal += taxMode === 'NONE' ? 0 : (amount * row.gstPct) / 100;
  }
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return { subtotal: r2(subtotal), taxTotal: r2(taxTotal), total: r2(subtotal + taxTotal) };
}
