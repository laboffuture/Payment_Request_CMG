import { Types, type ClientSession } from 'mongoose';
import { lineCalc, num, shouldCloseMr, stock } from '@cm/calc';
import {
  MAX_BOQ_FILES,
  earliestRequiredDate,
  MSG,
  type MapNewItemInput,
  type MrCommentInput,
  type MrDetailDto,
  type MrDto,
  type MrLineDetailDto,
  type MrLineDto,
  type MrListQuery,
  type LinkedPoDto,
  type BoqFileDto,
  type MrPrintDto,
  type PmApproveInput,
  type QsApproveInput,
  type UpsertMrInput,
} from '@cm/shared';
import { inTransaction } from '../db.js';
import { AUDIT, writeAudit } from '../lib/audit.js';
import { nextItemCode, nextMrNo } from '../lib/counters.js';
import { badRequest, conflict, forbidden, notFound, stale } from '../lib/errors.js';
import { emit } from '../lib/notify.js';
import { bumpSyncStamp } from '../lib/sync.js';
import { buildLookups, companyFor, today, trailFor, type Lookups } from '../lib/lookups.js';
import { loadWorld } from '../lib/world.js';
import { enqueueEmails } from '../jobs/queues.js';
import { deleteFile, signedUrlFor, uploadBoq } from '../lib/files.js';
import { Item, Project } from '../models/masters.js';
import { Mr, MrLine } from '../models/mr.js';
import { Issue, IssueLine, StockLedger } from '../models/stock.js';
import { EmailOutbox, Notification } from '../models/system.js';
import { Po, PoAlloc } from '../models/po.js';
import { Rfq, RfqLine } from '../models/rfq.js';
import { canSeeProject, projectScopeOf, type Actor } from '../middleware/auth.js';
import { toCompanyDto } from './masters.service.js';

/**
 * Material requests — the site form, the QS queue and the split approval.
 * Prototype origin: VIEWS.mrs / mrview / approvals, A.saveMR, A.qsApprove,
 * A.sendBack, A.rejectMR, A.approveNew, A.mapNew, A.rejectNew, refreshMR.
 */

const oid = (v: string) => new Types.ObjectId(v);

// ---------------------------------------------------------------------------
// Serializers
// ---------------------------------------------------------------------------


function lineName(line: Record<string, any>, lookups: Lookups): string {
  const item = line.itemId ? lookups.item(line.itemId) : null;
  return item ? item.name : line.newItemName || '—';
}

/**
 * The unit the line is ordered in. The site engineer may pick one that differs
 * from the item master's own (steel bought by the length, not by weight), and
 * an approver may change it again — so an explicit unit always wins.
 */
function lineUnit(line: Record<string, any>, lookups: Lookups): string {
  if (line.unit) return line.unit;
  const item = line.itemId ? lookups.item(line.itemId) : null;
  return item ? item.unit : line.newUnit || '';
}

/**
 * True once a PM or QS has altered the quantity, the measurement or the unit.
 * requestedQty is only filled on submit, so a draft never counts as changed.
 */
function approverChanged(line: Record<string, any>): boolean {
  if (line.requestedQty === null || line.requestedQty === undefined) return false;
  return (
    num(line.qty) !== num(line.requestedQty) ||
    (line.measurement ?? '') !== (line.requestedMeasurement ?? '') ||
    (line.unit ?? '') !== (line.requestedUnit ?? '')
  );
}

export function toMrLineDto(line: Record<string, any>, lookups: Lookups): MrLineDto {
  const item = line.itemId ? lookups.item(line.itemId) : null;
  return {
    id: String(line._id),
    sn: line.sn,
    itemId: line.itemId ? String(line.itemId) : null,
    itemCode: item?.code ?? null,
    name: lineName(line, lookups),
    unit: lineUnit(line, lookups),
    category: item?.category ?? line.newCategory ?? '',
    newStatus: line.newStatus ?? 'NONE',
    newItemName: line.newItemName ?? '',
    newUnit: line.newUnit ?? '',
    newCategory: line.newCategory ?? '',
    newSpec: line.newSpec ?? '',
    qty: num(line.qty),
    description: line.description ?? '',
    measurement: line.measurement ?? '',
    requestedQty: num(line.requestedQty ?? line.qty),
    requestedMeasurement: line.requestedMeasurement ?? line.measurement ?? '',
    requestedUnit: line.requestedUnit ?? '',
    // What the site engineer sees at a glance: "an approver touched this line".
    changed: approverChanged(line),
    boqRef: line.boqRef ?? '',
    remarks: line.remarks ?? '',
    storeQty: line.storeQty ?? null,
    poQty: line.poQty ?? null,
    qsRemark: line.qsRemark ?? '',
    lineStatus: line.lineStatus,
  };
}

/**
 * The BOQ files on an MR. Folds in the single file the first version of the
 * feature stored, so an MR raised before the change keeps its attachment.
 */
function boqFilesOf(mr: Record<string, any>): Record<string, any>[] {
  const files = (mr.boqFiles ?? []) as Record<string, any>[];
  if (files.length) return files;
  return mr.boq ? [mr.boq] : [];
}

export function toMrDto(
  mr: Record<string, any>,
  lookups: Lookups,
  counts: { lines: number; newItems: number },
): MrDto {
  const project = String(mr.projectId);
  const overdue =
    (mr.status === 'APPROVED' ||
      mr.status === 'QS_PENDING' ||
      mr.status === 'PM_PENDING') &&
    mr.requiredDate < today();

  return {
    id: String(mr._id),
    rv: mr.rv ?? 0,
    createdAt: mr.createdAt.toISOString(),
    updatedAt: mr.updatedAt.toISOString(),
    no: mr.no ?? '',
    projectId: project,
    projectCode: lookups.projectCode(project),
    projectName: lookups.projectName(project),
    requiredDate: mr.requiredDate,
    remarks: mr.remarks ?? '',
    status: mr.status,
    createdBy: String(mr.createdBy),
    createdByName: lookups.userName(mr.createdBy),
    submittedAt: mr.submittedAt ? mr.submittedAt.toISOString() : null,
    lastComment: mr.lastComment ?? '',
    qsBy: mr.qsBy ? String(mr.qsBy) : null,
    qsByName: mr.qsBy ? lookups.userName(mr.qsBy) : null,
    qsAt: mr.qsAt ? mr.qsAt.toISOString() : null,
    pmBy: mr.pmBy ? String(mr.pmBy) : null,
    pmByName: mr.pmBy ? lookups.userName(mr.pmBy) : null,
    pmAt: mr.pmAt ? mr.pmAt.toISOString() : null,
    lastCommentByName: mr.lastCommentBy ? lookups.userName(mr.lastCommentBy) : '',
    lastCommentRole: mr.lastCommentRole ?? '',
    boqFileCount: boqFilesOf(mr).length,
    closedAt: mr.closedAt ? mr.closedAt.toISOString() : null,
    lineCount: counts.lines,
    newItemCount: counts.newItems,
    overdue,
  };
}

