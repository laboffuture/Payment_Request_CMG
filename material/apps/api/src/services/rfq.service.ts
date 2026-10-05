import { Types } from 'mongoose';
import { num, r2 } from '@cm/calc';
import {
  DEFAULT_PAYMENT_TERMS,
  MSG,
  type AwardRfqInput,
  type CreateRfqInput,
  type ExtendRfqInput,
  type QuoteCellDto,
  type RfqDetailDto,
  type RfqDto,
  type RfqLineDto,
  type RfqVendorDto,
  type VendorQuoteInput,
  type VendorRfqDto,
} from '@cm/shared';
import { inTransaction } from '../db.js';
import { AUDIT, writeAudit } from '../lib/audit.js';
import { nextRfqNo } from '../lib/counters.js';
import { badRequest, conflict, forbidden, notFound, stale } from '../lib/errors.js';
import { emit } from '../lib/notify.js';
import { bumpSyncStamp } from '../lib/sync.js';
import { buildLookups, trailFor, type Lookups } from '../lib/lookups.js';
import { cancelRfqDue, enqueueEmails, queuesAvailable, scheduleRfqDue } from '../jobs/queues.js';
import { Quote, Rfq, RfqLine, RfqVendor } from '../models/rfq.js';
import { Mr, MrLine } from '../models/mr.js';
import { Vendor } from '../models/masters.js';
import type { Actor } from '../middleware/auth.js';
import { resolvePicks } from './pool.service.js';

/**
 * Enquiries and the vendor's side of them.
 * Prototype origin: VIEWS.rfqs / rfqview / vhome / vrfq, A.createRFQ,
 * A.doExtend, A.closeRFQ, A.awardRFQ, A.vAccept, A.vDecline, A.vQuote.
 */

const oid = (v: string) => new Types.ObjectId(v);

const addDays = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

function toRfqDto(
  rfq: Record<string, any>,
  lookups: Lookups,
  extra: { lineCount: number; projectCodes: string[]; quoted: number; vendors: number },
): RfqDto {
  return {
    id: String(rfq._id),
    rv: rfq.rv ?? 0,
    createdAt: rfq.createdAt.toISOString(),
    updatedAt: rfq.updatedAt.toISOString(),
    no: rfq.no,
    status: rfq.status,
    dueAt: rfq.dueAt.toISOString(),
    note: rfq.note ?? '',
    createdBy: String(rfq.createdBy),
    createdByName: lookups.userName(rfq.createdBy),
    lineCount: extra.lineCount,
    projectCodes: extra.projectCodes,
    quotedCount: extra.quoted,
    vendorCount: extra.vendors,
  };
}

const toVendorRow = (
  row: Record<string, any>,
  lookups: Lookups,
  dueAt: Date,
): RfqVendorDto => ({
  id: String(row._id),
  vendorId: String(row.vendorId),
  vendorName: lookups.vendorName(row.vendorId),
  status: row.status,
  leadDays: row.leadDays ?? null,
  validity: row.validity || null,
  terms: row.terms ?? '',
  vatPct: row.vatPct ?? null,
  submittedAt: row.submittedAt ? row.submittedAt.toISOString() : null,
  late: !!row.submittedAt && row.submittedAt > dueAt,
});

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listRfqs(): Promise<RfqDto[]> {
  const [rfqs, lookups] = await Promise.all([
    Rfq.find({}).sort({ createdAt: -1 }).lean(),
    buildLookups(),
  ]);

  const ids = rfqs.map((r) => r._id);
  const [lines, vendors] = await Promise.all([
    RfqLine.find({ rfqId: { $in: ids } }).select('rfqId allocs').lean(),
    RfqVendor.find({ rfqId: { $in: ids } }).select('rfqId status').lean(),
  ]);

  return rfqs.map((rfq) => {
    const key = String(rfq._id);
    const myLines = lines.filter((l) => String(l.rfqId) === key);
    const myVendors = vendors.filter((v) => String(v.rfqId) === key);
    const projects = new Set(
      myLines.flatMap((l) => (l.allocs ?? []).map((a) => String(a.projectId))),
    );

    return toRfqDto(rfq, lookups, {
      lineCount: myLines.length,
      projectCodes: [...projects].map(lookups.projectCode),
      quoted: myVendors.filter((v) => v.status === 'QUOTED').length,
      vendors: myVendors.length,
    });
  });
}

