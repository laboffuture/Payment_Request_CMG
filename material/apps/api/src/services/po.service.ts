import { Types, type ClientSession } from 'mongoose';
import {
  allocReceived,
  derivedPoStatus,
  displayPoNo,
  lineCalc,
  num,
  poReceivedPct,
  poReceivedValue,
  poTotals,
  r2,
} from '@cm/calc';
import {
  DEFAULT_CURRENCY,
  DEFAULT_PO_DELIVERY_DAYS,
  MSG,
  type PoAllocDto,
  type PoDetailDto,
  type PoDto,
  type PoLineDto,
  type PoListQuery,
  type PoRejectInput,
  type PoCommentInput,
  type PoValidateInput,
  type RevisePoInput,
  type UpsertPoInput,
  type AwardRfqInput,
} from '@cm/shared';
import { inTransaction } from '../db.js';
import { AUDIT, writeAudit } from '../lib/audit.js';
import { nextPoNo } from '../lib/counters.js';
import { badRequest, conflict, forbidden, notFound, stale } from '../lib/errors.js';
import { emit } from '../lib/notify.js';
import { bumpSyncStamp } from '../lib/sync.js';
import { buildLookups, trailFor, type Lookups } from '../lib/lookups.js';
import { loadWorld } from '../lib/world.js';
import { enqueueEmails } from '../jobs/queues.js';
import { Company, Item, Vendor } from '../models/masters.js';
import { Mr, MrLine } from '../models/mr.js';
import { Grn, GrnLine } from '../models/stock.js';
import { Po, PoAlloc, PoLine, PoRevision, VendorDoc } from '../models/po.js';
import { Rfq } from '../models/rfq.js';
import { isBuyer } from '@cm/shared';
import type { Actor } from '../middleware/auth.js';
import { toCompanyDto, listVendors } from './masters.service.js';
import { markAwarded, planAward } from './rfq.service.js';

/**
 * Purchase orders.
 * Prototype origin: VIEWS.pos / poform / poview / poapprove, savePOCore(),
 * A.savePO, A.poApprove, A.poReject, A.poCancel, A.poRevise, A.poAck,
 * refreshPO().
 */

const oid = (v: string) => new Types.ObjectId(v);

/** A billing entity prints in its own currency unless the buyer says otherwise. */
async function currencyForCompany(companyId: string): Promise<string> {
  const company = await Company.findById(companyId).select('currency').lean();
  return company?.currency || DEFAULT_CURRENCY;
}

const addDays = (n: number): string => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------

async function toPoDto(
  po: Record<string, any>,
  lookups: Lookups,
  extra: { projectCodes: string[]; receivedPct: number; rfqNo: string | null },
): Promise<PoDto> {
  return {
    id: String(po._id),
    rv: po.rv ?? 0,
    createdAt: po.createdAt.toISOString(),
    updatedAt: po.updatedAt.toISOString(),
    no: po.no,
    displayNo: po.no + (num(po.rev) > 0 ? ` Rev ${po.rev}` : ''),
    rev: num(po.rev),
    status: po.status,
    vendorId: String(po.vendorId),
    vendorName: lookups.vendorName(po.vendorId),
    companyId: String(po.companyId),
    deliverTo: po.deliverTo,
    deliveryDate: po.deliveryDate ?? '',
    deliveryAddress: po.deliveryAddress ?? '',
    billingAddress: po.billingAddress ?? '',
    terms: po.terms ?? '',
    notes: po.notes ?? '',
    taxMode: po.taxMode,
    currency: po.currency ?? DEFAULT_CURRENCY,
    reason: po.reason ?? '',
    rfqId: po.rfqId ? String(po.rfqId) : null,
    rfqNo: extra.rfqNo,
    subtotal: num(po.subtotal),
    taxTotal: num(po.taxTotal),
    total: num(po.total),
    createdBy: String(po.createdBy),
    createdByName: lookups.userName(po.createdBy),
    procMgrBy: po.procMgrBy ? String(po.procMgrBy) : null,
    procMgrByName: po.procMgrBy ? lookups.userName(po.procMgrBy) : null,
    procMgrAt: po.procMgrAt ? po.procMgrAt.toISOString() : null,
    qsBy: po.qsBy ? String(po.qsBy) : null,
    qsByName: po.qsBy ? lookups.userName(po.qsBy) : null,
    qsAt: po.qsAt ? po.qsAt.toISOString() : null,
    qsRemark: po.qsRemark ?? '',
    approvedBy: po.approvedBy ? String(po.approvedBy) : null,
    approvedByName: po.approvedBy ? lookups.userName(po.approvedBy) : null,
    approvedAt: po.approvedAt ? po.approvedAt.toISOString() : null,
    lastComment: po.lastComment ?? '',
    lastCommentByName: po.lastCommentBy ? lookups.userName(po.lastCommentBy) : '',
    lastCommentRole: po.lastCommentRole ?? '',
    vendorAckAt: po.vendorAckAt ? po.vendorAckAt.toISOString() : null,
    projectCodes: extra.projectCodes,
    receivedPct: extra.receivedPct,
  };
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

/** §3: a vendor only ever sees its own approved POs. */
function listFilterFor(actor: Actor, query: PoListQuery): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  if (actor.role === 'VENDOR') {
    if (!actor.vendorId) throw forbidden();
    filter.vendorId = oid(actor.vendorId);
    filter.status = { $in: ['APPROVED', 'PARTIAL', 'RECEIVED'] };
  } else if (query.status) {
    filter.status = query.status;
  }

  return filter;
}

/** The stage of the approval chain each role is asked to act on. */
export const QUEUE_STATUS: Record<string, string> = {
  PROC_MGR: 'PENDING_APPROVAL',
  QS: 'QS_VALIDATION',
  MGMT: 'MGMT_APPROVAL',
};