// ---------------------------------------------------------------------------
// Access
// ---------------------------------------------------------------------------

/**
 * §3: a site user sees only their own MRs; everyone else sees every submitted
 * MR. Drafts belong to their author alone.
 */
function listFilterFor(actor: Actor, query: MrListQuery): Record<string, unknown> {
  const filter: Record<string, unknown> = {};

  if (actor.role === 'SITE') {
    filter.createdBy = oid(actor.id);
  } else {
    filter.status = { $ne: 'DRAFT' };
  }

  if (query.queue === 'pm') {
    filter.status = 'PM_PENDING';
    delete filter.createdBy;
  } else if (query.queue === 'qs') {
    filter.status = 'QS_PENDING';
    delete filter.createdBy;
  } else if (query.status) {
    filter.status = query.status;
  }

  if (query.projectId) filter.projectId = oid(query.projectId);

  // A project-scoped site user never sees another project's request.
  const scope = projectScopeOf(actor);
  if (scope) filter.projectId = { $in: scope.map(oid) };

  return filter;
}

function assertCanRead(actor: Actor, mr: Record<string, any>): void {
  if (actor.role === 'VENDOR') throw forbidden();
  if (mr.status === 'DRAFT' && String(mr.createdBy) !== actor.id) throw forbidden();
  if (!canSeeProject(actor, String(mr.projectId))) throw forbidden();
}

/** Prototype: canEdit — the creator, while the MR is a draft or sent back. */
const canEdit = (actor: Actor, mr: Record<string, any>): boolean =>
  String(mr.createdBy) === actor.id &&
  (mr.status === 'DRAFT' || mr.status === 'SENT_BACK');

const canQs = (actor: Actor, mr: Record<string, any>): boolean =>
  actor.role === 'QS' && mr.status === 'QS_PENDING';

/** The Project Manager reviews the request before QS ever sees it. */
const canPm = (actor: Actor, mr: Record<string, any>): boolean =>
  actor.role === 'PM' && mr.status === 'PM_PENDING';

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function listMrs(
  actor: Actor,
  query: MrListQuery,
): Promise<{ rows: MrDto[]; total: number }> {
  const filter = listFilterFor(actor, query);
  // Both approval queues are worked by due date; every other list is newest first.
  const sort: Record<string, 1 | -1> =
    query.queue ? { requiredDate: 1 } : { createdAt: -1 };

  const [rows, total, lookups] = await Promise.all([
    Mr.find(filter)
      .sort(sort)
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    Mr.countDocuments(filter),
    buildLookups(),
  ]);

  const ids = rows.map((m) => m._id);
  const lines = await MrLine.find({ mrId: { $in: ids } })
    .select('mrId newStatus itemId newItemName description')
    .lean();

  const counts = new Map<string, { lines: number; newItems: number }>();
  // What each MR asks for, so the list can be searched by material.
  const materials = new Map<string, string[]>();
  for (const line of lines) {
    const key = String(line.mrId);
    const item = line.itemId ? lookups.item(line.itemId) : null;
    const words = materials.get(key) ?? [];
    words.push(item?.name ?? line.newItemName ?? '', item?.code ?? '', line.description ?? '');
    materials.set(key, words);
    const entry = counts.get(key) ?? { lines: 0, newItems: 0 };
    entry.lines += 1;
    if (line.newStatus === 'PENDING') entry.newItems += 1;
    counts.set(key, entry);
  }

  return {
    rows: rows.map((m) => ({
      ...toMrDto(m, lookups, counts.get(String(m._id)) ?? { lines: 0, newItems: 0 }),
      materialText: (materials.get(String(m._id)) ?? []).filter(Boolean).join(' '),
    })),
    total,
  };
}

