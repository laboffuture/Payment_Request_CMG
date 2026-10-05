import { Types } from 'mongoose';
import { allocReceived, issueRows, lineCalc, num, stock } from '@cm/calc';
import {
  MSG,
  type AcceptIssueInput,
  type CreateIssueInput,
  type GrnDto,
  type GrnOpenPoDto,
  type IssuableMrDto,
  type IssueDetailDto,
  type IssueDto,
  type OpenPosQuery,
  type PostGrnInput,
} from '@cm/shared';
import { inTransaction } from '../db.js';
import { AUDIT, writeAudit } from '../lib/audit.js';
import { nextGrnNo, nextIssueNo } from '../lib/counters.js';
import { badRequest, conflict, forbidden, notFound, stale } from '../lib/errors.js';
import { emit } from '../lib/notify.js';
import { bumpSyncStamp } from '../lib/sync.js';
import { buildLookups } from '../lib/lookups.js';
import { loadWorld } from '../lib/world.js';
import { enqueueEmails } from '../jobs/queues.js';
import { Mr, MrLine } from '../models/mr.js';
import { Po, PoAlloc, PoLine, VendorDoc } from '../models/po.js';
import { Grn, GrnLine, Issue, IssueLine, StockLedger } from '../models/stock.js';
import { canSeeProject, projectScopeOf, type Actor } from '../middleware/auth.js';
import { closeMrIfComplete } from './mr.service.js';
import { refreshPoStatus } from './po.service.js';

/**
 * Receiving, issuing and site acceptance — everything that moves stock.
 * Prototype origin: VIEWS.grn / issue / issues / receive, grnSection(),
 * A.postGRN, A.createIssue, A.acceptIssue.
 *
 * Every movement writes an append-only `stockLedger` row inside the same
 * transaction as the document that caused it (§5).
 */

const oid = (v: string) => new Types.ObjectId(v);

// ---------------------------------------------------------------------------
// GRN
// ---------------------------------------------------------------------------

/**
 * Open POs for a location, and — when one is picked — its receivable lines.
 * Plan decision (d)(7): a project-scoped site user only ever sees deliveries
 * for their own projects.
 */