export async function listPos(
  actor: Actor,
  query: PoListQuery,
): Promise<{ rows: PoDto[]; total: number }> {
  const filter = listFilterFor(actor, query);

  const [pos, lookups] = await Promise.all([
    Po.find(filter).sort({ createdAt: -1 }).lean(),
    buildLookups(),
  ]);

  const ids = pos.map((p) => p._id);
  const [allocs, grnLines, rfqs] = await Promise.all([
    PoAlloc.find({ poId: { $in: ids } }).lean(),
    GrnLine.find({}).lean(),
    Rfq.find({ _id: { $in: pos.map((p) => p.rfqId).filter(Boolean) } })
      .select('no')
      .lean(),
  ]);

  const receivedByAlloc = new Map<string, number>();
  for (const line of grnLines) {
    const key = String(line.poAllocId);
    receivedByAlloc.set(key, num((receivedByAlloc.get(key) ?? 0) + num(line.qtyReceived)));
  }

  let rows = await Promise.all(
    pos.map(async (po) => {
      const mine = allocs.filter((a) => String(a.poId) === String(po._id));
      const ordered = num(mine.reduce((s, a) => s + num(a.qty), 0));
      const received = num(
        mine.reduce(
          (s, a) => s + Math.min(num(a.qty), receivedByAlloc.get(String(a._id)) ?? 0),
          0,
        ),
      );

      return toPoDto(po, lookups, {
        projectCodes: [
          ...new Set(mine.map((a) => lookups.projectCode(a.projectId))),
        ],
        receivedPct: ordered ? Math.round((received / ordered) * 100) : 0,
        rfqNo: po.rfqId
          ? (rfqs.find((r) => String(r._id) === String(po.rfqId))?.no ?? null)
          : null,
      });
    }),
  );

  // Project filter works on the allocations, not the PO itself.
  if (query.projectId) {
    const code = lookups.projectCode(query.projectId);
    rows = rows.filter((r) => r.projectCodes.includes(code));
  }

  return { rows, total: rows.length };
}

export async function getPo(actor: Actor, id: string): Promise<PoDetailDto> {
  const po = await Po.findById(id).lean();
  if (!po) throw notFound();

  const isVendor = actor.role === 'VENDOR';
  if (isVendor) {
    // Plan decision (d)(10): a vendor may only open its own approved PO.
    if (!actor.vendorId || String(po.vendorId) !== actor.vendorId) throw forbidden();
    if (!['APPROVED', 'PARTIAL', 'RECEIVED'].includes(po.status)) throw forbidden();
  }

  const [lines, allocs, lookups, world, company, vendorList] = await Promise.all([
    PoLine.find({ poId: id }).lean(),
    PoAlloc.find({ poId: id }).lean(),
    buildLookups(),
    loadWorld({ includeClosed: true }),
    Company.findById(po.companyId).lean(),
    listVendors(),
  ]);

  // QS validates the PO against the MR lines QS approved, so the allocation
  // rows carry the item and the for-PO quantity QS set on each of them.
  const mrLines = await MrLine.find({ _id: { $in: allocs.map((a) => a.mrLineId) } })
    .select('mrId itemId poQty unit newUnit newItemName')
    .lean();
  const mrs = await Mr.find({ _id: { $in: mrLines.map((l) => l.mrId) } })
    .select('no')
    .lean();
  const mrLineById = new Map(mrLines.map((l) => [String(l._id), l]));
  const mrNoByLine = new Map(
    mrLines.map((l) => [
      String(l._id),
      mrs.find((m) => String(m._id) === String(l.mrId))?.no ?? '',
    ]),
  );

  const lineDtos: PoLineDto[] = lines.map((line) => {
    const item = lookups.item(line.itemId)!;
    return {
      id: String(line._id),
      itemId: item.id,
      itemCode: item.code,
      itemName: item.name,
      description: line.description ?? '',
      unit: item.unit,
      qty: num(line.qty),
      rate: num(line.rate),
      gstPct: num(line.gstPct),
    };
  });

  const allocDtos: PoAllocDto[] = allocs.map((alloc) => {
    const received = allocReceived(world, String(alloc._id));
    const mrLine = mrLineById.get(String(alloc.mrLineId));
    const item = mrLine?.itemId ? lookups.item(mrLine.itemId) : null;

    return {
      id: String(alloc._id),
      poLineId: String(alloc.poLineId),
      mrLineId: String(alloc.mrLineId),
      mrNo: mrNoByLine.get(String(alloc.mrLineId)) ?? '',
      itemName: item?.name ?? mrLine?.newItemName ?? '',
      unit: mrLine?.unit || item?.unit || mrLine?.newUnit || '',
      qsApprovedQty: num(mrLine?.poQty ?? 0),
      projectId: String(alloc.projectId),
      projectCode: lookups.projectCode(alloc.projectId),
      qty: num(alloc.qty),
      received,
      balance: Math.max(0, num(num(alloc.qty) - received)),
    };
  });

  const calcPo = world.pos.find((p) => p.id === id) ?? {
    id,
    no: po.no,
    rev: num(po.rev),
    status: po.status,
    vendorId: String(po.vendorId),
    taxMode: po.taxMode,
  };

  const [grns, docs, revisions, rfq] = await Promise.all([
    Grn.find({ poId: id }).sort({ createdAt: -1 }).lean(),
    VendorDoc.find({ poId: id }).sort({ uploadedAt: -1 }).lean(),
    PoRevision.find({ poId: id }).sort({ rev: 1 }).lean(),
    po.rfqId ? Rfq.findById(po.rfqId).select('no').lean() : null,
  ]);

  const grnLines = await GrnLine.find({ grnId: { $in: grns.map((g) => g._id) } }).lean();

  // Tax rows for the printed PO: one per distinct rate (§7).
  const taxByRate = new Map<number, number>();
  for (const line of lineDtos) {
    if (po.taxMode === 'NONE' || !line.gstPct) continue;
    const amount = line.qty * line.rate;
    taxByRate.set(
      line.gstPct,
      r2((taxByRate.get(line.gstPct) ?? 0) + (amount * line.gstPct) / 100),
    );
  }

  const invoiced = r2(
    docs
      .filter((d) => d.docType === 'INVOICE' && d.status !== 'REJECTED')
      .reduce((s, d) => s + num(d.amount), 0),
  );

  const dto = await toPoDto(po, lookups, {
    projectCodes: [...new Set(allocDtos.map((a) => a.projectCode))],
    receivedPct: poReceivedPct(world, calcPo as never),
    rfqNo: rfq?.no ?? null,
  });

  const hasGrn = grns.length > 0;
  const isOwnPo = String(po.createdBy) === actor.id;

  return {
    ...dto,
    lines: lineDtos,
    allocs: isVendor ? [] : allocDtos,
    company: company ? toCompanyDto(company) : null,
    vendor: vendorList.find((v) => v.id === String(po.vendorId)) ?? null,
    // Plan decision (d)(20): none of this reaches a vendor.
    trail: isVendor ? [] : await trailFor('PO', id, lookups),
    grns: isVendor
      ? []
      : grns.map((g) => ({
          id: String(g._id),
          rv: 0,
          createdAt: g.createdAt.toISOString(),
          updatedAt: g.updatedAt.toISOString(),
          no: g.no,
          poId: id,
          poNo: dto.displayNo,
          vendorName: dto.vendorName,
          location: g.location,
          dnNo: g.dnNo,
          invNo: g.invNo ?? '',
          remark: g.remark ?? '',
          createdByName: lookups.userName(g.createdBy),
          projectCodes: [
            ...new Set(
              grnLines
                .filter((l) => String(l.grnId) === String(g._id) && num(l.qtyReceived) > 0)
                .map((l) => {
                  const alloc = allocDtos.find((a) => a.id === String(l.poAllocId));
                  return alloc?.projectCode ?? '';
                })
                .filter(Boolean),
            ),
          ],
        })),
    docs: docs.map((d) => ({
      id: String(d._id),
      rv: d.rv ?? 0,
      createdAt: d.createdAt.toISOString(),
      updatedAt: d.updatedAt.toISOString(),
      poId: id,
      poNo: dto.displayNo,
      vendorId: String(d.vendorId),
      vendorName: lookups.vendorName(d.vendorId),
      docType: d.docType,
      docNo: d.docNo,
      docDate: d.docDate ?? '',
      amount: num(d.amount),
      fileName: d.file?.name ?? '',
      status: d.status,
      remark: d.remark ?? '',
      uploadedAt: d.uploadedAt.toISOString(),
    })),
    revisions: isVendor
      ? []
      : revisions.map((r) => ({
          rev: r.rev,
          reason: r.reason,
          byName: lookups.userName(r.by),
          at: r.at.toISOString(),
          totalBefore: num(r.totalBefore),
        })),
    valueCheck: isVendor
      ? null
      : {
          poTotal: num(po.total),
          receivedValue: poReceivedValue(world, calcPo as never),
          invoiced,
        },
    canEdit: isBuyer(actor.role) && ['DRAFT', 'REJECTED'].includes(po.status),
    canApprove:
      actor.role === 'PROC_MGR' && po.status === 'PENDING_APPROVAL' && !isOwnPo,
    canValidate: actor.role === 'QS' && po.status === 'QS_VALIDATION',
    canMgmtApprove: actor.role === 'MGMT' && po.status === 'MGMT_APPROVAL',
    canRevise: isBuyer(actor.role) && ['APPROVED', 'PARTIAL'].includes(po.status),
    canCancel:
      isBuyer(actor.role) &&
      [
        'DRAFT',
        'PENDING_APPROVAL',
        'QS_VALIDATION',
        'MGMT_APPROVAL',
        'APPROVED',
        'REJECTED',
      ].includes(po.status) &&
      !hasGrn,
    isOwnPo,
    taxByRate: [...taxByRate.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([rate, tax]) => ({ rate, tax })),
  };
}