export async function getMr(actor: Actor, id: string): Promise<MrDetailDto> {
  const mr = await Mr.findById(id).lean();
  if (!mr) throw notFound();
  assertCanRead(actor, mr);

  const [lines, lookups, world, company] = await Promise.all([
    MrLine.find({ mrId: id }).sort({ sn: 1 }).lean(),
    buildLookups(),
    loadWorld({ includeClosed: true }),
    companyFor(),
  ]);

  const lineDtos: MrLineDetailDto[] = lines.map((line) => {
    const calcLine = world.mrLines.find((l) => l.id === String(line._id));
    const calc = calcLine
      ? lineCalc(world, calcLine)
      : lineCalc(world, {
          id: String(line._id),
          mrId: String(line.mrId),
          sn: line.sn,
          itemId: line.itemId ? String(line.itemId) : null,
          qty: num(line.qty),
          storeQty: line.storeQty,
          poQty: line.poQty,
          lineStatus: line.lineStatus,
        });

    const s = line.itemId ? stock(world, String(line.itemId)) : null;

    return {
      ...toMrLineDto(line, lookups),
      calc: {
        store: calc.store,
        po: calc.po,
        approved: calc.approved,
        cut: calc.cut,
        poAlloc: calc.poAlloc,
        rfqOpen: calc.rfqOpen,
        poolOpen: calc.poolOpen,
        received: calc.received,
        recStore: calc.recStore,
        recSite: calc.recSite,
        issuable: calc.issuable,
        issuedGross: calc.issuedGross,
        issuedNet: calc.issuedNet,
        pendingIssue: calc.pendingIssue,
        accepted: calc.accepted,
        siteAcc: calc.siteAcc,
        balance: calc.balance,
        closed: calc.closed,
      },
      available: s?.available ?? 0,
      onHand: s?.onHand ?? 0,
    };
  });

  const lineIds = lines.map((l) => l._id);
  const [allocs, issues, trail, rfqLines] = await Promise.all([
    PoAlloc.find({ mrLineId: { $in: lineIds } }).select('poId qty').lean(),
    Issue.find({ mrId: id }).select('no status').lean(),
    trailFor('MR', id, lookups),
    RfqLine.find({ 'allocs.mrLineId': { $in: lineIds } }).select('rfqId').lean(),
  ]);

  // Everything procurement, the Procurement Manager and management did with
  // this request — the requester and the PM see the same chain they do.
  const poIds = [...new Set(allocs.map((a) => String(a.poId)))];
  const pos = await Po.find({ _id: { $in: poIds } }).lean();

  const linkedPos: LinkedPoDto[] = pos
    .map((po) => {
      const mine = allocs.filter((a) => String(a.poId) === String(po._id));
      return {
        id: String(po._id),
        no: po.no + (num(po.rev) > 0 ? ` Rev ${po.rev}` : ''),
        status: po.status,
        vendorName: lookups.vendorName(po.vendorId),
        qty: num(mine.reduce((sum, a) => sum + num(a.qty), 0)),
        total: num(po.total),
        raisedByName: lookups.userName(po.createdBy),
        raisedAt: po.createdAt.toISOString(),
        procMgrByName: po.procMgrBy ? lookups.userName(po.procMgrBy) : null,
        procMgrAt: po.procMgrAt ? po.procMgrAt.toISOString() : null,
        qsByName: po.qsBy ? lookups.userName(po.qsBy) : null,
        qsAt: po.qsAt ? po.qsAt.toISOString() : null,
        qsRemark: po.qsRemark ?? '',
        approvedByName: po.approvedBy ? lookups.userName(po.approvedBy) : null,
        approvedAt: po.approvedAt ? po.approvedAt.toISOString() : null,
        lastComment: po.lastComment ?? '',
        lastCommentRole: po.lastCommentRole ?? '',
        lastCommentByName: po.lastCommentBy ? lookups.userName(po.lastCommentBy) : '',
      };
    })
    .sort((a, b) => a.raisedAt.localeCompare(b.raisedAt));

  // The enquiry stage, which comes before any PO exists.
  const rfqIds = [...new Set(rfqLines.map((l) => String(l.rfqId)))];
  const rfqs = await Rfq.find({ _id: { $in: rfqIds } })
    .select('no status dueAt')
    .lean();

  return {
    ...toMrDto(mr, lookups, {
      lines: lines.length,
      newItems: lines.filter((l) => l.newStatus === 'PENDING').length,
    }),
    lines: lineDtos,
    trail: actor.role === 'VENDOR' ? [] : trail,
    linkedPos,
    linkedRfqs: rfqs.map((r) => ({
      id: String(r._id),
      no: r.no,
      status: r.status,
      dueAt: r.dueAt ? r.dueAt.toISOString() : '',
    })),
    linkedIssues: issues.map((i) => ({
      id: String(i._id),
      no: i.no,
      status: i.status,
    })),
    canEdit: canEdit(actor, mr),
    canQs: canQs(actor, mr),
    canPm: canPm(actor, mr),
    // The requester and both approvers all open the same files.
    boqFiles: boqFilesOf(mr).map(toBoqFileDto),
    companyName: company?.name ?? '',
    companyLegalName: company?.legalName || company?.name || '',
    companyLogoUrl: company?.logo?.url ?? null,
  };
}

/** Prototype: mrDoc(m) — everything the paper MR form needs. */
export async function getMrsForPrint(
  actor: Actor,
  ids: string[],
): Promise<MrPrintDto[]> {
  const mrs = await Mr.find({ _id: { $in: ids.map(oid) } }).lean();
  const lookups = await buildLookups();
  const company = await companyFor();

  const out: MrPrintDto[] = [];
  for (const mr of mrs) {
    assertCanRead(actor, mr);
    const lines = await MrLine.find({ mrId: mr._id }).sort({ sn: 1 }).lean();
    out.push({
      mr: toMrDto(mr, lookups, {
        lines: lines.length,
        newItems: lines.filter((l) => l.newStatus === 'PENDING').length,
      }),
      lines: lines.map((l) => toMrLineDto(l, lookups)),
      company: company ? toCompanyDto(company) : null,
      requestedByName: lookups.userName(mr.createdBy),
      qsName: mr.qsBy ? lookups.userName(mr.qsBy) : null,
      qsAt: mr.qsAt ? mr.qsAt.toISOString() : null,
    });
  }
  // Keep the order the caller asked for.
  return ids
    .map((id) => out.find((row) => row.mr.id === id))
    .filter((row): row is MrPrintDto => !!row);
}

// ---------------------------------------------------------------------------
// Create / update — prototype A.saveMR
// ---------------------------------------------------------------------------

async function validateMrInput(
  actor: Actor,
  input: UpsertMrInput,
): Promise<void> {
  if (!input.projectId) throw badRequest(MSG.mrNoProject);
  if (!canSeeProject(actor, input.projectId)) {
    throw forbidden('You cannot raise a material request for that project');
  }
  const project = await Project.findById(input.projectId).select('_id').lean();
  if (!project) throw badRequest(MSG.mrNoProject);

  if (!input.submit) return;

  // Everything below only applies when the MR is actually being submitted.
  if (!input.requiredDate) throw badRequest(MSG.mrNoDate);
  const earliest = earliestRequiredDate();
  if (input.requiredDate < earliest) throw badRequest(MSG.mrDateTooSoon(earliest));

  const active = input.lines;
  if (!active.length) throw badRequest(MSG.mrNoLines);
  if (active.some((l) => num(l.qty) <= 0)) throw badRequest(MSG.mrQtyRequired);
  // A description is compulsory on submit — a draft may still be a sketch.
  if (active.some((l) => !l.description?.trim())) {
    throw badRequest(MSG.mrDescriptionRequired);
  }

  // The same item may be on an MR more than once — the same glass in two sizes
  // is two lines, each with its own measurement, quantity and description.
}

export async function createMr(actor: Actor, input: UpsertMrInput): Promise<MrDto> {
  await validateMrInput(actor, input);

  const { id, outboxIds } = await inTransaction(async (session) => {
    const mr = await newMrDocument(actor, input, session);
    const outbox = await writeLines(mr, input, actor, session, true);
    await bumpSyncStamp(session);
    return { id: String(mr._id), outboxIds: outbox };
  });

  await enqueueEmails(outboxIds);
  const lookups = await buildLookups();
  const saved = await Mr.findById(id).lean();
  return toMrDto(saved!, lookups, {
    lines: input.lines.length,
    newItems: input.lines.filter((l) => !l.itemId).length,
  });
}

async function newMrDocument(
  actor: Actor,
  input: UpsertMrInput,
  session: ClientSession,
) {
  const project = await Project.findById(input.projectId).select('code').session(session).lean();

  const [mr] = await Mr.create(
    [
      {
        no: input.submit ? await nextMrNo(project!.code, session) : '',
        projectId: input.projectId,
        requiredDate: input.requiredDate,
        remarks: input.remarks,
        status: input.submit ? 'PM_PENDING' : 'DRAFT',
        createdBy: actor.id,
        submittedAt: input.submit ? new Date() : null,
      },
    ],
    { session, ordered: true },
  );
  return mr!;
}

