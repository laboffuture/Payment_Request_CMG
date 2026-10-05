import type { ClientSession } from 'mongoose';
import { SyncStamp } from '../models/system.js';

/**
 * §9 live refresh: every committed write bumps `syncStamp.upd`; the web app
 * polls GET /api/sync/stamp every 30 s while the tab is visible and invalidates
 * its TanStack Query caches when the number moves.
 *
 * Call this inside the same transaction as the write, so a rollback does not
 * make every open tab refetch for nothing.
 */
export async function bumpSyncStamp(session?: ClientSession): Promise<void> {
  await SyncStamp.updateOne(
    { _id: 'global' },
    { $inc: { upd: 1 } },
    { upsert: true, ...(session ? { session } : {}) },
  );
}

export async function readSyncStamp(): Promise<number> {
  const row = await SyncStamp.findById('global').lean();
  return row?.upd ?? 0;
}
