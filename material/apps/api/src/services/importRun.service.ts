import type { ImportRowOk } from '@cm/shared';
import { inTransaction } from '../db.js';
import { nextItemCode } from '../lib/counters.js';
import { bumpSyncStamp } from '../lib/sync.js';
import { Item } from '../models/masters.js';
import { StockLedger } from '../models/stock.js';

export interface ImportOutcome {
  newItems: number;
  withStock: number;
}

/**
 * Writes an approved import preview.
 * Prototype: A.impRun.
 *
 * Runs in one transaction: either the whole file lands or none of it does, so a
 * half-imported item master can never happen. The BullMQ `import` worker calls
 * this and reports progress; the tests call it directly.
 */
export async function runImport(
  rows: ImportRowOk[],
  userId: string,
  onProgress?: (percent: number) => void,
): Promise<ImportOutcome> {
  return inTransaction(async (session) => {
    let newItems = 0;
    let withStock = 0;
    const today = new Date().toISOString().slice(0, 10);

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]!;
      let itemId = row.existing;

      if (itemId) {
        // An item we already know: refresh its classification and last rate.
        const update: Record<string, unknown> = {
          category: row.cat,
          subCategory: row.sub || undefined,
        };
        if (row.rate) update.lastRate = row.rate;
        await Item.updateOne(
          { _id: itemId },
          { $set: Object.fromEntries(Object.entries(update).filter(([, v]) => v !== undefined)) },
          { session },
        );
      } else {
        const [created] = await Item.create(
          [
            {
              code: row.code || (await nextItemCode(session)),
              name: row.name,
              unit: row.unit,
              category: row.cat,
              subCategory: row.sub,
              active: true,
              lastRate: row.rate || null,
              createdBy: userId,
            },
          ],
          { session, ordered: true },
        );
        itemId = String(created!._id);
        newItems += 1;
      }

      if (row.qty > 0) {
        await StockLedger.create(
          [
            {
              at: new Date(),
              itemId,
              docType: 'OPENING',
              docNo: 'OPENING',
              refNo: `Import ${today}`,
              qtyIn: row.qty,
              qtyOut: 0,
              note: 'One-time import',
            },
          ],
          { session, ordered: true },
        );
        withStock += 1;
      }

      onProgress?.(Math.round(((i + 1) / rows.length) * 100));
    }

    await bumpSyncStamp(session);
    return { newItems, withStock };
  });
}
