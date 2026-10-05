import { EVENT_CODES, defaultRule } from '@cm/shared';
import { ITEM_COUNTER_KEY, highestItemCode } from '@cm/calc';
import { ensureCounterFloor } from '../lib/counters.js';
import { Item } from '../models/masters.js';
import { NotifyRule, SyncStamp } from '../models/system.js';
import { logger } from '../logger.js';

/**
 * Idempotent start-up housekeeping — safe to run on every boot, in production
 * too. It does not create any business data.
 */
export async function ensureSystemDefaults(): Promise<void> {
  await SyncStamp.updateOne(
    { _id: 'global' },
    { $setOnInsert: { upd: 0 } },
    { upsert: true },
  );

  // A notification rule row per event, so the settings table is never empty.
  await NotifyRule.bulkWrite(
    EVENT_CODES.map((code) => {
      const d = defaultRule(code);
      return {
        updateOne: {
          filter: { _id: code },
          update: {
            $setOnInsert: {
              portal: d.portal,
              email: d.email,
              vendorEmail: d.vendorEmail,
            },
          },
          upsert: true,
        },
      };
    }),
  );

  // Plan decision (d)(6): the item counter replaces the prototype's max(code)
  // scan, so it has to start above whatever codes already exist.
  const codes = await Item.find({}).select('code').lean();
  const floor = highestItemCode(codes.map((i) => i.code));
  if (floor > 0) await ensureCounterFloor(ITEM_COUNTER_KEY, floor);

  logger.info({ itemCounterFloor: floor }, 'system defaults ready');
}
