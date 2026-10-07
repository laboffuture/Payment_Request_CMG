import type { ClientSession } from 'mongoose';
import {
  ITEM_COUNTER_KEY,
  formatItemCode,
  formatNo,
  grnCounterKey,
  issueCounterKey,
  mrCounterKey,
  poCounterKey,
  rfqCounterKey,
} from '@cm/calc';
import { Counter } from '../models/system.js';

/**
 * Gap-free document numbering.
 * Prototype origin: nextNo(prefix), nextItemCode().
 *
 * The increment happens in the *same* session as the document it numbers, so a
 * rolled-back transaction gives the number back and the sequence never skips.
 */
async function nextValue(key: string, session: ClientSession): Promise<number> {
  const row = await Counter.findOneAndUpdate(
    { _id: key },
    { $inc: { n: 1 } },
    { upsert: true, new: true, session },
  ).lean();
  return row?.n ?? 1;
}

/** `MR-0114-26-0001` — a separate counter per project per year. */
export async function nextMrNo(
  projectCode: string,
  session: ClientSession,
  now?: Date,
): Promise<string> {
  const key = mrCounterKey(projectCode, now);
  return formatNo(key, await nextValue(key, session));
}

export async function nextRfqNo(session: ClientSession, now?: Date): Promise<string> {
  const key = rfqCounterKey(now);
  return formatNo(key, await nextValue(key, session));
}

export async function nextPoNo(session: ClientSession, now?: Date): Promise<string> {
  const key = poCounterKey(now);
  return formatNo(key, await nextValue(key, session));
}

export async function nextGrnNo(session: ClientSession, now?: Date): Promise<string> {
  const key = grnCounterKey(now);
  return formatNo(key, await nextValue(key, session));
}

export async function nextIssueNo(
  session: ClientSession,
  now?: Date,
): Promise<string> {
  const key = issueCounterKey(now);
  return formatNo(key, await nextValue(key, session));
}

/** `V-0001` — the vendor number printed on POs; one global sequence. */
export async function nextVendorCode(session?: ClientSession): Promise<string> {
  const n = await nextValue('vendor', session as ClientSession);
  return `V-${String(n).padStart(4, '0')}`;
}

/** `ITM-00001` — one global sequence, plan decision (d)(6). */
export async function nextItemCode(session: ClientSession): Promise<string> {
  return formatItemCode(await nextValue(ITEM_COUNTER_KEY, session));
}

/**
 * Raise a counter to at least `floor`. Used once at migration time to seed the
 * item counter from existing codes so imported data cannot collide.
 */
export async function ensureCounterFloor(
  key: string,
  floor: number,
  session?: ClientSession,
): Promise<void> {
  // `$max` raises the value only if it is lower, and leaves it alone
  // otherwise — one atomic operation that is safe to repeat on every boot.
  // (Matching on `{ n: { $lt: floor } }` with `upsert` instead would try to
  // insert a second row whenever the counter is already high enough.)
  await Counter.updateOne(
    { _id: key },
    { $max: { n: floor } },
    { upsert: true, ...(session ? { session } : {}) },
  );
}