/**
 * Replaces the MR's lines with what the form posted, keeping the ids of lines
 * that already existed so PO/RFQ/issue allocations stay attached.
 */
async function writeLines(
  mr: Record<string, any>,
  input: UpsertMrInput,
  actor: Actor,
  session: ClientSession,
  isNew: boolean,
): Promise<string[]> {
  const keep: Types.ObjectId[] = [];

  for (const [index, line] of input.lines.entries()) {
    const isNewItem = !line.itemId;
    const payload = {
      mrId: mr._id,
      sn: index + 1,
      itemId: line.itemId ?? null,
      newItemName: isNewItem ? line.newItemName : '',
      newUnit: isNewItem ? (line.newUnit ?? '') : '',
      newCategory: isNewItem ? line.newCategory : '',
      newSpec: isNewItem ? line.newSpec : '',
      qty: num(line.qty),
      description: line.description ?? '',
      measurement: line.measurement ?? '',
      unit: line.unit ?? '',
      boqRef: line.boqRef,
      remarks: line.remarks,
    };

    // On submit we freeze what the site engineer asked for. Every later change
    // by the PM or QS is then visibly a change, not a silent rewrite.
    const asRequested = input.submit
      ? {
          requestedQty: num(line.qty),
          requestedMeasurement: line.measurement ?? '',
          requestedUnit: line.unit ?? '',
        }
      : {};

    if (line.id) {
      const existing = await MrLine.findOne({ _id: line.id, mrId: mr._id }).session(session);
      if (existing) {
        Object.assign(existing, payload, asRequested);
        await existing.save({ session });
        keep.push(existing._id);
        continue;
      }
    }

    const [created] = await MrLine.create(
      [
        {
          ...payload,
          ...asRequested,
          // A brand-new item waits for QS to clear it.
          newStatus: isNewItem ? 'PENDING' : 'NONE',
          lineStatus: 'ACTIVE',
        },
      ],
      { session, ordered: true },
    );
    keep.push(created!._id);
  }

  await MrLine.deleteMany({ mrId: mr._id, _id: { $nin: keep } }, { session });

  const wasSentBack = mr.status === 'SENT_BACK';
  const action = input.submit
    ? wasSentBack
      ? AUDIT.MR_RESUBMITTED
      : AUDIT.MR_SUBMITTED
    : AUDIT.MR_DRAFT_SAVED;
  await writeAudit(session, 'MR', mr._id, action, actor.id);

  if (!input.submit) return [];

  const lookups = await buildLookups();
  return emit(session, 'MR_SUBMITTED', {
    title: `${mr.no} ${wasSentBack ? 'resubmitted' : 'submitted'} — ${lookups.projectCode(
      mr.projectId,
    )}, need by ${mr.requiredDate}`,
    body: `${input.lines.length} item(s) raised by ${actor.name}`,
    link: `mr:${String(mr._id)}`,
    // The Project Manager reviews it first; QS is notified once the PM passes it on.
    to: [{ role: 'PM' }],
    actorId: actor.id,
  });
}

export async function updateMr(
  actor: Actor,
  id: string,
  input: UpsertMrInput,
): Promise<MrDto> {
  await validateMrInput(actor, input);

  const outboxIds = await inTransaction(async (session) => {
    const mr = await Mr.findById(id).session(session);
    if (!mr) throw notFound();
    if (!canEdit(actor, mr)) throw forbidden(MSG.mrEditNotAllowed);
    if (input.rv !== undefined && input.rv !== (mr.rv ?? 0)) throw stale();

    const wasSentBack = mr.status === 'SENT_BACK';
    const before = { status: mr.status, no: mr.no };

    mr.projectId = oid(input.projectId) as never;
    mr.requiredDate = input.requiredDate;
    mr.remarks = input.remarks;

    if (input.submit) {
      if (!mr.no) {
        const project = await Project.findById(input.projectId)
          .select('code')
          .session(session)
          .lean();
        mr.no = await nextMrNo(project!.code, session);
      }
      mr.status = 'PM_PENDING';
      mr.submittedAt = new Date();
    }

    await mr.save({ session });

    const outbox = await writeLines(
      { ...mr.toObject(), status: before.status },
      input,
      actor,
      session,
      false,
    );

    await bumpSyncStamp(session);
    void wasSentBack;
    return outbox;
  });

  await enqueueEmails(outboxIds);
  const lookups = await buildLookups();
  const saved = await Mr.findById(id).lean();
  const lineCount = await MrLine.countDocuments({ mrId: id });
  return toMrDto(saved!, lookups, { lines: lineCount, newItems: 0 });
}

/** Prototype: A.delMR — only a draft can be deleted. */
export async function deleteMr(actor: Actor, id: string): Promise<void> {
  await inTransaction(async (session) => {
    const mr = await Mr.findById(id).session(session);
    if (!mr) throw notFound();
    if (String(mr.createdBy) !== actor.id) throw forbidden();
    if (mr.status !== 'DRAFT') throw conflict(MSG.mrDeleteNotAllowed);

    await MrLine.deleteMany({ mrId: mr._id }, { session });
    await Mr.deleteOne({ _id: mr._id }, { session });
    await bumpSyncStamp(session);
  });
}

/**
 * The administrator removes an MR in any status — a duplicate, a mistake, a test.
 *
 * Refused while anything downstream still points at its lines (a PO, an
 * enquiry, an issue or a stock movement): deleting it then would leave those
 * documents referring to nothing. The message names them, so they can be dealt
 * with first. The MR's own notifications and unsent emails go with it; its
 * trail stays, with the deletion added, so there is a record of who removed it.
 */
