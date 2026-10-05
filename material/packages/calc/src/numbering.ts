/**
 * Document numbering (§5).
 * Prototype origin: nextNo(prefix), nextItemCode(), poNo(p).
 *
 * These build the *key* and format the result; the atomic increment itself is
 * done by the API inside the transaction with
 * `counters.findOneAndUpdate({_id: key}, {$inc:{n:1}}, {upsert, new, session})`.
 */

/** Two-digit year, as the prototype does: String(year).slice(2). */
export const yy = (d: Date = new Date()): string =>
  String(d.getFullYear()).slice(2);

/**
 * Prototype: A.saveMR builds the MR prefix from the project code —
 *   'PRJ-0114' -> 'MR-0114'  ->  counter key 'MR-0114-26'
 * and the number is `MR-0114-26-0001`.
 */
export const mrCounterKey = (projectCode: string, d?: Date): string => {
  const digits = String(projectCode)
    .replace(/^PRJ-?/i, '')
    .replace(/[^A-Za-z0-9]/g, '');
  return `MR-${digits}-${yy(d)}`.toUpperCase();
};

export const rfqCounterKey = (d?: Date): string => `RFQ-${yy(d)}`;
export const poCounterKey = (d?: Date): string => `PO-${yy(d)}`;
export const grnCounterKey = (d?: Date): string => `GRN-${yy(d)}`;
export const issueCounterKey = (d?: Date): string => `MIN-${yy(d)}`;

/** Item codes are a single global sequence, not per year. */
export const ITEM_COUNTER_KEY = 'ITM';

/** Prototype: key + '-' + String(n).padStart(4,'0') */
export const formatNo = (key: string, n: number, width = 4): string =>
  `${key}-${String(n).padStart(width, '0')}`;

/** Prototype: 'ITM-' + String(n).padStart(5,'0') */
export const formatItemCode = (n: number): string =>
  `ITM-${String(n).padStart(5, '0')}`;

/** Highest numeric suffix in an existing set of item codes (migration seed). */
export const highestItemCode = (codes: readonly string[]): number => {
  let max = 0;
  for (const code of codes) {
    const n = parseInt(String(code).replace(/\D/g, ''), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max;
};
