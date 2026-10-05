import { Types } from 'mongoose';
import { num, r2 } from '@cm/calc';
import type {
  PoRecommendQuery,
  PoRecommendationsDto,
  VendorSuggestionDto,
} from '@cm/shared';
import { buildLookups } from '../lib/lookups.js';
import { Grn } from '../models/stock.js';
import { Po, PoLine } from '../models/po.js';
import { Quote, RfqLine, RfqVendor } from '../models/rfq.js';

/**
 * Two suggested vendors for the items a buyer has just picked from the pool:
 * the cheapest, and the quickest.
 *
 * Both are read out of what has actually happened — quotes the vendors gave and
 * orders they delivered — not out of anything anybody typed by hand. Neither is
 * binding: the buyer can take one, or ignore both and choose a vendor.
 */

const oid = (v: string) => new Types.ObjectId(v);

/** Every rate a vendor has offered or charged for an item, newest first. */
interface RateFact {
  vendorId: string;
  itemId: string;
  rate: number;
  at: Date;
}

/**
 * Quoted rates. A quote is what a vendor said it would charge, which is the
 * best evidence of what it would charge again.
 */
async function quotedRates(itemIds: string[]): Promise<RateFact[]> {
  const lines = await RfqLine.find({ itemId: { $in: itemIds.map(oid) } })
    .select('itemId')
    .lean();
  if (!lines.length) return [];

  const quotes = await Quote.find({
    rfqLineId: { $in: lines.map((l) => l._id) },
    // 0 means "not quoting this item" — the prototype leaves the box blank.
    rate: { $gt: 0 },
  }).lean();

  const itemByLine = new Map(lines.map((l) => [String(l._id), String(l.itemId)]));

  return quotes.map((q) => ({
    vendorId: String(q.vendorId),
    itemId: itemByLine.get(String(q.rfqLineId))!,
    rate: num(q.rate),
    at: q.createdAt,
  }));
}

/** Rates actually ordered at, from purchase orders that were approved. */
async function orderedRates(itemIds: string[]): Promise<RateFact[]> {
  const lines = await PoLine.find({ itemId: { $in: itemIds.map(oid) } })
    .select('poId itemId rate')
    .lean();
  if (!lines.length) return [];

  const pos = await Po.find({
    _id: { $in: lines.map((l) => l.poId) },
    status: { $in: ['APPROVED', 'PARTIAL', 'RECEIVED'] },
  })
    .select('vendorId approvedAt createdAt')
    .lean();

  const poById = new Map(pos.map((p) => [String(p._id), p]));

  return lines.flatMap((line) => {
    const po = poById.get(String(line.poId));
    if (!po || num(line.rate) <= 0) return [];
    return [
      {
        vendorId: String(po.vendorId),
        itemId: String(line.itemId),
        rate: num(line.rate),
        at: po.approvedAt ?? po.createdAt,
      },
    ];
  });
}

/**
 * What each vendor promised, averaged over its quotes. A promise is all there
 * is to go on for a vendor that has quoted but never yet delivered.
 */
async function promisedLeadDays(): Promise<Map<string, number>> {
  const rows = await RfqVendor.find({ leadDays: { $gt: 0 } })
    .select('vendorId leadDays')
    .lean();

  const byVendor = new Map<string, number[]>();
  for (const row of rows) {
    const key = String(row.vendorId);
    byVendor.set(key, [...(byVendor.get(key) ?? []), num(row.leadDays)]);
  }

  return new Map(
    [...byVendor].map(([vendorId, days]) => [
      vendorId,
      Math.round(days.reduce((a, b) => a + b, 0) / days.length),
    ]),
  );
}

/**
 * What each vendor actually did: days from the order being approved to the
 * first goods arriving, averaged. This is the honest number, so it wins over
 * the promise wherever it exists.
 */
async function measuredDeliveryDays(): Promise<Map<string, number>> {
  // Driven off the receipts rather than the PO's status: a GRN existing *is*
  // what "the goods arrived" means, and a status can move on afterwards.
  const grns = await Grn.find({}).select('poId createdAt').lean();
  if (!grns.length) return new Map();

  // The first receipt against each PO is the one that measures the lead time.
  const firstGrn = new Map<string, Date>();
  for (const grn of grns) {
    const key = String(grn.poId);
    const seen = firstGrn.get(key);
    if (!seen || grn.createdAt < seen) firstGrn.set(key, grn.createdAt);
  }

  const pos = await Po.find({
    _id: { $in: [...firstGrn.keys()].map(oid) },
    approvedAt: { $ne: null },
  })
    .select('vendorId approvedAt')
    .lean();

  const byVendor = new Map<string, number[]>();
  for (const po of pos) {
    const received = firstGrn.get(String(po._id));
    if (!received || !po.approvedAt) continue;

    const days = Math.round(
      (received.getTime() - po.approvedAt.getTime()) / 86_400_000,
    );
    if (days < 0) continue;

    const key = String(po.vendorId);
    byVendor.set(key, [...(byVendor.get(key) ?? []), days]);
  }

  return new Map(
    [...byVendor].map(([vendorId, days]) => [
      vendorId,
      Math.round(days.reduce((a, b) => a + b, 0) / days.length),
    ]),
  );
}