export async function adminDeleteMr(actor: Actor, id: string): Promise<{ no: string }> {
  const { no, files } = await inTransaction(async (session) => {
    const mr = await Mr.findById(id).session(session);
    if (!mr) throw notFound();

    const lineIds = (
      await MrLine.find({ mrId: mr._id }).select('_id').session(session).lean()
    ).map((l) => l._id);

    const [allocs, rfqLines, issues, issueLines, ledger] = await Promise.all([
      PoAlloc.find({ mrLineId: { $in: lineIds } }).select('poId').session(session).lean(),
      RfqLine.find({ 'allocs.mrLineId': { $in: lineIds } }).select('rfqId').session(session).lean(),
      Issue.find({ mrId: mr._id }).select('no').session(session).lean(),
      IssueLine.countDocuments({ mrLineId: { $in: lineIds } }).session(session),
      StockLedger.countDocuments({ mrLineId: { $in: lineIds } }).session(session),
    ]);

    const blockers: string[] = [];
    if (allocs.length) {
      const pos = await Po.find({ _id: { $in: allocs.map((a) => a.poId) } }).select('no').session(session).lean();
      blockers.push(`PO ${pos.map((p) => p.no).join(', ')}`);
    }
    if (rfqLines.length) {
      const rfqs = await Rfq.find({ _id: { $in: rfqLines.map((l) => l.rfqId) } }).select('no').session(session).lean();
      blockers.push(`enquiry ${rfqs.map((r) => r.no).join(', ')}`);
    }
    if (issues.length) blockers.push(`issue ${issues.map((i) => i.no).join(', ')}`);
    else if (issueLines || ledger) blockers.push('stock already issued against it');
    if (blockers.length) {
      throw conflict(
        `${mr.no || 'This MR'} cannot be deleted: it is used on ${blockers.join('; ')}. ` +
          'Cancel or revise those first.',
      );
    }

    const link = `mr:${String(mr._id)}`;
    await MrLine.deleteMany({ mrId: mr._id }, { session });
    await Notification.deleteMany({ link }, { session });
    await EmailOutbox.deleteMany(
      { status: { $ne: 'SENT' }, body: { $regex: String(mr._id) } },
      { session },
    );
    await writeAudit(session, 'MR', mr._id, AUDIT.MR_DELETED, actor.id, mr.no);
    const stored = boqFilesOf(mr.toObject()).map((f) => String(f.publicId ?? ''));
    await Mr.deleteOne({ _id: mr._id }, { session });
    await bumpSyncStamp(session);
    return { no: mr.no, files: stored.filter(Boolean) };
  });

  // The attachments go once the MR no longer exists to point at them.
  for (const file of files) await deleteFile(file).catch(() => undefined);
  return { no };
}

// ---------------------------------------------------------------------------
// New items — prototype A.approveNew / A.mapNew / A.rejectNew
// ---------------------------------------------------------------------------

export async function approveNewItem(actor: Actor, lineId: string): Promise<void> {
  await inTransaction(async (session) => {
    const line = await MrLine.findById(lineId).session(session);
    if (!line) throw notFound();
    if (line.newStatus !== 'PENDING') {
      throw conflict('That line has already been cleared');
    }

    const name = line.newItemName.trim();
    // Plan decision (d)(5): the prototype skipped this check here.
    const clash = await Item.findOne({ name })
      .collation({ locale: 'en', strength: 2 })
      .select('code')
      .session(session)
      .lean();
    if (clash) throw conflict(MSG.itemAlreadyInMaster(clash.code));

    const [item] = await Item.create(
      [
        {
          code: await nextItemCode(session),
          name,
          unit: line.newUnit || 'Nos',
          category: line.newCategory || 'General',
          subCategory: '',
          spec: line.newSpec ?? '',
          active: true,
          createdBy: actor.id,
        },
      ],
      { session, ordered: true },
    );

    line.itemId = item!._id as never;
    line.newStatus = 'APPROVED';
    await line.save({ session });

    await writeAudit(
      session,
      'MR',
      line.mrId,
      AUDIT.MR_NEW_ITEM_APPROVED,
      actor.id,
      `${item!.code} ${item!.name}`,
    );
    await bumpSyncStamp(session);
  });
}

export async function mapNewItem(
  actor: Actor,
  lineId: string,
  input: MapNewItemInput,
): Promise<void> {
  await inTransaction(async (session) => {
    const line = await MrLine.findById(lineId).session(session);
    if (!line) throw notFound();
    if (line.newStatus !== 'PENDING') {
      throw conflict('That line has already been cleared');
    }

    const target = await Item.findById(input.itemId).select('code name').session(session).lean();
    if (!target) throw badRequest(MSG.qsChooseMapTarget);

    // Mapping onto an item that is already on the MR is fine: an item may be
    // requested on several lines (different measurements).

    line.itemId = target._id as never;
    line.newStatus = 'MAPPED';
    await line.save({ session });

    await writeAudit(
      session,
      'MR',
      line.mrId,
      AUDIT.MR_NEW_ITEM_MAPPED,
      actor.id,
      `${line.newItemName} → ${target.code}`,
    );
    await bumpSyncStamp(session);
  });
}

export async function rejectNewItem(actor: Actor, lineId: string): Promise<void> {
  await inTransaction(async (session) => {
    const line = await MrLine.findById(lineId).session(session);
    if (!line) throw notFound();

    line.newStatus = 'REJECTED';
    line.lineStatus = 'REJECTED';
    await line.save({ session });

    await writeAudit(
      session,
      'MR',
      line.mrId,
      AUDIT.MR_NEW_ITEM_REJECTED,
      actor.id,
      line.newItemName,
    );
    await bumpSyncStamp(session);
  });
}

// ---------------------------------------------------------------------------
// Project Manager review — the first approval step
// ---------------------------------------------------------------------------

/**
 * Applies an approver's edits to the lines of an MR.
 *
 * Both the PM and QS may change the quantity, the measurement and the unit, or
 * drop a line altogether. The line keeps the original request alongside, so the
 * site engineer can always see what was changed and by how much.
 */
async function applyReviewedLines(
  lines: any[],
  rows: readonly {
    id: string;
    qty: number;
    measurement: string;
    unit?: string;
    rejected: boolean;
    remark: string;
  }[],
  session: ClientSession,
): Promise<{ changed: number; kept: number; rejected: string[]; lookups: Lookups }> {
  const byId = new Map(lines.map((l) => [String(l._id), l]));
  const lookups = await buildLookups();

  let changed = 0;
  let kept = 0;
  const rejected: string[] = [];

  for (const row of rows) {
    const line = byId.get(row.id);
    if (!line) continue;

    if (row.rejected) {
      line.lineStatus = 'REJECTED';
      line.storeQty = 0;
      line.poQty = 0;
      if (row.remark) line.remarks = row.remark;
      rejected.push(lineName(line.toObject(), lookups));
      await line.save({ session });
      continue;
    }

    if (num(row.qty) <= 0) throw badRequest(MSG.mrQtyRequired);

    const wasQty = num(line.qty);
    const wasMeasurement = line.measurement ?? '';
    const wasUnit = line.unit ?? '';

    line.qty = num(row.qty);
    line.measurement = row.measurement ?? '';
    if (row.unit) line.unit = row.unit;
    if (row.remark) line.remarks = row.remark;

    if (
      wasQty !== num(line.qty) ||
      wasMeasurement !== line.measurement ||
      wasUnit !== (line.unit ?? '')
    ) {
      changed += 1;
    }
    kept += 1;
    await line.save({ session });
  }

  return { changed, kept, rejected, lookups };
}

