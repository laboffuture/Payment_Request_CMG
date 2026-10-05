import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { Unit } from '@cm/shared';
import { connectDb, disconnectDb } from '../db.js';
import { logger } from '../logger.js';
import { redis } from '../redis.js';
import { bumpSyncStamp } from '../lib/sync.js';
import { Category, Item } from '../models/masters.js';

/**
 * Loads the company's product lists into the item master and category tree.
 *
 *   npx tsx src/seed/importProducts.ts
 *
 * The data is products/products.json, made from the Excel lists by
 * products/convert.py (which also writes a report of every cleaning decision).
 *
 * Safe on a live database and safe to run again:
 *  - categories and sub-categories are created only when missing
 *  - an item is matched by its code: new codes are added, known codes have their
 *    name, unit, category, brand, pack, HSN and GST refreshed
 *  - nothing is deleted, and the rate and vendor learned from approved POs are
 *    never touched
 *  - an item whose name is already used by a different code is skipped and listed,
 *    rather than overwriting someone's item
 */

interface Product {
  code: string;
  name: string;
  unit: Unit;
  category: string;
  subCategory: string;
  brand: string;
  packing: string;
  hsn: string;
  gstRate: number | null;
  spec: string;
}

const ci = { locale: 'en', strength: 2 } as const;

async function ensureCategory(name: string, parentId: unknown = null) {
  const found = await Category.findOne({ name, parentId }).collation(ci).lean();
  if (found) return { id: found._id, created: false };
  const made = await Category.create({ name, parentId, active: true });
  return { id: made._id, created: true };
}

async function main(): Promise<void> {
  const file = fileURLToPath(new URL('./products/products.json', import.meta.url));
  const products = JSON.parse(readFileSync(file, 'utf8')) as Product[];

  await connectDb();

  // --- category tree --------------------------------------------------------
  let mains = 0;
  let subs = 0;
  const mainIds = new Map<string, unknown>();
  for (const category of new Set(products.map((p) => p.category))) {
    const r = await ensureCategory(category);
    mainIds.set(category, r.id);
    if (r.created) mains += 1;
  }
  const pairs = new Set(products.filter((p) => p.subCategory).map((p) => `${p.category}\u0000${p.subCategory}`));
  for (const pair of pairs) {
    const [category, sub] = pair.split('\u0000') as [string, string];
    if ((await ensureCategory(sub, mainIds.get(category))).created) subs += 1;
  }

  // --- items -----------------------------------------------------------------
  let added = 0;
  let updated = 0;
  const skipped: string[] = [];
  for (const p of products) {
    const nameTaken = await Item.findOne({ name: p.name, code: { $ne: p.code } })
      .collation(ci)
      .select('code')
      .lean();
    if (nameTaken) {
      skipped.push(`${p.code} "${p.name}" — name already used by ${nameTaken.code}`);
      continue;
    }
    const res = await Item.updateOne(
      { code: p.code },
      {
        $set: {
          name: p.name,
          unit: p.unit,
          category: p.category,
          subCategory: p.subCategory,
          brand: p.brand,
          packing: p.packing,
          hsn: p.hsn,
          gstRate: p.gstRate,
          spec: p.spec,
          active: true,
        },
        $setOnInsert: { lastRate: null, lastVendorId: null },
      },
      { upsert: true, runValidators: true },
    );
    if (res.upsertedCount) added += 1;
    else if (res.modifiedCount) updated += 1;
  }

  await bumpSyncStamp();
  logger.info(
    { products: products.length, added, updated, unchanged: products.length - added - updated - skipped.length, skipped: skipped.length, newMainCategories: mains, newSubCategories: subs },
    'product lists loaded',
  );
  for (const s of skipped) logger.warn(`skipped: ${s}`);

  await disconnectDb();
  await redis.quit();
  process.exit(0);
}

main().catch((err) => {
  logger.error({ err }, 'product import failed');
  process.exit(1);
});
