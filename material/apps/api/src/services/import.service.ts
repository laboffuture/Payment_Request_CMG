import { randomUUID } from 'node:crypto';
import { num } from '@cm/calc';
import {
  IMPORT_COLS,
  MSG,
  type ImportPreview,
  type ImportRowOk,
  type ImportRowProblem,
} from '@cm/shared';
import { badRequest, notFound } from '../lib/errors.js';
import { buildCsv, parseCsv } from '../lib/csv.js';
import { IMPORT_PREFIX, redis } from '../redis.js';
import { Category, Item } from '../models/masters.js';
import { StockLedger } from '../models/stock.js';
import { activeCategoryNames, activeSubCategoryNames } from './masters.service.js';

/**
 * One-time inventory import.
 * Prototype origin: VIEWS.import, A.tplCsv, impPreview(), A.impRun.
 *
 * The preview is stateless for the client: it is parked in Redis for an hour
 * under a token, and `/import/run` hands that token to the BullMQ `import`
 * queue. That keeps a 5,000-row file out of the request/response cycle.
 */

const PREVIEW_TTL_SECONDS = 60 * 60;

/** Prototype: A.tplCsv — the downloadable template, with two example rows. */
export async function templateCsv(): Promise<string> {
  const cats = await activeCategoryNames();
  const first = cats[0] ?? 'MEP';
  const second = cats[1] ?? 'Civil';
  const [subFirst, subSecond] = await Promise.all([
    activeSubCategoryNames(first),
    activeSubCategoryNames(second),
  ]);

  return [
    IMPORT_COLS.join(','),
    `,Example — PVC conduit 20 mm,Lm,${first},${subFirst[0] ?? ''},500,2.5,Remove example rows`,
    `,Example — Cement OPC 50 kg,Bag,${second},${subSecond[0] ?? ''},120,18,`,
  ].join('\n');
}

const ci = { locale: 'en', strength: 2 } as const;

/**
 * Prototype: impPreview(text). Same rules, same messages:
 *  - the four required columns must be present
 *  - "Example …" rows are skipped, not flagged
 *  - the category must exist; a sub-category must sit under it
 *  - an item that already has OPENING stock is skipped (this is a one-time job)
 */
export async function preview(csvText: string): Promise<ImportPreview> {
  const rows = parseCsv(csvText);
  if (!rows.length) throw badRequest(MSG.importEmpty);

  const header = (rows[0] ?? []).map((h) => h.trim().toLowerCase());
  const indexOf = (name: string) => header.indexOf(name.toLowerCase());

  for (const required of ['Item Name', 'Unit', 'Category', 'Opening Qty']) {
    if (indexOf(required) < 0) throw badRequest(MSG.importMissingColumn(required));
  }

  const categories = await activeCategoryNames();
  const subsByCategory = new Map<string, string[]>();
  for (const cat of categories) {
    subsByCategory.set(cat, await activeSubCategoryNames(cat));
  }

  const ok: ImportRowOk[] = [];
  const bad: ImportRowProblem[] = [];
  const skip: ImportRowProblem[] = [];
  const seen = new Set<string>();

  for (let k = 1; k < rows.length; k += 1) {
    const raw = rows[k]!;
    const rowNo = k + 1;
    const get = (name: string): string => {
      const i = indexOf(name);
      return i >= 0 ? String(raw[i] ?? '').trim() : '';
    };

    const name = get('Item Name');
    const code = get('Item Code');
    const unit = get('Unit') || 'Nos';
    const catIn = get('Category');
    const subIn = get('Sub Category');
    const qtyText = get('Opening Qty');
    const rate = num(get('Rate'));

    if (!name) {
      bad.push({ row: rowNo, err: MSG.importNoName });
      continue;
    }
    if (/^example/i.test(name)) {
      skip.push({ row: rowNo, err: MSG.importExampleRow });
      continue;
    }

    const cat = categories.find((c) => c.toLowerCase() === catIn.toLowerCase());
    if (!cat) {
      bad.push({ row: rowNo, err: MSG.importCategoryUnknown(catIn) });
      continue;
    }

    let sub = '';
    if (subIn) {
      const match = (subsByCategory.get(cat) ?? []).find(
        (s) => s.toLowerCase() === subIn.toLowerCase(),
      );
      if (!match) {
        bad.push({ row: rowNo, err: MSG.importSubCategoryUnknown(subIn, cat) });
        continue;
      }
      sub = match;
    }

    const qty = num(qtyText);
    if (qtyText !== '' && (Number.isNaN(parseFloat(qtyText)) || qty < 0)) {
      bad.push({ row: rowNo, err: MSG.importQtyNumber });
      continue;
    }

    const key = (code || name).toLowerCase();
    if (seen.has(key)) {
      bad.push({ row: rowNo, err: MSG.importDuplicate });
      continue;
    }
    seen.add(key);

    const existing = code
      ? await Item.findOne({ code }).collation(ci).lean()
      : await Item.findOne({ name }).collation(ci).lean();

    if (existing) {
      const hasOpening = await StockLedger.exists({
        itemId: existing._id,
        docType: 'OPENING',
      });
      if (hasOpening) {
        skip.push({
          row: rowNo,
          err: MSG.importAlreadyOpening(existing.code, existing.name),
        });
        continue;
      }
    }

    ok.push({
      row: rowNo,
      code: existing ? existing.code : code,
      name: existing ? existing.name : name,
      unit: existing ? existing.unit : unit,
      cat,
      sub,
      qty,
      rate,
      existing: existing ? String(existing._id) : '',
    });
  }

  const token = randomUUID();
  await redis.set(
    IMPORT_PREFIX + token,
    JSON.stringify(ok),
    'EX',
    PREVIEW_TTL_SECONDS,
  );

  return { ok, bad, skip, token };
}

export async function readPreviewRows(token: string): Promise<ImportRowOk[]> {
  const raw = await redis.get(IMPORT_PREFIX + token);
  if (!raw) {
    throw notFound('That preview has expired — upload the file again');
  }
  return JSON.parse(raw) as ImportRowOk[];
}

export const dropPreview = (token: string): Promise<number> =>
  redis.del(IMPORT_PREFIX + token);

/** Column list used by the categories hint on the import page. */
export const importColumns = (): string[] => [...IMPORT_COLS];

/** A CSV of the rows that could not be imported, for the admin to fix offline. */
export const problemsCsv = (problems: ImportRowProblem[]): string =>
  buildCsv(['Row', 'Problem'], problems.map((p) => ({ Row: p.row, Problem: p.err })));