/** Wording both approvers reuse when telling the requester what happened. */
function changeNote(
  changed: number,
  rejected: string[],
  who: string,
  comment: string,
): string {
  return (
    (changed ? `${changed} line(s) changed by ${who}. ` : '') +
    (rejected.length ? `Dropped: ${rejected.join(', ')}. ` : '') +
    (comment ? `${who}: ${comment}` : '')
  ).trim();
}

/**
 * The PM approves the request and passes it to QS, having optionally corrected
 * the quantities, measurements and units the site engineer asked for.
 * A line the PM rejects is dropped here and never reaches QS.
 */
export async function pmApprove(
  actor: Actor,
  id: string,
  input: PmApproveInput,
): Promise<void> {
  const outboxIds = await inTransaction(async (session) => {
    const mr = await Mr.findById(id).session(session);
    if (!mr) throw notFound();
    if (mr.status !== 'PM_PENDING') throw conflict(MSG.mrNotWithPm);
    if (input.rv !== undefined && input.rv !== (mr.rv ?? 0)) throw stale();

    const lines = await MrLine.find({
      mrId: mr._id,
      lineStatus: { $ne: 'REJECTED' },
    }).session(session);

    const { changed, kept, rejected, lookups } = await applyReviewedLines(
      lines,
      input.lines,
      session,
    );
    // Rejecting every line is a rejection of the request, not an approval.
    if (!kept) throw badRequest(MSG.pmNothingApproved);

    mr.status = 'QS_PENDING';
    mr.pmBy = oid(actor.id) as never;
    mr.pmAt = new Date();
    if (input.comment) {
      mr.lastComment = input.comment;
      mr.lastCommentBy = oid(actor.id) as never;
      mr.lastCommentRole = 'PM';
    }
    await mr.save({ session });

    await writeAudit(session, 'MR', mr._id, AUDIT.MR_PM_APPROVED, actor.id, input.comment);
    if (changed || rejected.length) {
      await writeAudit(
        session,
        'MR',
        mr._id,
        AUDIT.MR_PM_CHANGED(changed + rejected.length),
        actor.id,
        rejected.length ? `dropped: ${rejected.join(', ')}` : '',
      );
    }

    const note = changeNote(changed, rejected, 'the PM', input.comment);

    const outbox = await emit(session, 'MR_PM_APPROVED', {
      title: `${mr.no} approved by the Project Manager — now with QS (${lookups.projectCode(
        mr.projectId,
      )})`,
      body: note || `${kept} item(s) passed to QS by ${actor.name}`,
      link: `mr:${String(mr._id)}`,
      // QS picks it up next; the requester is told what the PM changed.
      to: [{ role: 'QS' }, { userId: mr.createdBy }],
      actorId: actor.id,
    });

    await bumpSyncStamp(session);
    return outbox;
  });

  await enqueueEmails(outboxIds);
}

/** The PM sends it back for the site engineer to correct and resubmit. */
export async function pmSendBack(
  actor: Actor,
  id: string,
  input: MrCommentInput,
): Promise<void> {
  const outboxIds = await inTransaction(async (session) => {
    const mr = await Mr.findById(id).session(session);
    if (!mr) throw notFound();
    if (mr.status !== 'PM_PENDING') throw conflict(MSG.mrNotWithPm);
    if (input.rv !== undefined && input.rv !== (mr.rv ?? 0)) throw stale();

    mr.status = 'SENT_BACK';
    mr.lastComment = input.comment;
    mr.lastCommentBy = oid(actor.id) as never;
    mr.lastCommentRole = 'PM';
    await mr.save({ session });

    await writeAudit(session, 'MR', mr._id, AUDIT.MR_PM_SENT_BACK, actor.id, input.comment);
    const outbox = await emit(session, 'MR_SENT_BACK', {
      title: `${mr.no} sent back by the Project Manager`,
      body: input.comment,
      link: `mr:${String(mr._id)}`,
      to: [{ userId: mr.createdBy }],
      actorId: actor.id,
    });

    await bumpSyncStamp(session);
    return outbox;
  });

  await enqueueEmails(outboxIds);
}

/** The PM rejects outright — the request stops here and never reaches QS. */
export async function pmReject(
  actor: Actor,
  id: string,
  input: MrCommentInput,
): Promise<void> {
  const outboxIds = await inTransaction(async (session) => {
    const mr = await Mr.findById(id).session(session);
    if (!mr) throw notFound();
    if (mr.status !== 'PM_PENDING') throw conflict(MSG.mrNotWithPm);
    if (input.rv !== undefined && input.rv !== (mr.rv ?? 0)) throw stale();

    mr.status = 'REJECTED';
    mr.lastComment = input.comment;
    mr.lastCommentBy = oid(actor.id) as never;
    mr.lastCommentRole = 'PM';
    await mr.save({ session });

    await writeAudit(session, 'MR', mr._id, AUDIT.MR_PM_REJECTED, actor.id, input.comment);
    const outbox = await emit(session, 'MR_PM_REJECTED', {
      title: `${mr.no} rejected by the Project Manager`,
      body: input.comment,
      link: `mr:${String(mr._id)}`,
      to: [{ userId: mr.createdBy }],
      actorId: actor.id,
    });

    await bumpSyncStamp(session);
    return outbox;
  });

  await enqueueEmails(outboxIds);
}

// ---------------------------------------------------------------------------
// Bill of quantities — optional, attached by the site engineer
// ---------------------------------------------------------------------------

/** One stored BOQ file, with a link that expires. Keyed by its storage id. */
function toBoqFileDto(file: Record<string, any>): BoqFileDto {
  return {
    id: file.publicId,
    name: file.name,
    size: num(file.size),
    url: signedUrlFor(file.publicId),
  };
}

/** The MR, if this actor is the one allowed to change its attachments. */
async function mrForBoqEdit(actor: Actor, id: string) {
  const mr = await Mr.findById(id);
  if (!mr) throw notFound();
  if (String(mr.createdBy) !== actor.id) throw forbidden();
  if (!canEdit(actor, mr)) throw conflict(MSG.mrEditNotAllowed);
  return mr;
}

/**
 * Attaches BOQ files to an MR, adding to whatever is already there rather than
 * replacing it — a bill of quantities usually arrives as several sheets, and
 * the engineer should be able to add the next one without losing the last.
 *
 * Optional by design: an MR is raised perfectly well without any. Once
 * submitted, the PM and QS see the same files.
 */