export async function getRfq(actor: Actor, id: string): Promise<RfqDetailDto> {
  if (actor.role === 'VENDOR') throw forbidden();

  const rfq = await Rfq.findById(id).lean();
  if (!rfq) throw notFound();

  const [lines, vendorRows, lookups] = await Promise.all([
    RfqLine.find({ rfqId: id }).lean(),
    RfqVendor.find({ rfqId: id }).lean(),
    buildLookups(),
  ]);

  const quotes = await Quote.find({ rfqId: id }).lean();
  const mrLineIds = lines.flatMap((l) => (l.allocs ?? []).map((a) => a.mrLineId));
  const mrLines = await MrLine.find({ _id: { $in: mrLineIds } }).select('mrId').lean();
  const mrs = await Mr.find({ _id: { $in: mrLines.map((l) => l.mrId) } })
    .select('no')
    .lean();

  const mrNoByLine = new Map(
    mrLines.map((l) => [
      String(l._id),
      {
        mrId: String(l.mrId),
        mrNo: mrs.find((m) => String(m._id) === String(l.mrId))?.no ?? '',
      },
    ]),
  );

  const quoting = vendorRows.filter((v) => v.status === 'QUOTED');

  const lineDtos: RfqLineDto[] = lines.map((line) => {
    const item = lookups.item(line.itemId)!;
    return {
      id: String(line._id),
      itemId: item.id,
      itemCode: item.code,
      itemName: item.name,
      unit: item.unit,
      qty: num(line.qty),
      lastRate: item.lastRate,
      allocs: (line.allocs ?? []).map((a) => {
        const mr = mrNoByLine.get(String(a.mrLineId));
        return {
          mrLineId: String(a.mrLineId),
          mrId: mr?.mrId ?? '',
          mrNo: mr?.mrNo ?? '',
          projectId: String(a.projectId),
          projectCode: lookups.projectCode(a.projectId),
          qty: num(a.qty),
        };
      }),
    };
  });

  // The comparison matrix, with the lowest rate per line marked (§8).
  const cells: Record<string, QuoteCellDto[]> = {};
  const l1: Record<string, string | null> = {};
  const totalsByVendor: Record<string, number> = {};
  for (const v of quoting) totalsByVendor[String(v.vendorId)] = 0;

  for (const line of lineDtos) {
    const row: QuoteCellDto[] = [];
    let best: { vendorId: string; rate: number } | null = null;

    for (const vendor of quoting) {
      const vendorId = String(vendor.vendorId);
      const quote = quotes.find(
        (q) => String(q.rfqLineId) === line.id && String(q.vendorId) === vendorId,
      );
      const rate = num(quote?.rate ?? 0);
      if (rate > 0 && (!best || rate < best.rate)) best = { vendorId, rate };

      const amount = r2(rate * line.qty);
      totalsByVendor[vendorId] = r2((totalsByVendor[vendorId] ?? 0) + amount);

      row.push({
        vendorId,
        rate,
        remark: quote?.remark ?? '',
        amount,
        isL1: false,
      });
    }

    l1[line.id] = best?.vendorId ?? null;
    for (const cell of row) cell.isL1 = !!best && cell.vendorId === best.vendorId && cell.rate > 0;
    cells[line.id] = row;
  }

  const lastRatesTotal = r2(
    lineDtos.reduce((sum, l) => sum + num(l.lastRate ?? 0) * l.qty, 0),
  );

  const projects = new Set(lineDtos.flatMap((l) => l.allocs.map((a) => a.projectId)));

  return {
    ...toRfqDto(rfq, lookups, {
      lineCount: lines.length,
      projectCodes: [...projects].map(lookups.projectCode),
      quoted: quoting.length,
      vendors: vendorRows.length,
    }),
    lines: lineDtos,
    vendors: vendorRows.map((v) => toVendorRow(v, lookups, rfq.dueAt)),
    quotes: cells,
    l1,
    totalsByVendor,
    lastRatesTotal,
    trail: await trailFor('RFQ', id, lookups),
    closed: rfq.status !== 'OPEN' || rfq.dueAt.getTime() < Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Create — prototype A.createRFQ
// ---------------------------------------------------------------------------

export async function createRfq(
  actor: Actor,
  input: CreateRfqInput,
): Promise<{ id: string; no: string }> {
  const dueAt = new Date(input.dueAt);
  if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() <= Date.now()) {
    throw badRequest(MSG.rfqDueFuture);
  }

  const picks = await resolvePicks(input.picks);

  const vendors = await Vendor.find({ _id: { $in: input.vendorIds.map(oid) } })
    .select('_id')
    .lean();
  if (!vendors.length) throw badRequest(MSG.rfqPickVendor);

  const result = await inTransaction(async (session) => {
    const [rfq] = await Rfq.create(
      [
        {
          no: await nextRfqNo(session),
          status: 'OPEN',
          dueAt,
          note: input.note,
          createdBy: actor.id,
        },
      ],
      { session, ordered: true },
    );

    // One RFQ line per item, carrying every MR-line allocation behind it.
    const byItem = new Map<string, typeof picks>();
    for (const pick of picks) {
      const key = pick.row.itemId;
      byItem.set(key, [...(byItem.get(key) ?? []), pick]);
    }

    const lines = [];
    for (const [itemId, group] of byItem) {
      const [line] = await RfqLine.create(
        [
          {
            rfqId: rfq!._id,
            itemId,
            qty: num(group.reduce((sum, g) => sum + g.pick.qty, 0)),
            allocs: group.map((g) => ({
              mrLineId: oid(g.pick.mrLineId),
              projectId: oid(g.row.projectId),
              qty: g.pick.qty,
            })),
          },
        ],
        { session, ordered: true },
      );
      lines.push({ line: line!, itemName: group[0]!.row.itemName, unit: group[0]!.row.unit });
    }

    const body = lines
      .map((l) => `• ${l.itemName}: ${num(l.line.qty)} ${l.unit}`)
      .join('\n');

    const outbox: string[] = [];
    for (const vendor of vendors) {
      await RfqVendor.create(
        [{ rfqId: rfq!._id, vendorId: vendor._id, status: 'INVITED' }],
        { session, ordered: true },
      );

      const ids = await emit(session, 'RFQ_SENT', {
        title: `New enquiry ${rfq!.no} from Chandramari — submit by ${dueAt.toISOString()}`,
        body: body + (input.note ? `\n\n${input.note}` : ''),
        link: `rfq:${String(rfq!._id)}`,
        vendorLink: `vrfq:${String(rfq!._id)}`,
        to: [{ role: 'VENDOR', vendorId: String(vendor._id) }],
        actorId: actor.id,
      });
      outbox.push(...ids);
    }

    await writeAudit(
      session,
      'RFQ',
      rfq!._id,
      AUDIT.RFQ_SENT,
      actor.id,
      `${vendors.length} vendor(s) · due ${dueAt.toISOString()}`,
    );
    await bumpSyncStamp(session);

    return { id: String(rfq!._id), no: rfq!.no, outbox };
  });

  await enqueueEmails(result.outbox);
  // §6: a delayed job tells procurement when quotes close.
  if (queuesAvailable()) {
    const jobId = await scheduleRfqDue(result.id, dueAt);
    await Rfq.updateOne({ _id: result.id }, { $set: { dueJobId: jobId } });
  }

  return { id: result.id, no: result.no };
}

/** Prototype: A.doExtend — change the due time and re-notify the vendors. */
export async function extendRfq(
  actor: Actor,
  id: string,
  input: ExtendRfqInput,
): Promise<void> {
  const dueAt = new Date(input.dueAt);
  if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() <= Date.now()) {
    throw badRequest(MSG.rfqDueFuturePick);
  }

  const { outbox, previousJob } = await inTransaction(async (session) => {
    const rfq = await Rfq.findById(id).session(session);
    if (!rfq) throw notFound();
    if (rfq.status !== 'OPEN') throw conflict('This enquiry is no longer open');
    if (input.rv !== undefined && input.rv !== (rfq.rv ?? 0)) throw stale();

    const previous = rfq.dueJobId;
    rfq.dueAt = dueAt;
    await rfq.save({ session });

    const invited = await RfqVendor.find({
      rfqId: rfq._id,
      status: { $ne: 'DECLINED' },
    })
      .select('vendorId')
      .session(session)
      .lean();

    const ids: string[] = [];
    for (const vendor of invited) {
      ids.push(
        ...(await emit(session, 'RFQ_SENT', {
          title: `${rfq.no}: due time changed to ${dueAt.toISOString()}`,
          link: `rfq:${String(rfq._id)}`,
          vendorLink: `vrfq:${String(rfq._id)}`,
          to: [{ role: 'VENDOR', vendorId: String(vendor.vendorId) }],
          actorId: actor.id,
        })),
      );
    }

    await writeAudit(
      session,
      'RFQ',
      rfq._id,
      AUDIT.RFQ_DUE_CHANGED,
      actor.id,
      dueAt.toISOString(),
    );
    await bumpSyncStamp(session);
    return { outbox: ids, previousJob: previous };
  });

  await enqueueEmails(outbox);
  if (queuesAvailable()) {
    await cancelRfqDue(previousJob);
    const jobId = await scheduleRfqDue(id, dueAt);
    await Rfq.updateOne({ _id: id }, { $set: { dueJobId: jobId } });
  }
}