export async function openPos(
  actor: Actor,
  query: OpenPosQuery,
): Promise<{ pos: { id: string; no: string; vendorName: string }[]; selected: GrnOpenPoDto | null }> {
  if (query.location === 'STORE' && actor.role !== 'STORE' && actor.role !== 'ADMIN') {
    throw forbidden();
  }
  if (query.location === 'SITE' && actor.role !== 'SITE' && actor.role !== 'ADMIN') {
    throw forbidden();
  }

  const [candidates, lookups, world] = await Promise.all([
    Po.find({
      status: { $in: ['APPROVED', 'PARTIAL'] },
      deliverTo: query.location,
    })
      .sort({ createdAt: -1 })
      .lean(),
    buildLookups(),
    loadWorld({ includeClosed: true }),
  ]);

  const scope = projectScopeOf(actor);
  const allocs = await PoAlloc.find({
    poId: { $in: candidates.map((p) => p._id) },
  }).lean();

  const visible = candidates.filter((po) => {
    if (!scope) return true;
    return allocs
      .filter((a) => String(a.poId) === String(po._id))
      .some((a) => scope.includes(String(a.projectId)));
  });

  const list = visible.map((po) => ({
    id: String(po._id),
    no: po.no + (num(po.rev) > 0 ? ` Rev ${po.rev}` : ''),
    vendorName: lookups.vendorName(po.vendorId),
  }));

  if (!query.no) return { pos: list, selected: null };

  // Prototype A.findPO: look the number up and explain why it cannot be used.
  const wanted = query.no.trim().toLowerCase();
  const po = await Po.findOne({ no: new RegExp(`^${wanted.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }).lean();
  if (!po) throw notFound(MSG.poNotFound);

  const display = po.no + (num(po.rev) > 0 ? ` Rev ${po.rev}` : '');
  if (!['APPROVED', 'PARTIAL'].includes(po.status)) {
    throw conflict(MSG.poWrongStatusToReceive(display, po.status.toLowerCase()));
  }
  if (po.deliverTo !== query.location) {
    throw conflict(
      MSG.poWrongLocation(display, po.deliverTo === 'SITE' ? 'site' : 'store'),
    );
  }
  if (!visible.some((v) => String(v._id) === String(po._id))) throw forbidden();

  const [poAllocs, poLines] = await Promise.all([
    PoAlloc.find({ poId: po._id }).lean(),
    PoLine.find({ poId: po._id }).lean(),
  ]);

  const mrLines = await MrLine.find({ _id: { $in: poAllocs.map((a) => a.mrLineId) } })
    .select('mrId')
    .lean();
  const mrs = await Mr.find({ _id: { $in: mrLines.map((l) => l.mrId) } })
    .select('no')
    .lean();

  const docs = await VendorDoc.find({ poId: po._id, docType: 'DO' })
    .sort({ uploadedAt: 1 })
    .select('docNo')
    .lean();

  const lines = poAllocs.map((alloc) => {
    const poLine = poLines.find((l) => String(l._id) === String(alloc.poLineId));
    const item = lookups.item(poLine?.itemId)!;
    const mrLine = mrLines.find((l) => String(l._id) === String(alloc.mrLineId));
    const mr = mrs.find((m) => String(m._id) === String(mrLine?.mrId));
    const received = allocReceived(world, String(alloc._id));

    return {
      poAllocId: String(alloc._id),
      itemId: item.id,
      itemCode: item.code,
      itemName: item.name,
      unit: item.unit,
      projectId: String(alloc.projectId),
      projectCode: lookups.projectCode(alloc.projectId),
      mrNo: mr?.no ?? '',
      ordered: num(alloc.qty),
      receivedBefore: received,
      balance: Math.max(0, num(num(alloc.qty) - received)),
    };
  });

  const { listPos } = await import('./po.service.js');
  const { rows } = await listPos(actor, {
    status: '',
    projectId: '',
    page: 1,
    limit: 500,
  });
  const dto = rows.find((r) => r.id === String(po._id))!;

  return {
    pos: list,
    selected: {
      po: dto,
      lines,
      projectCount: new Set(lines.map((l) => l.projectId)).size,
      suggestedDnNo: docs.length ? docs[docs.length - 1]!.docNo : '',
      vendorDoNos: docs.map((d) => d.docNo),
    },
  };
}

/**
 * Prototype: A.postGRN.
 *
 * A store delivery adds stock. A site delivery posts in *and* out in the same
 * transaction, so it never sits in the main store and counts as accepted at
 * site (§8). Rejected quantity is recorded but stays open on the PO.
 */
export async function postGrn(actor: Actor, input: PostGrnInput): Promise<{ no: string }> {
  if (input.location === 'STORE' && actor.role !== 'STORE' && actor.role !== 'ADMIN') {
    throw forbidden();
  }
  if (input.location === 'SITE' && actor.role !== 'SITE' && actor.role !== 'ADMIN') {
    throw forbidden();
  }

  const world = await loadWorld({ includeClosed: true });
  const lookups = await buildLookups();

  const result = await inTransaction(async (session) => {
    const po = await Po.findById(input.poId).session(session);
    if (!po) throw notFound();
    if (!['APPROVED', 'PARTIAL'].includes(po.status)) {
      throw conflict('That PO can no longer be received against');
    }
    if (po.deliverTo !== input.location) {
      throw conflict(
        MSG.poWrongLocation(po.no, po.deliverTo === 'SITE' ? 'site' : 'store'),
      );
    }

    const allocs = await PoAlloc.find({ poId: po._id }).session(session).lean();
    const poLines = await PoLine.find({ poId: po._id }).session(session).lean();
    const byAlloc = new Map(allocs.map((a) => [String(a._id), a]));

    const rows: { alloc: (typeof allocs)[number]; received: number; rejected: number }[] = [];

    for (const row of input.lines) {
      const alloc = byAlloc.get(row.poAllocId);
      if (!alloc) continue;

      const received = num(row.qtyReceived);
      const rejected = num(row.qtyRejected);
      if (received < 0 || rejected < 0) throw badRequest(MSG.qsNegative);

      const balance = Math.max(
        0,
        num(num(alloc.qty) - allocReceived(world, String(alloc._id))),
      );
      if (received > balance) throw badRequest(MSG.grnOverBalance(String(balance)));

      if (received || rejected) rows.push({ alloc, received, rejected });
    }

    if (!rows.some((r) => r.received > 0)) throw badRequest(MSG.grnQtyRequired);

    const [grn] = await Grn.create(
      [
        {
          no: await nextGrnNo(session),
          poId: po._id,
          location: input.location,
          dnNo: input.dnNo,
          invNo: input.invNo,
          remark: input.remark,
          createdBy: actor.id,
        },
      ],
      { session, ordered: true },
    );

    const touchedMrs = new Set<string>();
    const projects = new Set<string>();

    for (const row of rows) {
      await GrnLine.create(
        [
          {
            grnId: grn!._id,
            poAllocId: row.alloc._id,
            qtyReceived: row.received,
            qtyRejected: row.rejected,
          },
        ],
        { session, ordered: true },
      );

      if (!row.received) continue;

      const poLine = poLines.find((l) => String(l._id) === String(row.alloc.poLineId));
      const mrLine = await MrLine.findById(row.alloc.mrLineId)
        .select('mrId')
        .session(session)
        .lean();
      if (mrLine) touchedMrs.add(String(mrLine.mrId));
      projects.add(String(row.alloc.projectId));

      await StockLedger.create(
        [
          {
            at: new Date(),
            itemId: poLine!.itemId,
            docType: 'GRN',
            docNo: grn!.no,
            refNo: po.no,
            projectId: row.alloc.projectId,
            mrLineId: row.alloc.mrLineId,
            qtyIn: row.received,
            qtyOut: 0,
            note: input.location === 'SITE' ? 'Delivered to site' : '',
          },
        ],
        { session, ordered: true },
      );

      // A site delivery never rests in the main store.
      if (input.location === 'SITE') {
        await StockLedger.create(
          [
            {
              at: new Date(),
              itemId: poLine!.itemId,
              docType: 'SITE_GRN',
              docNo: grn!.no,
              refNo: po.no,
              projectId: row.alloc.projectId,
              mrLineId: row.alloc.mrLineId,
              qtyIn: 0,
              qtyOut: row.received,
              note: 'Received at site',
            },
          ],
          { session, ordered: true },
        );
      }
    }

    await writeAudit(
      session,
      'PO',
      po._id,
      AUDIT.PO_GRN_POSTED,
      actor.id,
      `${grn!.no} · ${projects.size} project(s)`,
    );

    const requesters: string[] = [];
    for (const mrId of touchedMrs) {
      const mr = await Mr.findById(mrId).select('createdBy').session(session).lean();
      if (mr) requesters.push(String(mr.createdBy));
    }

    const outbox = await emit(session, 'GRN_POSTED', {
      title: `${grn!.no}: goods received against ${po.no} at ${
        input.location === 'SITE' ? 'site' : 'store'
      }`,
      body: `${lookups.vendorName(po.vendorId)} · projects ${[...projects]
        .map(lookups.projectCode)
        .join(', ')}`,
      link: `po:${String(po._id)}`,
      to: [{ role: 'PROC' }, ...requesters.map((u) => ({ userId: u }))],
      actorId: actor.id,
    });

    await bumpSyncStamp(session);
    return { no: grn!.no, poId: String(po._id), mrs: [...touchedMrs], outbox };
  });

  await enqueueEmails(result.outbox);
  await refreshPoStatus(result.poId);
  for (const mrId of result.mrs) await closeMrIfComplete(mrId, actor.id);

  return { no: result.no };
}

export async function listGrns(limit = 15): Promise<GrnDto[]> {
  const [grns, lookups] = await Promise.all([
    Grn.find({}).sort({ createdAt: -1 }).limit(limit).lean(),
    buildLookups(),
  ]);

  const pos = await Po.find({ _id: { $in: grns.map((g) => g.poId) } })
    .select('no rev vendorId')
    .lean();
  const lines = await GrnLine.find({ grnId: { $in: grns.map((g) => g._id) } }).lean();
  const allocs = await PoAlloc.find({
    _id: { $in: lines.map((l) => l.poAllocId) },
  })
    .select('projectId')
    .lean();

  return grns.map((grn) => {
    const po = pos.find((p) => String(p._id) === String(grn.poId));
    const myLines = lines.filter(
      (l) => String(l.grnId) === String(grn._id) && num(l.qtyReceived) > 0,
    );
    const codes = new Set(
      myLines
        .map((l) => allocs.find((a) => String(a._id) === String(l.poAllocId)))
        .filter(Boolean)
        .map((a) => lookups.projectCode(a!.projectId)),
    );

    return {
      id: String(grn._id),
      rv: grn.rv ?? 0,
      createdAt: grn.createdAt.toISOString(),
      updatedAt: grn.updatedAt.toISOString(),
      no: grn.no,
      poId: String(grn.poId),
      poNo: po ? po.no + (num(po.rev) > 0 ? ` Rev ${po.rev}` : '') : '',
      vendorName: po ? lookups.vendorName(po.vendorId) : '',
      location: grn.location,
      dnNo: grn.dnNo,
      invNo: grn.invNo ?? '',
      remark: grn.remark ?? '',
      createdByName: lookups.userName(grn.createdBy),
      projectCodes: [...codes],
    };
  });
}

// ---------------------------------------------------------------------------
// Issue to site — prototype VIEWS.issue / A.createIssue
// ---------------------------------------------------------------------------

export async function issuableMrs(): Promise<IssuableMrDto[]> {
  const [world, lookups] = await Promise.all([loadWorld(), buildLookups()]);

  const byMr = new Map<string, IssuableMrDto>();

  for (const row of issueRows(world)) {
    const item = row.line.itemId ? lookups.item(row.line.itemId) : null;
    const onHand = row.line.itemId ? stock(world, row.line.itemId).onHand : 0;

    const entry =
      byMr.get(row.mr.id) ??
      ({
        mrId: row.mr.id,
        mrNo: row.mr.no,
        projectCode: lookups.projectCode(row.mr.projectId),
        projectName: lookups.projectName(row.mr.projectId),
        requiredDate: row.mr.requiredDate,
        lines: [],
      } satisfies IssuableMrDto);

    entry.lines.push({
      mrLineId: row.line.id,
      itemId: row.line.itemId ?? '',
      itemName: item?.name ?? row.line.newItemName ?? '—',
      unit: item?.unit ?? row.line.newUnit ?? '',
      issuable: row.calc.issuable,
      onHand,
      // Prototype: the input defaults to min(issuable, on hand).
      suggested: Math.max(0, Math.min(row.calc.issuable, onHand)),
    });

    byMr.set(row.mr.id, entry);
  }

  return [...byMr.values()].sort((a, b) =>
    a.requiredDate.localeCompare(b.requiredDate),
  );
}

export async function createIssue(
  actor: Actor,
  input: CreateIssueInput,
): Promise<{ no: string }> {
  if (actor.role !== 'STORE' && actor.role !== 'ADMIN') throw forbidden();

  const world = await loadWorld();
  const lookups = await buildLookups();

  const result = await inTransaction(async (session) => {
    const mr = await Mr.findById(input.mrId).session(session);
    if (!mr) throw notFound();
    if (mr.status !== 'APPROVED') throw conflict('That MR is not open for issue');

    const usedByItem = new Map<string, number>();
    const rows: { mrLineId: string; itemId: string; qty: number }[] = [];

    for (const row of input.lines) {
      const qty = num(row.qtyIssued);
      if (qty < 0) throw badRequest(MSG.qsNegative);
      if (!qty) continue;

      const line = world.mrLines.find((l) => l.id === row.mrLineId);
      if (!line || !line.itemId) continue;

      const item = lookups.item(line.itemId);
      const name = item?.name ?? 'Item';
      const calc = lineCalc(world, line);

      if (qty > calc.issuable) {
        throw badRequest(MSG.issueOverIssuable(name, String(calc.issuable)));
      }

      const used = num((usedByItem.get(line.itemId) ?? 0) + qty);
      usedByItem.set(line.itemId, used);
      if (used > stock(world, line.itemId).onHand) {
        throw badRequest(MSG.issueNoStock(name));
      }

      rows.push({ mrLineId: row.mrLineId, itemId: line.itemId, qty });
    }

    if (!rows.length) throw badRequest(MSG.issueQtyRequired);

    const [issue] = await Issue.create(
      [
        {
          no: await nextIssueNo(session),
          mrId: mr._id,
          projectId: mr.projectId,
          status: 'ISSUED',
          vehicle: input.vehicle,
          createdBy: actor.id,
        },
      ],
      { session, ordered: true },
    );

    for (const row of rows) {
      await IssueLine.create(
        [
          {
            issueId: issue!._id,
            mrLineId: oid(row.mrLineId),
            itemId: oid(row.itemId),
            qtyIssued: row.qty,
            qtyAccepted: 0,
          },
        ],
        { session, ordered: true },
      );

      await StockLedger.create(
        [
          {
            at: new Date(),
            itemId: oid(row.itemId),
            docType: 'ISSUE',
            docNo: issue!.no,
            refNo: mr.no,
            projectId: mr.projectId,
            mrLineId: oid(row.mrLineId),
            qtyIn: 0,
            qtyOut: row.qty,
          },
        ],
        { session, ordered: true },
      );
    }

    await writeAudit(session, 'MR', mr._id, AUDIT.MR_ISSUED, actor.id, issue!.no);

    const body = rows
      .map((r) => `• ${lookups.item(r.itemId)?.name ?? ''}: ${r.qty}`)
      .join('\n');

    const outbox = await emit(session, 'ISSUE_CREATED', {
      title: `${issue!.no}: material issued for ${mr.no} — please accept at site`,
      body,
      link: `iss:${String(issue!._id)}`,
      to: [{ userId: mr.createdBy }],
      actorId: actor.id,
    });

    await bumpSyncStamp(session);
    return { no: issue!.no, outbox };
  });

  await enqueueEmails(result.outbox);
  return { no: result.no };
}

// ---------------------------------------------------------------------------
// Issue notes and site acceptance
// ---------------------------------------------------------------------------

export async function listIssues(actor: Actor): Promise<IssueDto[]> {
  const filter: Record<string, unknown> = {};

  // Plan decision (d)(7): site users see only their own projects' notes.
  const scope = projectScopeOf(actor);
  if (actor.role === 'SITE') {
    filter.status = 'ISSUED';
    if (scope) filter.projectId = { $in: scope.map(oid) };
  }

  const [issues, lookups] = await Promise.all([
    Issue.find(filter).sort({ createdAt: -1 }).lean(),
    buildLookups(),
  ]);

  const mrs = await Mr.find({ _id: { $in: issues.map((i) => i.mrId) } })
    .select('no')
    .lean();
  const counts = await IssueLine.aggregate<{ _id: unknown; n: number }>([
    { $match: { issueId: { $in: issues.map((i) => i._id) } } },
    { $group: { _id: '$issueId', n: { $sum: 1 } } },
  ]);
  const countMap = new Map(counts.map((c) => [String(c._id), c.n]));

  return issues.map((issue) => ({
    id: String(issue._id),
    rv: issue.rv ?? 0,
    createdAt: issue.createdAt.toISOString(),
    updatedAt: issue.updatedAt.toISOString(),
    no: issue.no,
    mrId: String(issue.mrId),
    mrNo: mrs.find((m) => String(m._id) === String(issue.mrId))?.no ?? '',
    projectId: String(issue.projectId),
    projectCode: lookups.projectCode(issue.projectId),
    status: issue.status,
    vehicle: issue.vehicle ?? '',
    createdByName: lookups.userName(issue.createdBy),
    acceptedByName: issue.acceptedBy ? lookups.userName(issue.acceptedBy) : null,
    acceptedAt: issue.acceptedAt ? issue.acceptedAt.toISOString() : null,
    remark: issue.remark ?? '',
    lineCount: countMap.get(String(issue._id)) ?? 0,
  }));
}

export async function getIssue(actor: Actor, id: string): Promise<IssueDetailDto> {
  const issue = await Issue.findById(id).lean();
  if (!issue) throw notFound();
  if (actor.role === 'VENDOR') throw forbidden();
  if (!canSeeProject(actor, String(issue.projectId))) throw forbidden();

  const [lines, lookups] = await Promise.all([
    IssueLine.find({ issueId: id }).lean(),
    buildLookups(),
  ]);

  const mrLines = await MrLine.find({ _id: { $in: lines.map((l) => l.mrLineId) } })
    .select('itemId newItemName newUnit')
    .lean();
  const mr = await Mr.findById(issue.mrId).select('no').lean();
  const lineCount = lines.length;

  return {
    id: String(issue._id),
    rv: issue.rv ?? 0,
    createdAt: issue.createdAt.toISOString(),
    updatedAt: issue.updatedAt.toISOString(),
    no: issue.no,
    mrId: String(issue.mrId),
    mrNo: mr?.no ?? '',
    projectId: String(issue.projectId),
    projectCode: lookups.projectCode(issue.projectId),
    status: issue.status,
    vehicle: issue.vehicle ?? '',
    createdByName: lookups.userName(issue.createdBy),
    acceptedByName: issue.acceptedBy ? lookups.userName(issue.acceptedBy) : null,
    acceptedAt: issue.acceptedAt ? issue.acceptedAt.toISOString() : null,
    remark: issue.remark ?? '',
    lineCount,
    lines: lines.map((line) => {
      const mrLine = mrLines.find((l) => String(l._id) === String(line.mrLineId));
      const item = mrLine?.itemId ? lookups.item(mrLine.itemId) : null;
      return {
        id: String(line._id),
        mrLineId: String(line.mrLineId),
        itemName: item?.name ?? mrLine?.newItemName ?? '—',
        unit: item?.unit ?? mrLine?.newUnit ?? '',
        qtyIssued: num(line.qtyIssued),
        qtyAccepted: num(line.qtyAccepted),
      };
    }),
    canAccept: actor.role === 'SITE' && issue.status === 'ISSUED',
  };
}

/**
 * Prototype: A.acceptIssue — a shortfall returns to store stock as a RETURN
 * ledger row, and the MR closes if everything is now accounted for.
 */
export async function acceptIssue(
  actor: Actor,
  id: string,
  input: AcceptIssueInput,
): Promise<void> {
  if (actor.role !== 'SITE' && actor.role !== 'ADMIN') throw forbidden();

  const result = await inTransaction(async (session) => {
    const issue = await Issue.findById(id).session(session);
    if (!issue) throw notFound();
    if (issue.status !== 'ISSUED') throw conflict('That issue note is already accepted');
    if (!canSeeProject(actor, String(issue.projectId))) throw forbidden();
    if (input.rv !== undefined && input.rv !== (issue.rv ?? 0)) throw stale();

    const lines = await IssueLine.find({ issueId: issue._id }).session(session);
    const byId = new Map(lines.map((l) => [String(l._id), l]));

    for (const row of input.lines) {
      const line = byId.get(row.issueLineId);
      if (!line) continue;
      const accepted = num(row.qtyAccepted);
      if (accepted < 0 || accepted > num(line.qtyIssued)) {
        throw badRequest(MSG.acceptRange);
      }
    }

    for (const row of input.lines) {
      const line = byId.get(row.issueLineId);
      if (!line) continue;

      const accepted = num(row.qtyAccepted);
      line.qtyAccepted = accepted;
      await line.save({ session });

      const short = num(num(line.qtyIssued) - accepted);
      if (short > 0) {
        await StockLedger.create(
          [
            {
              at: new Date(),
              itemId: line.itemId,
              docType: 'RETURN',
              docNo: issue.no,
              refNo: '',
              projectId: issue.projectId,
              mrLineId: line.mrLineId,
              qtyIn: short,
              qtyOut: 0,
              note: 'Short / returned at site',
            },
          ],
          { session, ordered: true },
        );
      }
    }

    issue.status = 'ACCEPTED';
    issue.acceptedBy = oid(actor.id) as never;
    issue.acceptedAt = new Date();
    issue.remark = input.remark;
    await issue.save({ session });

    await writeAudit(
      session,
      'MR',
      issue.mrId,
      AUDIT.MR_SITE_ACCEPTED(issue.no),
      actor.id,
      input.remark,
    );

    const outbox = await emit(session, 'ISSUE_ACCEPTED', {
      title: `${issue.no} accepted at site`,
      body: input.remark,
      link: `iss:${String(issue._id)}`,
      to: [{ role: 'STORE' }],
      actorId: actor.id,
    });

    await bumpSyncStamp(session);
    return { mrId: String(issue.mrId), outbox };
  });

  await enqueueEmails(result.outbox);
  await closeMrIfComplete(result.mrId, actor.id);
}