export async function attachBoq(
  actor: Actor,
  id: string,
  files: Express.Multer.File[],
): Promise<BoqFileDto[]> {
  if (!files?.length) throw badRequest(MSG.boqNoFiles);

  const mr = await mrForBoqEdit(actor, id);
  const already = (mr.boqFiles ?? []).length;
  if (already + files.length > MAX_BOQ_FILES) {
    throw badRequest(MSG.boqTooMany(MAX_BOQ_FILES));
  }

  // Upload them all before touching the MR, so a bad file in the middle of a
  // batch does not leave the request half-changed.
  const stored = [];
  for (const file of files) {
    stored.push(await uploadBoq(file, 'boq'));
  }

  mr.boqFiles = [...(mr.boqFiles ?? []), ...stored] as never;
  await mr.save();

  return (mr.boqFiles as unknown as Record<string, any>[]).map(toBoqFileDto);
}

/**
 * Removes one file, while the MR is still the site engineer's to edit.
 * `fileId` is the file's storage id, which is random — knowing an MR's id is
 * not enough to guess what is attached to it.
 */
export async function removeBoqFile(
  actor: Actor,
  id: string,
  fileId: string,
): Promise<BoqFileDto[]> {
  const mr = await mrForBoqEdit(actor, id);

  const files = (mr.boqFiles ?? []) as unknown as Record<string, any>[];
  const keep = files.filter((f) => f.publicId !== fileId);
  // The legacy single attachment is removable by its id too.
  const legacy = mr.boq?.publicId === fileId;

  if (keep.length === files.length && !legacy) throw notFound(MSG.boqNotFound);

  mr.boqFiles = keep as never;
  if (legacy) mr.boq = null;
  await mr.save();

  // Only drop the bytes once the MR no longer points at them.
  await deleteFile(fileId);

  return boqFilesOf(mr.toObject()).map(toBoqFileDto);
}

/**
 * Fresh signed links to every BOQ file, for whoever may read the MR — the
 * requester, the Project Manager and QS all need them.
 */
export async function boqLinks(actor: Actor, id: string): Promise<BoqFileDto[]> {
  const mr = await Mr.findById(id).lean();
  if (!mr) throw notFound();
  assertCanRead(actor, mr);
  return boqFilesOf(mr).map(toBoqFileDto);
}

// ---------------------------------------------------------------------------
// QS decisions — prototype A.qsApprove / A.sendBack / A.rejectMR
// ---------------------------------------------------------------------------

export async function qsApprove(
  actor: Actor,
  id: string,
  input: QsApproveInput,
): Promise<void> {
  const outboxIds = await inTransaction(async (session) => {
    const mr = await Mr.findById(id).session(session);
    if (!mr) throw notFound();
    if (mr.status !== 'QS_PENDING') {
      throw conflict('This MR is no longer waiting for QS');
    }
    if (input.rv !== undefined && input.rv !== (mr.rv ?? 0)) throw stale();

    const lines = await MrLine.find({ mrId: mr._id }).session(session);

    if (lines.some((l) => l.newStatus === 'PENDING')) {
      throw badRequest(MSG.qsClearNewItems);
    }

    const active = lines.filter((l) => l.lineStatus !== 'REJECTED');
    const byId = new Map(active.map((l) => [String(l._id), l]));
    const lookups = await buildLookups();

    // Validate the whole split before writing any of it. QS may have revised
    // the quantity on the way through, so the split is judged against the
    // quantity QS is approving, not the one that arrived.
    const storeByItem = new Map<string, number>();
    let approvedAny = 0;

    for (const row of input.lines) {
      const line = byId.get(row.id);
      if (!line || row.rejected) continue;

      const store = num(row.storeQty);
      const po = num(row.poQty);
      if (store < 0 || po < 0) throw badRequest(MSG.qsNegative);

      const name = lineName(line.toObject(), lookups);
      const approving = num(row.qty);
      if (store + po > approving) {
        throw badRequest(
          MSG.qsOverRequested(name, String(num(store + po)), String(approving)),
        );
      }
      if (store + po > 0) approvedAny += 1;

      if (line.itemId && store > 0) {
        const key = String(line.itemId);
        storeByItem.set(key, num((storeByItem.get(key) ?? 0) + store));
      }
    }

    if (!approvedAny) throw badRequest(MSG.qsNothingApproved);

    // Plan decision (d)(17): availability is checked inside the transaction,
    // so two QS users approving at once cannot over-commit the same stock.
    if (storeByItem.size) {
      const world = await loadWorld();
      for (const [itemId, wanted] of storeByItem) {
        const available = stock(world, itemId).available;
        if (wanted > available) {
          const item = lookups.item(itemId);
          throw badRequest(
            MSG.qsOverAvailable(item?.name ?? 'Item', String(num(available))),
          );
        }
      }
    }

    // The same quantity / measurement / unit edits the PM could make.
    const { changed, rejected } = await applyReviewedLines(
      active,
      input.lines,
      session,
    );

    for (const row of input.lines) {
      const line = byId.get(row.id);
      if (!line || row.rejected) continue;
      line.storeQty = num(row.storeQty);
      line.poQty = num(row.poQty);
      line.qsRemark = row.qsRemark;
      await line.save({ session });
    }

    mr.status = 'APPROVED';
    mr.qsBy = oid(actor.id) as never;
    mr.qsAt = new Date();
    mr.lastComment = input.comment;
    mr.lastCommentBy = oid(actor.id) as never;
    mr.lastCommentRole = 'QS';
    await mr.save({ session });

    const kept = input.lines.filter((r) => !r.rejected);
    const storeTotal = num(kept.reduce((sum, r) => sum + num(r.storeQty), 0));
    const poTotal = num(kept.reduce((sum, r) => sum + num(r.poQty), 0));

    await writeAudit(
      session,
      'MR',
      mr._id,
      AUDIT.MR_QS_APPROVED,
      actor.id,
      `store ${storeTotal} · PO ${poTotal}`,
    );
    if (changed || rejected.length) {
      await writeAudit(
        session,
        'MR',
        mr._id,
        AUDIT.MR_QS_CHANGED(changed + rejected.length),
        actor.id,
        rejected.length ? `dropped: ${rejected.join(', ')}` : '',
      );
    }

    const note = changeNote(changed, rejected, 'QS', input.comment);

    const outbox = await emit(session, 'MR_APPROVED', {
      title: `${mr.no} approved by QS — ${lookups.projectCode(mr.projectId)}`,
      body:
        `From store: ${storeTotal} · For PO: ${poTotal}` +
        (note ? `\n${note}` : ''),
      link: `mr:${String(mr._id)}`,
      to: [
        { userId: mr.createdBy },
        // The PM approved it, so the PM is told what QS made of it.
        mr.pmBy ? { userId: mr.pmBy } : null,
        poTotal > 0 ? { role: 'PROC' } : null,
        storeTotal > 0 ? { role: 'STORE' } : null,
      ],
      actorId: actor.id,
    });

    await bumpSyncStamp(session);
    return outbox;
  });

  await enqueueEmails(outboxIds);
  // An MR can already be complete if QS approved only store quantity that is
  // immediately satisfied — check, exactly as the prototype's refreshMR does.
  await closeMrIfComplete(id, actor.id);
}