/** Prototype: A.closeRFQ — cancelling returns the quantities to the pool. */
export async function cancelRfq(actor: Actor, id: string): Promise<void> {
  const jobId = await inTransaction(async (session) => {
    const rfq = await Rfq.findById(id).session(session);
    if (!rfq) throw notFound();
    if (rfq.status !== 'OPEN') throw conflict('This enquiry is no longer open');

    rfq.status = 'CLOSED';
    await rfq.save({ session });

    await writeAudit(
      session,
      'RFQ',
      rfq._id,
      AUDIT.RFQ_CANCELLED,
      actor.id,
      'Quantities returned to pool',
    );
    await bumpSyncStamp(session);
    return rfq.dueJobId;
  });

  if (queuesAvailable()) await cancelRfqDue(jobId);
}

// ---------------------------------------------------------------------------
// The vendor portal
// ---------------------------------------------------------------------------

function vendorOf(actor: Actor): string {
  if (actor.role !== 'VENDOR' || !actor.vendorId) throw forbidden();
  return actor.vendorId;
}

export async function listVendorRfqs(actor: Actor): Promise<
  { rfq: RfqDto; myStatus: string }[]
> {
  const vendorId = vendorOf(actor);
  const [invitations, lookups] = await Promise.all([
    RfqVendor.find({ vendorId }).lean(),
    buildLookups(),
  ]);

  const rfqs = await Rfq.find({ _id: { $in: invitations.map((i) => i.rfqId) } })
    .sort({ createdAt: -1 })
    .lean();

  const lineCounts = await RfqLine.aggregate<{ _id: unknown; n: number }>([
    { $match: { rfqId: { $in: rfqs.map((r) => r._id) } } },
    { $group: { _id: '$rfqId', n: { $sum: 1 } } },
  ]);
  const counts = new Map(lineCounts.map((c) => [String(c._id), c.n]));

  return rfqs.map((rfq) => ({
    rfq: toRfqDto(rfq, lookups, {
      lineCount: counts.get(String(rfq._id)) ?? 0,
      // A vendor is never told which projects the material is for.
      projectCodes: [],
      quoted: 0,
      vendors: 0,
    }),
    myStatus:
      invitations.find((i) => String(i.rfqId) === String(rfq._id))?.status ?? 'INVITED',
  }));
}