// ---------------------------------------------------------------------------
// Create / update — prototype savePOCore()
// ---------------------------------------------------------------------------

interface WriteLinesResult {
  subtotal: number;
  taxTotal: number;
  total: number;
}

/**
 * How much of an MR line this PO may take: what is open in the pool, plus
 * whatever this PO already holds (so an edit does not fight itself).
 * Prototype: poAvail(row, p).
 */
async function assertRowsAvailable(
  rows: UpsertPoInput['rows'],
  poId: string | null,
  lookups: Lookups,
): Promise<void> {
  const world = await loadWorld();
  const existing = poId
    ? await PoAlloc.find({ poId }).lean()
    : ([] as { mrLineId: unknown; qty: number; _id: unknown }[]);

  const ownByLine = new Map<string, number>();
  for (const alloc of existing) {
    const key = String(alloc.mrLineId);
    ownByLine.set(key, num((ownByLine.get(key) ?? 0) + num(alloc.qty)));
  }

  const receivedByLine = new Map<string, number>();
  for (const alloc of existing) {
    const key = String(alloc.mrLineId);
    receivedByLine.set(
      key,
      num((receivedByLine.get(key) ?? 0) + allocReceived(world, String(alloc._id))),
    );
  }

  const wanted = new Map<string, number>();
  for (const row of rows) {
    wanted.set(row.mrLineId, num((wanted.get(row.mrLineId) ?? 0) + num(row.qty)));
  }

  for (const [mrLineId, qty] of wanted) {
    const line = world.mrLines.find((l) => l.id === mrLineId);
    if (!line) throw badRequest('One of those MR lines no longer exists');

    const item = line.itemId ? lookups.item(line.itemId) : null;
    const name = item?.name ?? 'Item';

    if (qty <= 0) throw badRequest(MSG.poQtyAboveZero(name));

    const available = num(lineCalc(world, line).poolOpen + (ownByLine.get(mrLineId) ?? 0));
    if (qty > available + 1e-9) {
      throw badRequest(MSG.poOnlyAvailable(name, String(available)));
    }

    const received = receivedByLine.get(mrLineId) ?? 0;
    if (qty < received) {
      throw badRequest(MSG.poBelowReceived(name, String(received)));
    }
  }
}

