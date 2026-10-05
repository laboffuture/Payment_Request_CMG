import { z } from 'zod';
import { objectId } from './common.js';

/**
 * One-time inventory import.
 * Prototype origin: impPreview(), A.impRun, IMPORT_COLS.
 *
 * The browser uploads the CSV; the API parses and validates it and returns this
 * preview. The actual write is done by a BullMQ job (`import` queue) so a large
 * file cannot block a request.
 */

export const importRowOk = z.object({
  row: z.number().int(),
  /** blank = a new ITM code will be allocated */
  code: z.string(),
  name: z.string(),
  unit: z.string(),
  cat: z.string(),
  sub: z.string(),
  qty: z.number(),
  rate: z.number(),
  /** id of the matched existing item, else '' */
  existing: z.string(),
});
export type ImportRowOk = z.infer<typeof importRowOk>;

export const importRowProblem = z.object({
  row: z.number().int(),
  err: z.string(),
});
export type ImportRowProblem = z.infer<typeof importRowProblem>;

export const importPreview = z.object({
  ok: z.array(importRowOk),
  bad: z.array(importRowProblem),
  skip: z.array(importRowProblem),
  /** server-side handle so /import/run does not re-upload the file */
  token: z.string(),
});
export type ImportPreview = z.infer<typeof importPreview>;

export const importRunInput = z.object({
  token: z.string().min(1),
});
export type ImportRunInput = z.infer<typeof importRunInput>;

export const importJobStatus = z.object({
  jobId: z.string(),
  state: z.enum([
    'waiting',
    'active',
    'completed',
    'failed',
    'delayed',
    'unknown',
  ]),
  progress: z.number().min(0).max(100),
  newItems: z.number().int().optional(),
  withStock: z.number().int().optional(),
  error: z.string().optional(),
});
export type ImportJobStatus = z.infer<typeof importJobStatus>;

/** GET /items/:id/ledger — prototype A.ledger */
export const ledgerQuery = z.object({
  itemId: objectId,
});