/** Prototype: VIEWS.vrfq — the quotation sheet, with only this vendor's rates. */
export async function getVendorRfq(actor: Actor, id: string): Promise<VendorRfqDto> {
  const vendorId = vendorOf(actor);

  const rfq = await Rfq.findById(id).lean();
  if (!rfq) throw notFound();

  const invitation = await RfqVendor.findOne({ rfqId: id, vendorId }).lean();
  if (!invitation) throw forbidden(MSG.rfqNotInvited);

  const [lines, quotes, lookups] = await Promise.all([
    RfqLine.find({ rfqId: id }).lean(),
    Quote.find({ rfqId: id, vendorId }).lean(),
    buildLookups(),
  ]);

  const pastDue = rfq.dueAt.getTime() < Date.now();
  let subtotal = 0;

  const lineDtos = lines.map((line, index) => {
    const item = lookups.item(line.itemId)!;
    const quote = quotes.find((q) => String(q.rfqLineId) === String(line._id));
    const rate = num(quote?.rate ?? 0);
    subtotal = r2(subtotal + rate * num(line.qty));

    return {
      id: String(line._id),
      sn: index + 1,
      itemCode: item.code,
      itemName: item.name,
      unit: item.unit,
      qty: num(line.qty),
      rate,
      remark: quote?.remark ?? '',
    };
  });

  return {
    id: String(rfq._id),
    no: rfq.no,
    status: rfq.status,
    dueAt: rfq.dueAt.toISOString(),
    note: rfq.note ?? '',
    myStatus: invitation.status,
    canQuote:
      rfq.status === 'OPEN' &&
      !pastDue &&
      (invitation.status === 'ACCEPTED' || invitation.status === 'QUOTED'),
    pastDue,
    leadDays: invitation.leadDays ?? null,
    vatPct: invitation.vatPct ?? null,
    validity: invitation.validity || addDays(14),
    terms: invitation.terms || DEFAULT_PAYMENT_TERMS,
    submittedAt: invitation.submittedAt ? invitation.submittedAt.toISOString() : null,
    lines: lineDtos,
    subtotal,
  };
}