/**
 * Writes the PO's lines and allocations.
 * Rows are grouped into one `poLine` per item + rate + tax, with one
 * `poAlloc` per row — exactly as the prototype's savePOCore does.
 */
async function writePoLines(
  poId: Types.ObjectId,
  // Rows from an awarded enquiry carry no description; the PO then prints the item name.
  rows: (Omit<UpsertPoInput['rows'][number], 'description'> & { description?: string })[],
  taxMode: string,
  session: ClientSession,
): Promise<WriteLinesResult> {
  const mrLines = await MrLine.find({ _id: { $in: rows.map((r) => oid(r.mrLineId)) } })
    .select('itemId mrId')
    .session(session)
    .lean();
  const mrs = await Mr.find({ _id: { $in: mrLines.map((l) => l.mrId) } })
    .select('projectId')
    .session(session)
    .lean();

  const itemByLine = new Map(mrLines.map((l) => [String(l._id), String(l.itemId)]));
  const projectByLine = new Map(
    mrLines.map((l) => [
      String(l._id),
      String(mrs.find((m) => String(m._id) === String(l.mrId))?.projectId ?? ''),
    ]),
  );

  await PoLine.deleteMany({ poId }, { session });
  await PoAlloc.deleteMany({ poId }, { session });

  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const gst = taxMode === 'NONE' ? 0 : num(row.gstPct);
    const key = `${itemByLine.get(row.mrLineId)}|${num(row.rate)}|${gst}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  let subtotal = 0;
  let taxTotal = 0;

  for (const group of groups.values()) {
    const first = group[0]!;
    const itemId = itemByLine.get(first.mrLineId)!;
    const gst = taxMode === 'NONE' ? 0 : num(first.gstPct);
    const rate = num(first.rate);
    const qty = num(group.reduce((s, r) => s + num(r.qty), 0));
    const description = group.find((r) => r.description)?.description ?? '';

    const [poLine] = await PoLine.create(
      [{ poId, itemId, qty, rate, gstPct: gst, description }],
      { session, ordered: true },
    );

    subtotal += qty * rate;
    taxTotal += (qty * rate * gst) / 100;

    for (const row of group) {
      await PoAlloc.create(
        [
          {
            poId,
            poLineId: poLine!._id,
            mrLineId: oid(row.mrLineId),
            projectId: oid(projectByLine.get(row.mrLineId)!),
            qty: num(row.qty),
          },
        ],
        { session, ordered: true },
      );
    }
  }

  return { subtotal: r2(subtotal), taxTotal: r2(taxTotal), total: r2(subtotal + taxTotal) };
}

async function validatePoInput(
  input: UpsertPoInput,
  poId: string | null,
  lookups: Lookups,
): Promise<void> {
  if (!input.rows.length) throw badRequest(MSG.poNoLines);
  if (!input.vendorId) throw badRequest(MSG.poNoVendor);
  if (!input.companyId) throw badRequest(MSG.poNoCompany);

  const [vendor, company] = await Promise.all([
    Vendor.findById(input.vendorId).select('_id').lean(),
    Company.findById(input.companyId).select('_id').lean(),
  ]);
  if (!vendor) throw badRequest(MSG.poNoVendor);
  if (!company) throw badRequest(MSG.poNoCompany);

  for (const row of input.rows) {
    if (num(row.rate) <= 0) {
      const line = await MrLine.findById(row.mrLineId).select('itemId newItemName').lean();
      const item = line?.itemId ? lookups.item(line.itemId) : null;
      throw badRequest(MSG.poRateRequired(item?.name ?? line?.newItemName ?? 'this item'));
    }
    if (num(row.gstPct) < 0) throw badRequest(MSG.poTaxNegative);
  }

  await assertRowsAvailable(input.rows, poId, lookups);

  // Direct-to-site only works when every line belongs to one project (§8).
  if (input.deliverTo === 'SITE') {
    const mrLines = await MrLine.find({
      _id: { $in: input.rows.map((r) => oid(r.mrLineId)) },
    })
      .select('mrId')
      .lean();
    const mrs = await Mr.find({ _id: { $in: mrLines.map((l) => l.mrId) } })
      .select('projectId')
      .lean();
    const projects = new Set(mrs.map((m) => String(m.projectId)));
    if (projects.size > 1) throw badRequest(MSG.poDirectOneProject);
  }
}

export async function createPo(
  actor: Actor,
  input: UpsertPoInput,
): Promise<{ id: string; no: string }> {
  const lookups = await buildLookups();
  await validatePoInput(input, null, lookups);

  const result = await inTransaction(async (session) => {
    const [po] = await Po.create(
      [
        {
          no: await nextPoNo(session),
          rev: 0,
          status: input.submit ? 'PENDING_APPROVAL' : 'DRAFT',
          vendorId: input.vendorId,
          companyId: input.companyId,
          deliverTo: input.deliverTo,
          deliveryDate: input.deliveryDate || addDays(DEFAULT_PO_DELIVERY_DAYS),
          deliveryAddress: input.deliveryAddress,
          billingAddress: input.billingAddress,
          terms: input.terms,
          notes: input.notes,
          taxMode: input.taxMode,
      ...(input.currency ? { currency: input.currency } : {}),
          currency: input.currency ?? (await currencyForCompany(input.companyId)),
          reason: input.reason,
          createdBy: actor.id,
        },
      ],
      { session, ordered: true },
    );

    const totals = await writePoLines(po!._id, input.rows, input.taxMode, session);
    Object.assign(po!, totals);
    await po!.save({ session });

    await writeAudit(
      session,
      'PO',
      po!._id,
      input.submit ? AUDIT.PO_RAISED : AUDIT.PO_DRAFT_CREATED,
      actor.id,
      input.reason,
    );

    const outbox = input.submit
      ? await notifySubmitted(session, po!, actor, lookups, false)
      : [];

    await bumpSyncStamp(session);
    return { id: String(po!._id), no: po!.no, outbox };
  });

  await enqueueEmails(result.outbox);
  return { id: result.id, no: result.no };
}

async function notifySubmitted(
  session: ClientSession,
  po: Record<string, any>,
  actor: Actor,
  lookups: Lookups,
  revised: boolean,
): Promise<string[]> {
  const allocs = await PoAlloc.find({ poId: po._id }).select('projectId').session(session).lean();
  const projects = [
    ...new Set(allocs.map((a) => lookups.projectCode(a.projectId))),
  ].join(', ');

  return emit(session, 'PO_SUBMITTED', {
    title: `${displayPoNo(po as never)} ${revised ? 'revised — ' : ''}waiting for approval — ${lookups.vendorName(
      po.vendorId,
    )}, ${num(po.total)}`,
    body: `Projects: ${projects}`,
    link: `po:${String(po._id)}`,
    to: [{ role: 'PROC_MGR' }],
    actorId: actor.id,
  });
}

export async function updatePo(
  actor: Actor,
  id: string,
  input: UpsertPoInput,
): Promise<{ id: string; no: string }> {
  const lookups = await buildLookups();
  await validatePoInput(input, id, lookups);

  const result = await inTransaction(async (session) => {
    const po = await Po.findById(id).session(session);
    if (!po) throw notFound();
    if (!['DRAFT', 'REJECTED'].includes(po.status)) {
      throw conflict('Only a draft or rejected PO can be edited');
    }
    if (input.rv !== undefined && input.rv !== (po.rv ?? 0)) throw stale();

    Object.assign(po, {
      vendorId: oid(input.vendorId),
      companyId: oid(input.companyId),
      deliverTo: input.deliverTo,
      deliveryDate: input.deliveryDate,
      deliveryAddress: input.deliveryAddress,
      billingAddress: input.billingAddress,
      terms: input.terms,
      notes: input.notes,
      taxMode: input.taxMode,
      ...(input.currency ? { currency: input.currency } : {}),
      reason: input.reason,
      status: input.submit ? 'PENDING_APPROVAL' : 'DRAFT',
    });

    const totals = await writePoLines(po._id, input.rows, input.taxMode, session);
    Object.assign(po, totals);
    await po.save({ session });

    await writeAudit(
      session,
      'PO',
      po._id,
      input.submit ? AUDIT.PO_EDITED_SUBMITTED : AUDIT.PO_EDITED,
      actor.id,
    );

    const outbox = input.submit
      ? await notifySubmitted(session, po, actor, lookups, false)
      : [];

    await bumpSyncStamp(session);
    return { id: String(po._id), no: po.no, outbox };
  });

  await enqueueEmails(result.outbox);
  return { id: result.id, no: result.no };
}

/** Prototype: A.poRevise — rev + 1, reason recorded, back for approval. */
export async function revisePo(
  actor: Actor,
  id: string,
  input: RevisePoInput,
): Promise<{ id: string; no: string }> {
  const lookups = await buildLookups();

  const existing = await Po.findById(id).lean();
  if (!existing) throw notFound();
  if (!['APPROVED', 'PARTIAL'].includes(existing.status)) {
    throw conflict('Only an approved PO can be revised');
  }
  // The vendor is fixed on a revision (the prototype disables the field).
  await validatePoInput({ ...input, vendorId: String(existing.vendorId) }, id, lookups);

  const result = await inTransaction(async (session) => {
    const po = await Po.findById(id).session(session);
    if (!po) throw notFound();
    if (input.rv !== undefined && input.rv !== (po.rv ?? 0)) throw stale();

    const [lines, allocs] = await Promise.all([
      PoLine.find({ poId: po._id }).session(session).lean(),
      PoAlloc.find({ poId: po._id }).session(session).lean(),
    ]);

    await PoRevision.create(
      [
        {
          poId: po._id,
          rev: num(po.rev) + 1,
          reason: input.revisionReason,
          by: actor.id,
          at: new Date(),
          totalBefore: num(po.total),
          snapshot: { po: po.toObject(), lines, allocs },
        },
      ],
      { session, ordered: true },
    );

    po.rev = num(po.rev) + 1;
    po.approvedBy = null;
    po.approvedAt = null;
    po.vendorAckAt = null;
    po.status = 'PENDING_APPROVAL';
    Object.assign(po, {
      companyId: oid(input.companyId),
      deliverTo: input.deliverTo,
      deliveryDate: input.deliveryDate,
      deliveryAddress: input.deliveryAddress,
      billingAddress: input.billingAddress,
      terms: input.terms,
      notes: input.notes,
      taxMode: input.taxMode,
      ...(input.currency ? { currency: input.currency } : {}),
    });

    const totals = await writePoLines(po._id, input.rows, input.taxMode, session);
    Object.assign(po, totals);
    await po.save({ session });

    await writeAudit(
      session,
      'PO',
      po._id,
      AUDIT.PO_REVISED(po.rev),
      actor.id,
      input.revisionReason,
    );

    const outbox = await notifySubmitted(session, po, actor, lookups, true);
    await bumpSyncStamp(session);
    return { id: String(po._id), no: po.no, outbox };
  });

  await enqueueEmails(result.outbox);
  return { id: result.id, no: result.no };
}

export async function submitPo(actor: Actor, id: string): Promise<void> {
  const lookups = await buildLookups();

  const outbox = await inTransaction(async (session) => {
    const po = await Po.findById(id).session(session);
    if (!po) throw notFound();
    if (!['DRAFT', 'REJECTED'].includes(po.status)) {
      throw conflict('This PO has already been submitted');
    }

    po.status = 'PENDING_APPROVAL';
    await po.save({ session });

    await writeAudit(session, 'PO', po._id, AUDIT.PO_RAISED, actor.id);
    const ids = await notifySubmitted(session, po, actor, lookups, false);
    await bumpSyncStamp(session);
    return ids;
  });

  await enqueueEmails(outbox);
}

// ---------------------------------------------------------------------------
// Approve / reject / cancel / acknowledge
// ---------------------------------------------------------------------------

/**
 * Step 1 of 3 — the Procurement Manager approves the PO and hands it to QS.
 * Nothing is committed to the item master and no vendor is told yet: that only
 * happens once management gives the final word.
 */
export async function approvePo(
  actor: Actor,
  id: string,
  input: PoCommentInput,
): Promise<void> {
  if (actor.role !== 'PROC_MGR') throw forbidden(MSG.poOnlyManagerApproves);

  const outbox = await inTransaction(async (session) => {
    const po = await Po.findById(id).session(session);
    if (!po) throw notFound();
    if (po.status !== 'PENDING_APPROVAL') throw conflict(MSG.poNotWithProcMgr);
    // §3: nobody approves their own PO.
    if (String(po.createdBy) === actor.id) throw forbidden(MSG.poOwnPo);
    if (input.rv !== undefined && input.rv !== (po.rv ?? 0)) throw stale();

    po.status = 'QS_VALIDATION';
    po.procMgrBy = oid(actor.id) as never;
    po.procMgrAt = new Date();
    if (input.comment) {
      po.lastComment = input.comment;
      po.lastCommentBy = oid(actor.id) as never;
      po.lastCommentRole = 'PROC_MGR';
    }
    await po.save({ session });

    const lookups = await buildLookups();
    await writeAudit(
      session,
      'PO',
      po._id,
      AUDIT.PO_PROC_MGR_APPROVED,
      actor.id,
      input.comment,
    );

    const ids = await emit(session, 'PO_QS_VALIDATION', {
      title: `${displayPoNo(po as never)} approved by the Procurement Manager — QS to validate`,
      body:
        `${lookups.vendorName(po.vendorId)} · ${num(po.total)}` +
        (input.comment ? `\n${actor.name}: ${input.comment}` : ''),
      link: `po:${String(po._id)}`,
      to: [
        { role: 'QS' },
        { userId: po.createdBy },
        ...(await requesterIdsFor(po._id, session)).map((u) => ({ userId: u })),
      ],
      actorId: actor.id,
    });

    await bumpSyncStamp(session);
    return ids;
  });

  await enqueueEmails(outbox);
}

/**
 * Step 2 of 3 — QS answers one question: is everything QS asked for actually on
 * this PO? A "yes" sends it to management. A "no" carries the reason back to
 * procurement, who can edit and resubmit.
 */
export async function validatePo(
  actor: Actor,
  id: string,
  input: PoValidateInput,
): Promise<void> {
  if (actor.role !== 'QS') throw forbidden(MSG.poOnlyQsValidates);

  const outbox = await inTransaction(async (session) => {
    const po = await Po.findById(id).session(session);
    if (!po) throw notFound();
    if (po.status !== 'QS_VALIDATION') throw conflict(MSG.poNotWithQs);
    if (input.rv !== undefined && input.rv !== (po.rv ?? 0)) throw stale();

    const lookups = await buildLookups();
    po.qsBy = oid(actor.id) as never;
    po.qsAt = new Date();
    po.qsRemark = input.remark;
    po.lastCommentBy = oid(actor.id) as never;
    po.lastCommentRole = 'QS';

    if (!input.ok) {
      // Not validated: it goes back to procurement with what is missing.
      po.status = 'REJECTED';
      po.lastComment = input.remark;
      await po.save({ session });

      await writeAudit(
        session,
        'PO',
        po._id,
        AUDIT.PO_QS_VALIDATION_FAILED,
        actor.id,
        input.remark,
      );

      const ids = await emit(session, 'PO_VALIDATION_FAILED', {
        title: `${displayPoNo(po as never)} — QS found something missing`,
        body: input.remark,
        link: `po:${String(po._id)}`,
        to: [
          { userId: po.createdBy },
          { role: 'PROC' },
          po.procMgrBy ? { userId: po.procMgrBy } : null,
          ...(await requesterIdsFor(po._id, session)).map((u) => ({ userId: u })),
        ],
        actorId: actor.id,
      });

      await bumpSyncStamp(session);
      return ids;
    }

    po.status = 'MGMT_APPROVAL';
    po.lastComment = input.remark;
    await po.save({ session });

    await writeAudit(session, 'PO', po._id, AUDIT.PO_QS_VALIDATED, actor.id, input.remark);

    const ids = await emit(session, 'PO_VALIDATED', {
      title: `${displayPoNo(po as never)} validated by QS — waiting for management`,
      body:
        `${lookups.vendorName(po.vendorId)} · ${num(po.total)}` +
        (input.remark ? `\nQS: ${input.remark}` : ''),
      link: `po:${String(po._id)}`,
      to: [
        { role: 'MGMT' },
        { userId: po.createdBy },
        po.procMgrBy ? { userId: po.procMgrBy } : null,
        ...(await requesterIdsFor(po._id, session)).map((u) => ({ userId: u })),
      ],
      actorId: actor.id,
    });

    await bumpSyncStamp(session);
    return ids;
  });

  await enqueueEmails(outbox);
}

/**
 * Step 3 of 3 — management approves, and only now does the PO become real: the
 * item master learns the rate and the vendor is told.
 */
export async function mgmtApprovePo(
  actor: Actor,
  id: string,
  input: PoCommentInput,
): Promise<void> {
  if (actor.role !== 'MGMT') throw forbidden(MSG.poOnlyMgmtApproves);

  const outbox = await inTransaction(async (session) => {
    const po = await Po.findById(id).session(session);
    if (!po) throw notFound();
    if (po.status !== 'MGMT_APPROVAL') throw conflict(MSG.poNotWithMgmt);
    if (input.rv !== undefined && input.rv !== (po.rv ?? 0)) throw stale();

    po.status = 'APPROVED';
    po.approvedBy = oid(actor.id) as never;
    po.approvedAt = new Date();
    if (input.comment) {
      po.lastComment = input.comment;
      po.lastCommentBy = oid(actor.id) as never;
      po.lastCommentRole = 'MGMT';
    }
    await po.save({ session });

    // Plan decision (d)(2): the item master learns the rate on approval — which
    // is now the final one, so a PO that never made it through leaves no mark.
    const lines = await PoLine.find({ poId: po._id }).session(session).lean();
    for (const line of lines) {
      await Item.updateOne(
        { _id: line.itemId },
        { $set: { lastRate: num(line.rate), lastVendorId: po.vendorId } },
        { session },
      );
    }

    const lookups = await buildLookups();
    const requesters = await requesterIdsFor(po._id, session);

    await writeAudit(
      session,
      'PO',
      po._id,
      AUDIT.PO_APPROVED(num(po.rev)),
      actor.id,
      input.comment,
    );

    const ids = await emit(session, 'PO_APPROVED', {
      title: `${displayPoNo(po as never)} approved — ${lookups.vendorName(po.vendorId)}`,
      body: `Deliver to ${po.deliverTo === 'SITE' ? 'site' : 'main store'} by ${
        po.deliveryDate
      } · ${num(po.total)}`,
      link: `po:${String(po._id)}`,
      to: [
        { role: 'PROC' },
        po.procMgrBy ? { userId: po.procMgrBy } : null,
        po.qsBy ? { userId: po.qsBy } : null,
        po.deliverTo === 'STORE' ? { role: 'STORE' } : null,
        ...requesters.map((u) => ({ userId: u })),
        { role: 'VENDOR' as const, vendorId: String(po.vendorId) },
      ],
      actorId: actor.id,
      attachPoId: po._id,
    });

    await bumpSyncStamp(session);
    return ids;
  });

  await enqueueEmails(outbox);
  await refreshPoStatus(id);
}

/** Management's rejection — the last word, and it stops the PO. */
export async function mgmtRejectPo(
  actor: Actor,
  id: string,
  input: PoRejectInput,
): Promise<void> {
  if (actor.role !== 'MGMT') throw forbidden(MSG.poOnlyMgmtApproves);

  const outbox = await inTransaction(async (session) => {
    const po = await Po.findById(id).session(session);
    if (!po) throw notFound();
    if (po.status !== 'MGMT_APPROVAL') throw conflict(MSG.poNotWithMgmt);
    if (input.rv !== undefined && input.rv !== (po.rv ?? 0)) throw stale();

    po.status = 'REJECTED';
    po.lastComment = input.comment;
    po.lastCommentBy = oid(actor.id) as never;
    po.lastCommentRole = 'MGMT';
    await po.save({ session });

    await writeAudit(session, 'PO', po._id, AUDIT.PO_MGMT_REJECTED, actor.id, input.comment);

    const requesters = await requesterIdsFor(po._id, session);
    const ids = await emit(session, 'PO_REJECTED', {
      title: `${displayPoNo(po as never)} rejected by management`,
      body: input.comment,
      link: `po:${String(po._id)}`,
      to: [
        { userId: po.createdBy },
        { role: 'PROC' },
        po.procMgrBy ? { userId: po.procMgrBy } : null,
        po.qsBy ? { userId: po.qsBy } : null,
        ...requesters.map((u) => ({ userId: u })),
      ],
      actorId: actor.id,
    });

    await bumpSyncStamp(session);
    return ids;
  });

  await enqueueEmails(outbox);
}

/**
 * Everyone on the requesting side of this PO: the site engineers who raised
 * the MRs and the Project Managers who approved them. They asked for the
 * material, so they are told what procurement does with the request.
 */
async function requesterIdsFor(
  poId: Types.ObjectId,
  session: ClientSession,
): Promise<string[]> {
  const allocs = await PoAlloc.find({ poId }).session(session).lean();
  const mrLines = await MrLine.find({ _id: { $in: allocs.map((a) => a.mrLineId) } })
    .select('mrId')
    .session(session)
    .lean();
  const mrs = await Mr.find({ _id: { $in: mrLines.map((l) => l.mrId) } })
    .select('createdBy pmBy')
    .session(session)
    .lean();

  return [
    ...new Set(
      mrs.flatMap((m) => [String(m.createdBy), m.pmBy ? String(m.pmBy) : '']),
    ),
  ].filter(Boolean);
}

export async function rejectPo(
  actor: Actor,
  id: string,
  input: PoRejectInput,
): Promise<void> {
  if (actor.role !== 'PROC_MGR') throw forbidden(MSG.poOnlyManagerRejects);

  const outbox = await inTransaction(async (session) => {
    const po = await Po.findById(id).session(session);
    if (!po) throw notFound();
    if (po.status !== 'PENDING_APPROVAL') throw conflict(MSG.poNotWithProcMgr);
    if (input.rv !== undefined && input.rv !== (po.rv ?? 0)) throw stale();

    po.status = 'REJECTED';
    po.procMgrBy = oid(actor.id) as never;
    po.procMgrAt = new Date();
    po.lastComment = input.comment;
    po.lastCommentBy = oid(actor.id) as never;
    po.lastCommentRole = 'PROC_MGR';
    await po.save({ session });

    await writeAudit(session, 'PO', po._id, AUDIT.PO_REJECTED, actor.id, input.comment);

    const ids = await emit(session, 'PO_REJECTED', {
      title: `${displayPoNo(po as never)} rejected by the Procurement Manager`,
      body: input.comment,
      link: `po:${String(po._id)}`,
      to: [
        { userId: po.createdBy },
        { role: 'PROC' },
        ...(await requesterIdsFor(po._id, session)).map((u) => ({ userId: u })),
      ],
      actorId: actor.id,
    });

    await bumpSyncStamp(session);
    return ids;
  });

  await enqueueEmails(outbox);
}

/** Prototype: A.poCancel — plan decision (d)(4) adds the server-side guard. */
export async function cancelPo(actor: Actor, id: string): Promise<void> {
  await inTransaction(async (session) => {
    const po = await Po.findById(id).session(session);
    if (!po) throw notFound();
    const cancellable = [
      'DRAFT',
      'PENDING_APPROVAL',
      'QS_VALIDATION',
      'MGMT_APPROVAL',
      'APPROVED',
      'REJECTED',
    ];
    if (!cancellable.includes(po.status)) {
      throw conflict('This PO can no longer be cancelled');
    }

    const received = await Grn.exists({ poId: po._id });
    if (received) throw conflict(MSG.poCancelHasGrn);

    po.status = 'CANCELLED';
    await po.save({ session });

    await writeAudit(session, 'PO', po._id, AUDIT.PO_CANCELLED, actor.id);
    await bumpSyncStamp(session);
  });
}

/** Prototype: A.poAck — the vendor confirms it has the order. */
export async function acknowledgePo(actor: Actor, id: string): Promise<void> {
  if (actor.role !== 'VENDOR' || !actor.vendorId) throw forbidden();

  await inTransaction(async (session) => {
    const po = await Po.findById(id).session(session);
    if (!po) throw notFound();
    if (String(po.vendorId) !== actor.vendorId) throw forbidden();
    if (!['APPROVED', 'PARTIAL'].includes(po.status)) {
      throw conflict('This PO cannot be acknowledged');
    }

    po.vendorAckAt = new Date();
    await po.save({ session });

    await writeAudit(session, 'PO', po._id, AUDIT.PO_VENDOR_ACK, actor.id);
    await bumpSyncStamp(session);
  });
}

/** Prototype: refreshPO() — APPROVED / PARTIAL / RECEIVED follow the GRNs. */
export async function refreshPoStatus(id: string): Promise<void> {
  const world = await loadWorld({ includeClosed: true });
  const po = world.pos.find((p) => p.id === id);
  if (!po) return;

  const next = derivedPoStatus(world, po);
  if (!next || next === po.status) return;

  await Po.updateOne({ _id: id }, { $set: { status: next } });
  await bumpSyncStamp();
}

// ---------------------------------------------------------------------------
// Award — creates one PO per vendor from an enquiry
// ---------------------------------------------------------------------------

export async function awardRfq(
  actor: Actor,
  rfqId: string,
  input: AwardRfqInput,
): Promise<{ poNos: string[]; submitted: boolean }> {
  const plan = await planAward(actor, rfqId, input);
  const lookups = await buildLookups();

  const company =
    (await Company.findOne({ isDefault: true }).lean()) ??
    (await Company.findOne({}).sort({ createdAt: 1 }).lean());
  if (!company) throw badRequest(MSG.poNoCompany);

  const result = await inTransaction(async (session) => {
    const nos: string[] = [];
    const outbox: string[] = [];

    for (const vendor of plan.byVendor) {
      const [po] = await Po.create(
        [
          {
            no: await nextPoNo(session),
            rev: 0,
            status: plan.submit ? 'PENDING_APPROVAL' : 'DRAFT',
            vendorId: vendor.vendorId,
            companyId: company._id,
            // A multi-project award always goes to the main store (d)(18).
            deliverTo: 'STORE',
            deliveryDate: addDays(vendor.leadDays || DEFAULT_PO_DELIVERY_DAYS),
            terms: vendor.terms,
            taxMode: company.taxMode,
            currency: company.currency || DEFAULT_CURRENCY,
            reason: plan.reason,
            rfqId,
            createdBy: actor.id,
          },
        ],
        { session, ordered: true },
      );

      const totals = await writePoLines(
        po!._id,
        vendor.rows.map((r) => ({
          mrLineId: r.mrLineId,
          qty: r.qty,
          rate: r.rate,
          gstPct: r.gstPct,
        })),
        company.taxMode,
        session,
      );
      Object.assign(po!, totals);
      await po!.save({ session });

      await writeAudit(
        session,
        'PO',
        po!._id,
        plan.submit ? AUDIT.PO_RAISED : AUDIT.PO_DRAFT_CREATED,
        actor.id,
        `From ${plan.rfqNo}`,
      );

      if (plan.submit) {
        outbox.push(...(await notifySubmitted(session, po!, actor, lookups, false)));
      }
      nos.push(po!.no);
    }

    await markAwarded(session, rfqId, actor.id, nos);
    await bumpSyncStamp(session);
    return { nos, outbox };
  });

  await enqueueEmails(result.outbox);
  return { poNos: result.nos, submitted: plan.submit };
}

/** The wizard's "what is already on this PO" table when editing or revising. */
export async function poFormRows(id: string): Promise<
  {
    mrLineId: string;
    itemId: string;
    itemCode: string;
    itemName: string;
    description: string;
    mrDescription: string;
    unit: string;
    projectCode: string;
    mrNo: string;
    qty: number;
    rate: number;
    gstPct: number;
    received: number;
  }[]
> {
  const [allocs, lines, lookups, world] = await Promise.all([
    PoAlloc.find({ poId: id }).lean(),
    PoLine.find({ poId: id }).lean(),
    buildLookups(),
    loadWorld({ includeClosed: true }),
  ]);

  const mrLines = await MrLine.find({ _id: { $in: allocs.map((a) => a.mrLineId) } })
    .select('mrId itemId description')
    .lean();
  const mrs = await Mr.find({ _id: { $in: mrLines.map((l) => l.mrId) } })
    .select('no')
    .lean();

  return allocs.map((alloc) => {
    const line = lines.find((l) => String(l._id) === String(alloc.poLineId));
    const mrLine = mrLines.find((l) => String(l._id) === String(alloc.mrLineId));
    const mr = mrs.find((m) => String(m._id) === String(mrLine?.mrId));
    const item = lookups.item(line?.itemId ?? mrLine?.itemId);

    return {
      mrLineId: String(alloc.mrLineId),
      itemId: item?.id ?? '',
      itemCode: item?.code ?? '',
      itemName: item?.name ?? '',
      description: line?.description ?? '',
      mrDescription: mrLine?.description ?? '',
      unit: item?.unit ?? '',
      projectCode: lookups.projectCode(alloc.projectId),
      mrNo: mr?.no ?? '',
      qty: num(alloc.qty),
      rate: num(line?.rate ?? 0),
      gstPct: num(line?.gstPct ?? 0),
      received: allocReceived(world, String(alloc._id)),
    };
  });
}

export { poTotals };