export async function sendBackMr(
  actor: Actor,
  id: string,
  input: MrCommentInput,
): Promise<void> {
  const outboxIds = await inTransaction(async (session) => {
    const mr = await Mr.findById(id).session(session);
    if (!mr) throw notFound();
    if (mr.status !== 'QS_PENDING') throw conflict(MSG.mrNotWithQs);
    if (input.rv !== undefined && input.rv !== (mr.rv ?? 0)) throw stale();

    mr.status = 'SENT_BACK';
    mr.lastComment = input.comment;
    mr.lastCommentBy = oid(actor.id) as never;
    mr.lastCommentRole = 'QS';
    await mr.save({ session });

    await writeAudit(session, 'MR', mr._id, AUDIT.MR_SENT_BACK, actor.id, input.comment);
    const outbox = await emit(session, 'MR_SENT_BACK', {
      title: `${mr.no} sent back by QS`,
      body: input.comment,
      link: `mr:${String(mr._id)}`,
      // The PM passed it to QS, so the PM needs to know it came back.
      to: [{ userId: mr.createdBy }, mr.pmBy ? { userId: mr.pmBy } : null],
      actorId: actor.id,
    });

    await bumpSyncStamp(session);
    return outbox;
  });

  await enqueueEmails(outboxIds);
}

export async function rejectMr(
  actor: Actor,
  id: string,
  input: MrCommentInput,
): Promise<void> {
  const outboxIds = await inTransaction(async (session) => {
    const mr = await Mr.findById(id).session(session);
    if (!mr) throw notFound();
    if (mr.status !== 'QS_PENDING') throw conflict(MSG.mrNotWithQs);
    if (input.rv !== undefined && input.rv !== (mr.rv ?? 0)) throw stale();

    mr.status = 'REJECTED';
    mr.lastComment = input.comment;
    mr.lastCommentBy = oid(actor.id) as never;
    mr.lastCommentRole = 'QS';
    await mr.save({ session });

    await writeAudit(session, 'MR', mr._id, AUDIT.MR_REJECTED, actor.id, input.comment);
    const outbox = await emit(session, 'MR_REJECTED', {
      title: `${mr.no} rejected by QS`,
      body: input.comment,
      link: `mr:${String(mr._id)}`,
      // A QS rejection must reach the requester *and* the PM who approved it.
      to: [{ userId: mr.createdBy }, mr.pmBy ? { userId: mr.pmBy } : null],
      actorId: actor.id,
    });

    await bumpSyncStamp(session);
    return outbox;
  });

  await enqueueEmails(outboxIds);
}

// ---------------------------------------------------------------------------
// Auto-close — prototype refreshMR()
// ---------------------------------------------------------------------------

/**
 * Closes an MR once every approved line has been accepted at site. Called
 * after a GRN, an issue acceptance and a QS approval.
 */
export async function closeMrIfComplete(
  mrId: string,
  actorId: string,
): Promise<void> {
  const world = await loadWorld();
  if (!shouldCloseMr(world, mrId)) return;

  const outboxIds = await inTransaction(async (session) => {
    const mr = await Mr.findById(mrId).session(session);
    if (!mr || mr.status !== 'APPROVED') return [];

    mr.status = 'CLOSED';
    mr.closedAt = new Date();
    await mr.save({ session });

    await writeAudit(
      session,
      'MR',
      mr._id,
      AUDIT.MR_CLOSED,
      actorId,
      'All approved quantity accepted at site',
    );

    const outbox = await emit(session, 'MR_CLOSED', {
      title: `${mr.no} closed — all material received at site`,
      link: `mr:${String(mr._id)}`,
      to: [{ userId: mr.createdBy }, { role: 'QS' }],
      actorId,
    });

    await bumpSyncStamp(session);
    return outbox;
  });

  await enqueueEmails(outboxIds);
}

/** Prototype: A.mrCsv — the MR list export, column for column. */
export async function mrCsvRows(
  actor: Actor,
  ids: string[],
): Promise<Record<string, unknown>[]> {
  const mrs = await Mr.find({ _id: { $in: ids.map(oid) } }).lean();
  const lookups = await buildLookups();
  const out: Record<string, unknown>[] = [];

  for (const id of ids) {
    const mr = mrs.find((m) => String(m._id) === id);
    if (!mr) continue;
    assertCanRead(actor, mr);

    const lines = await MrLine.find({ mrId: mr._id }).sort({ sn: 1 }).lean();
    for (const line of lines) {
      out.push({
        'MR No': mr.no,
        Date: (mr.submittedAt ?? mr.createdAt).toISOString().slice(0, 10),
        'Job No': lookups.projectCode(mr.projectId),
        'Job Name': lookups.projectName(mr.projectId),
        'S.No': line.sn,
        'BOQ Ref': line.boqRef ?? '',
        Description:
          lineName(line, lookups) +
          (line.description ? ` — ${line.description}` : '') +
          (line.remarks ? ` (${line.remarks})` : ''),
        Measurement: line.measurement ?? '',
        Qty: num(line.qty),
        // Blank unless an approver changed it, so the column reads as an exception.
        'Requested qty': approverChanged(line) ? num(line.requestedQty) : '',
        Unit: lineUnit(line, lookups),
        'Req Date': mr.requiredDate,
        'QS store': line.storeQty ?? '',
        'QS PO': line.poQty ?? '',
        Status:
          line.lineStatus === 'REJECTED' ? 'Line rejected' : mrStatusLabel(mr.status),
        'Requested by': lookups.userName(mr.createdBy),
        PM: mr.pmBy ? lookups.userName(mr.pmBy) : '',
        QS: mr.qsBy ? lookups.userName(mr.qsBy) : '',
      });
    }
  }
  return out;
}

const mrStatusLabel = (status: string): string =>
  ({
    DRAFT: 'Draft',
    PM_PENDING: 'With PM',
    QS_PENDING: 'With QS',
    SENT_BACK: 'Sent back',
    REJECTED: 'Rejected',
    APPROVED: 'In progress',
    CLOSED: 'Closed',
  })[status] ?? status;