async function respondToRfq(
  actor: Actor,
  id: string,
  status: 'ACCEPTED' | 'DECLINED',
): Promise<void> {
  const vendorId = vendorOf(actor);

  const outbox = await inTransaction(async (session) => {
    const rfq = await Rfq.findById(id).session(session).lean();
    if (!rfq) throw notFound();
    if (rfq.status !== 'OPEN' || rfq.dueAt.getTime() < Date.now()) {
      throw conflict(MSG.rfqClosed);
    }

    const invitation = await RfqVendor.findOne({ rfqId: id, vendorId }).session(session);
    if (!invitation) throw forbidden(MSG.rfqNotInvited);
    if (invitation.status !== 'INVITED') {
      throw conflict('You have already replied to this enquiry');
    }

    invitation.status = status;
    await invitation.save({ session });

    const lookups = await buildLookups();
    const name = lookups.vendorName(vendorId);

    await writeAudit(
      session,
      'RFQ',
      rfq._id,
      status === 'ACCEPTED' ? AUDIT.RFQ_VENDOR_ACCEPTED : AUDIT.RFQ_VENDOR_DECLINED,
      actor.id,
      name,
    );

    const ids = await emit(session, 'RFQ_RESPONSE', {
      title: `${name} ${status === 'ACCEPTED' ? 'accepted' : 'declined'} ${rfq.no}`,
      link: `rfq:${String(rfq._id)}`,
      to: [{ role: 'PROC' }],
      actorId: actor.id,
    });

    await bumpSyncStamp(session);
    return ids;
  });

  await enqueueEmails(outbox);
}

export const acceptRfq = (actor: Actor, id: string) =>
  respondToRfq(actor, id, 'ACCEPTED');