export async function recommendVendors(
  query: PoRecommendQuery,
): Promise<PoRecommendationsDto> {
  const itemIds = [...new Set(query.rows.map((r) => r.itemId))];
  const qtyByItem = new Map<string, number>();
  for (const row of query.rows) {
    qtyByItem.set(row.itemId, num((qtyByItem.get(row.itemId) ?? 0) + num(row.qty)));
  }

  const [quoted, ordered, promised, measured, lookups] = await Promise.all([
    quotedRates(itemIds),
    orderedRates(itemIds),
    promisedLeadDays(),
    measuredDeliveryDays(),
    buildLookups(),
  ]);

  // The most recent rate wins, per vendor per item — a quote from last week
  // says more than a purchase order from last year.
  const latest = new Map<string, RateFact>();
  for (const fact of [...quoted, ...ordered]) {
    const key = `${fact.vendorId}:${fact.itemId}`;
    const seen = latest.get(key);
    if (!seen || fact.at > seen.at) latest.set(key, fact);
  }

  const vendorIds = [...new Set([...latest.values()].map((f) => f.vendorId))];

  const considered: VendorSuggestionDto[] = vendorIds.map((vendorId) => {
    let itemsPriced = 0;
    let estimatedTotal = 0;

    for (const itemId of itemIds) {
      const fact = latest.get(`${vendorId}:${itemId}`);
      if (!fact) continue;
      itemsPriced += 1;
      estimatedTotal += fact.rate * (qtyByItem.get(itemId) ?? 0);
    }

    const leadDays = promised.get(vendorId) ?? null;
    const measuredDays = measured.get(vendorId) ?? null;

    return {
      vendorId,
      vendorName: lookups.vendorName(vendorId),
      itemsPriced,
      itemsTotal: itemIds.length,
      estimatedTotal: r2(estimatedTotal),
      leadDays,
      measuredDays,
      reason: '',
    };
  });

  // A vendor that can price every item is worth more than a cheap partial one,
  // so only fall back to partial coverage when nobody covers the lot.
  const full = considered.filter((v) => v.itemsPriced === itemIds.length);
  const priced = (full.length ? full : considered).filter((v) => v.itemsPriced > 0);

  const byMoney = [...priced].sort((a, b) => a.estimatedTotal - b.estimatedTotal)[0] ?? null;

  const timed = priced.filter((v) => effectiveDays(v) !== null);
  const byTime =
    [...timed].sort((a, b) => effectiveDays(a)! - effectiveDays(b)!)[0] ?? null;

  return {
    byMoney: byMoney ? { ...byMoney, reason: moneyReason(byMoney, priced) } : null,
    byTime: byTime ? { ...byTime, reason: timeReason(byTime) } : null,
    considered: [...priced].sort((a, b) => a.estimatedTotal - b.estimatedTotal),
  };
}

/** Measured delivery beats a promise; a promise beats nothing. */
const effectiveDays = (v: VendorSuggestionDto): number | null =>
  v.measuredDays ?? v.leadDays;

function moneyReason(best: VendorSuggestionDto, all: VendorSuggestionDto[]): string {
  const others = all.filter((v) => v.vendorId !== best.vendorId);
  const next = [...others].sort((a, b) => a.estimatedTotal - b.estimatedTotal)[0];

  const coverage =
    best.itemsPriced === best.itemsTotal
      ? 'all the items'
      : `${best.itemsPriced} of ${best.itemsTotal} items`;

  if (!next) return `Cheapest known rates for ${coverage} — the only vendor with a history here`;

  const saving = r2(next.estimatedTotal - best.estimatedTotal);
  return saving > 0
    ? `Cheapest known rates for ${coverage} — ${saving} less than ${next.vendorName}`
    : `Cheapest known rates for ${coverage}`;
}

function timeReason(best: VendorSuggestionDto): string {
  const coverage =
    best.itemsPriced === best.itemsTotal
      ? 'all the items'
      : `${best.itemsPriced} of ${best.itemsTotal} items`;

  return best.measuredDays !== null
    ? `Delivered in ${best.measuredDays} day(s) on average, and prices ${coverage}`
    : `Quotes a ${best.leadDays}-day lead time, and prices ${coverage}`;
}
