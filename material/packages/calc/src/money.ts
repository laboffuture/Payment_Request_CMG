/**
 * Rounding helpers. Prototype origin: num(), r2(), sum(), qf(), money().
 *
 * These are the only place rounding happens. Every quantity written to Mongo
 * goes through `num` (3 dp) and every money value through `r2` (2 dp), so a
 * value read back always equals the value the calculation produced.
 */

/** Quantities — 3 decimals. Prototype: num() */
export const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
};

/** Money — 2 decimals. Prototype: r2() */
export const r2 = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
};

/** Prototype: sum(array, fieldOrFn) */
export function sum<T>(
  rows: readonly T[],
  pick: ((row: T) => unknown) | keyof T,
): number {
  let total = 0;
  for (const row of rows) {
    total += num(
      typeof pick === 'function'
        ? (pick as (row: T) => unknown)(row)
        : (row as Record<string, unknown>)[pick as string],
    );
  }
  return num(total);
}

/** Prototype: qf() — quantity for display, trailing zeros dropped. */
export const qf = (v: unknown): string => String(num(v));

/** Prototype: money() — 2 dp with thousands separators, no currency symbol. */
export const fmtMoney = (v: unknown): string =>
  (typeof v === 'number' ? v : parseFloat(String(v ?? '')) || 0).toLocaleString(
    'en-US',
    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  );

export const clampMin0 = (v: number): number => (v > 0 ? num(v) : 0);