export const declineRfq = (actor: Actor, id: string) =>
  respondToRfq(actor, id, 'DECLINED');

/** Prototype: A.vQuote — rates per line, plus lead time, tax, validity, terms. */
export async function submitQuote(
  actor: Actor,
  id: string,
  input: VendorQuoteInput,
): Promise<void> {
  const vendorId = vendorOf(actor);

  const outbox = await inTransaction(async (session) => {
    const rfq = await Rfq.findById(id).session(session).lean();
    if (!rfq) throw notFound();
    if (rfq.status !== 'OPEN' || rfq.dueAt.getTime() < Date.now()) {
      throw conflict(MSG.rfqClosed);
    }

    const invitation = await RfqVendor.findOne({ rfqId: id, vendorId }).session(session);
    if (!invitation) throw forbidden(MSG.rfqNotInvited);
    if (invitation.status === 'DECLINED') {
      throw conflict('You declined this enquiry');
    }

    const lines = await RfqLine.find({ rfqId: id }).session(session).lean();
    const known = new Set(lines.map((l) => String(l._id)));

    let quoted = 0;
    for (const row of input.lines) {
      if (!known.has(row.rfqLineId)) continue;
      if (num(row.rate) < 0) throw badRequest(MSG.vendorRatesNegative);
      if (num(row.rate) > 0) quoted += 1;
    }
    if (!quoted) throw badRequest(MSG.vendorQuoteAtLeastOne);

    for (const row of input.lines) {
      if (!known.has(row.rfqLineId)) continue;
      await Quote.updateOne(
        { rfqLineId: row.rfqLineId, vendorId },
        {
          $set: {
            rfqId: rfq._id,
            rfqLineId: row.rfqLineId,
            vendorId,
            rate: num(row.rate),
            remark: row.remark,
          },
        },
        { upsert: true, session },
      );
    }

    const again = invitation.status === 'QUOTED';
    invitation.status = 'QUOTED';
    invitation.leadDays = input.leadDays;
    invitation.vatPct = num(input.vatPct);
    invitation.validity = input.validity;
    invitation.terms = input.terms;
    invitation.submittedAt = new Date();
    await invitation.save({ session });

    const lookups = await buildLookups();
    const name = lookups.vendorName(vendorId);

    await writeAudit(
      session,
      'RFQ',
      rfq._id,
      again ? AUDIT.RFQ_QUOTE_UPDATED : AUDIT.RFQ_QUOTE_SUBMITTED,
      actor.id,
      `${name} · ${quoted} item(s)`,
    );

    const ids = await emit(session, 'QUOTE_SUBMITTED', {
      title: `${name} ${again ? 'updated' : 'submitted'} quote for ${rfq.no}`,
      body: `${quoted} of ${lines.length} item(s) quoted · lead time ${input.leadDays} days`,
      link: `rfq:${String(rfq._id)}`,
      to: [{ role: 'PROC' }],
      actorId: actor.id,
    });

    await bumpSyncStamp(session);
    return ids;
  });

  await enqueueEmails(outbox);
}

/** Prototype: A.vSheetCsv — the offline quotation sheet. */
export async function quotationSheetRows(
  actor: Actor,
  id: string,
): Promise<{ no: string; rows: Record<string, unknown>[] }> {
  const rfq = await getVendorRfq(actor, id);
  return {
    no: rfq.no,
    rows: rfq.lines.map((line) => ({
      'S.No': line.sn,
      'Item Code': line.itemCode,
      Description: line.itemName,
      Qty: line.qty,
      Unit: line.unit,
      Rate: line.rate || '',
      Remarks: line.remark,
    })),
  };
}

// ---------------------------------------------------------------------------
// Award — prototype A.awardRFQ
// ---------------------------------------------------------------------------

export interface AwardPlan {
  rfqId: string;
  rfqNo: string;
  reason: string;
  submit: boolean;
  byVendor: {
    vendorId: string;
    leadDays: number;
    terms: string;
    vatPct: number;
    rows: { mrLineId: string; qty: number; rate: number; gstPct: number }[];
  }[];
}

