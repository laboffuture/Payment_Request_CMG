/**
 * CSV in and out.
 * Prototype origin: csvParse(t) and download(name, text) — which prefixes a
 * UTF-8 BOM so Excel opens the file in the right encoding (§9).
 */

/** Prototype: csvParse — quoted fields, doubled quotes, CR/LF, BOM stripped. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const input = text.replace(/^﻿/, '');

  for (let i = 0; i < input.length; i += 1) {
    const c = input[i]!;
    if (quoted) {
      if (c === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      quoted = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && input[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }

  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }

  // Drop entirely blank lines, as the prototype does.
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}

const quote = (value: unknown): string =>
  `"${String(value ?? '').replace(/"/g, '""')}"`;

export const csvRow = (values: readonly unknown[]): string =>
  values.map(quote).join(',');

/**
 * Build a CSV body. The BOM is added by `sendCsv`, not here, so a caller that
 * streams several chunks does not repeat it.
 */
export function buildCsv(
  columns: readonly string[],
  rows: readonly Record<string, unknown>[],
): string {
  const lines = [columns.join(',')];
  for (const row of rows) lines.push(csvRow(columns.map((c) => row[c])));
  return lines.join('\n');
}

export const CSV_BOM = '﻿';

export const csvFilename = (base: string): string =>
  `${base}-${new Date().toISOString().slice(0, 10)}.csv`;