/**
 * Validates an award and turns it into one PO plan per vendor. The POs
 * themselves are created by the PO service, inside the same transaction.
 */
export async function planAward(
  actor: Actor,
  id: string,
  input: AwardRfqInput,
): Promise<AwardPlan> {
  const rfq = await Rfq.findById(id).lean();
  if (!rfq) throw notFound();
  if (rfq.status !== 'OPEN') throw conflict('This enquiry has already been closed');
  if (input.rv !== undefined && input.rv !== (rfq.rv ?? 0)) throw stale();

  const [lines, vendorRows, quotes, lookups] = await Promise.all([
    RfqLine.find({ rfqId: id }).lean(),
    RfqVendor.find({ rfqId: id, status: 'QUOTED' }).lean(),
    Quote.find({ rfqId: id }).lean(),
    buildLookups(),
  ]);

  const chosen = new Map(input.awards.map((a) => [a.rfqLineId, a.vendorId]));
  let notLowest = 0;

  const byVendor = new Map<string, AwardPlan['byVendor'][number]>();

  for (const line of lines) {
    const lineId = String(line._id);
    const item = lookups.item(line.itemId)!;
    const vendorId = chosen.get(lineId);
    if (!vendorId) throw badRequest(MSG.rfqPickVendorForLine(item.name));

    const quote = quotes.find(
      (q) => String(q.rfqLineId) === lineId && String(q.vendorId) === vendorId,
    );
    if (!quote || num(quote.rate) <= 0) {
      throw badRequest(MSG.rfqNoQuoteFrom(item.name));
    }

    // Is this the lowest rate anyone quoted for the line?
    const rates = vendorRows
      .map((v) => {
        const q = quotes.find(
          (x) =>
            String(x.rfqLineId) === lineId && String(x.vendorId) === String(v.vendorId),
        );
        return q && num(q.rate) > 0 ? num(q.rate) : Infinity;
      })
      .filter((r) => Number.isFinite(r));
    const best = rates.length ? Math.min(...rates) : Infinity;
    if (num(quote.rate) > best) notLowest += 1;

    const vendorRow = vendorRows.find((v) => String(v.vendorId) === vendorId);
    const entry =
      byVendor.get(vendorId) ??
      ({
        vendorId,
        leadDays: num(vendorRow?.leadDays ?? 7) || 7,
        terms: vendorRow?.terms || DEFAULT_PAYMENT_TERMS,
        vatPct: num(vendorRow?.vatPct ?? 0),
        rows: [],
      } satisfies AwardPlan['byVendor'][number]);

    for (const alloc of line.allocs ?? []) {
      entry.rows.push({
        mrLineId: String(alloc.mrLineId),
        qty: num(alloc.qty),
        rate: num(quote.rate),
        gstPct: num(vendorRow?.vatPct ?? 0),
      });
    }
    byVendor.set(vendorId, entry);
  }

  if (notLowest && !input.reason.trim()) {
    throw badRequest(MSG.rfqReasonNotLowest);
  }

  return {
    rfqId: id,
    rfqNo: rfq.no,
    reason: input.reason.trim() || 'Lowest quote',
    submit: input.submit,
    byVendor: [...byVendor.values()],
  };
}

/** Marks the RFQ awarded once its POs exist. Called inside the PO transaction. */
export async function markAwarded(
  session: Parameters<typeof writeAudit>[0],
  rfqId: string,
  actorId: string,
  poNos: string[],
): Promise<void> {
  await Rfq.updateOne({ _id: rfqId }, { $set: { status: 'AWARDED' } }, { session });
  await writeAudit(session, 'RFQ', rfqId, AUDIT.RFQ_AWARDED, actorId, poNos.join(', '));
}

export const rfqDueJobId = async (id: string): Promise<string> =>
  (await Rfq.findById(id).select('dueJobId').lean())?.dueJobId ?? '';
