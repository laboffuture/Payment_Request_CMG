import type { World } from '@cm/calc';
import { emptyWorld } from '@cm/calc';
import {
  Grn,
  GrnLine,
  Issue,
  IssueLine,
  Item,
  Mr,
  MrLine,
  Po,
  PoAlloc,
  PoLine,
  Project,
  Rfq,
  RfqLine,
  StockLedger,
} from '../models/index.js';

/**
 * Loads the live working set into the shape `packages/calc` expects.
 *
 * "Live" means: every MR that is not a draft, and everything hanging off it.
 * Closed MRs older than the cut-off are excluded because nothing about them can
 * change a pool, issue or stock number any more — their ledger rows are already
 * counted by the `stock` aggregation.
 *
 * §7 requires that list and report endpoints use aggregation pipelines and that
 * a test proves both paths agree on the seed data. This loader is the reference
 * implementation the pipelines are checked against, and is what the badge
 * counts use directly (they are small and read once per page load).
 */
export interface WorldOptions {
  /** limit to these projects (SITE scope) */
  projectIds?: string[] | null;
  /** include CLOSED material requests (reports need them; queues do not) */
  includeClosed?: boolean;
}

export async function loadWorld(opts: WorldOptions = {}): Promise<World> {
  const statuses = opts.includeClosed
    ? ['QS_PENDING', 'SENT_BACK', 'REJECTED', 'APPROVED', 'CLOSED']
    : ['QS_PENDING', 'APPROVED'];

  const mrFilter: Record<string, unknown> = { status: { $in: statuses } };
  if (opts.projectIds?.length) mrFilter.projectId = { $in: opts.projectIds };

  const mrs = await Mr.find(mrFilter).lean();
  const mrIds = mrs.map((m) => m._id);
  const mrLines = await MrLine.find({ mrId: { $in: mrIds } }).lean();
  const mrLineIds = mrLines.map((l) => l._id);

  const [poAllocs, rfqLines, issueLines] = await Promise.all([
    PoAlloc.find({ mrLineId: { $in: mrLineIds } }).lean(),
    RfqLine.find({ 'allocs.mrLineId': { $in: mrLineIds } }).lean(),
    IssueLine.find({ mrLineId: { $in: mrLineIds } }).lean(),
  ]);

  const poIds = [...new Set(poAllocs.map((a) => String(a.poId)))];
  const rfqIds = [...new Set(rfqLines.map((l) => String(l.rfqId)))];
  const issueIds = [...new Set(issueLines.map((l) => String(l.issueId)))];
  const allocIds = poAllocs.map((a) => a._id);

  const [pos, poLines, rfqs, issues, grnLines] = await Promise.all([
    Po.find({ _id: { $in: poIds } }).lean(),
    PoLine.find({ poId: { $in: poIds } }).lean(),
    Rfq.find({ _id: { $in: rfqIds } }).lean(),
    Issue.find({ _id: { $in: issueIds } }).lean(),
    GrnLine.find({ poAllocId: { $in: allocIds } }).lean(),
  ]);

  const grnIds = [...new Set(grnLines.map((g) => String(g.grnId)))];
  const [grns, items, projects, ledger] = await Promise.all([
    Grn.find({ _id: { $in: grnIds } }).lean(),
    Item.find({}).lean(),
    Project.find({}).lean(),
    StockLedger.find({}).lean(),
  ]);

  const w = emptyWorld();

  w.mrs = mrs.map((m) => ({
    id: String(m._id),
    no: m.no ?? '',
    projectId: String(m.projectId),
    requiredDate: m.requiredDate,
    status: m.status,
    createdBy: String(m.createdBy),
    submittedAt: m.submittedAt ? m.submittedAt.toISOString() : null,
    closedAt: m.closedAt ? m.closedAt.toISOString() : null,
    createdAt: m.createdAt?.toISOString(),
  }));

  w.mrLines = mrLines.map((l) => ({
    id: String(l._id),
    mrId: String(l.mrId),
    sn: l.sn,
    itemId: l.itemId ? String(l.itemId) : null,
    newItemName: l.newItemName ?? '',
    newUnit: l.newUnit ?? '',
    newCategory: l.newCategory ?? '',
    newStatus: l.newStatus ?? 'NONE',
    qty: l.qty,
    storeQty: l.storeQty,
    poQty: l.poQty,
    lineStatus: l.lineStatus,
  }));

  w.pos = pos.map((p) => ({
    id: String(p._id),
    no: p.no,
    rev: p.rev ?? 0,
    status: p.status,
    vendorId: String(p.vendorId),
    companyId: String(p.companyId),
    rfqId: p.rfqId ? String(p.rfqId) : null,
    deliverTo: p.deliverTo,
    subtotal: p.subtotal,
    taxTotal: p.taxTotal,
    total: p.total,
    taxMode: p.taxMode,
    createdAt: p.createdAt?.toISOString(),
  }));

  w.poLines = poLines.map((l) => ({
    id: String(l._id),
    poId: String(l.poId),
    itemId: String(l.itemId),
    qty: l.qty,
    rate: l.rate,
    gstPct: l.gstPct,
  }));

  w.poAllocs = poAllocs.map((a) => ({
    id: String(a._id),
    poId: String(a.poId),
    poLineId: String(a.poLineId),
    mrLineId: String(a.mrLineId),
    projectId: String(a.projectId),
    qty: a.qty,
  }));

  w.grns = grns.map((g) => ({
    id: String(g._id),
    no: g.no,
    poId: String(g.poId),
    location: g.location,
    createdAt: g.createdAt?.toISOString(),
  }));

  w.grnLines = grnLines.map((g) => ({
    id: String(g._id),
    grnId: String(g.grnId),
    poAllocId: String(g.poAllocId),
    qtyReceived: g.qtyReceived,
    qtyRejected: g.qtyRejected,
  }));

  w.issues = issues.map((i) => ({
    id: String(i._id),
    no: i.no,
    mrId: String(i.mrId),
    projectId: String(i.projectId),
    status: i.status,
    createdAt: i.createdAt?.toISOString(),
  }));

  w.issueLines = issueLines.map((l) => ({
    id: String(l._id),
    issueId: String(l.issueId),
    mrLineId: String(l.mrLineId),
    itemId: String(l.itemId),
    qtyIssued: l.qtyIssued,
    qtyAccepted: l.qtyAccepted,
  }));

  w.rfqs = rfqs.map((r) => ({
    id: String(r._id),
    no: r.no,
    status: r.status,
    dueAt: r.dueAt.toISOString(),
  }));

  w.rfqLines = rfqLines.map((l) => ({
    id: String(l._id),
    rfqId: String(l.rfqId),
    itemId: String(l.itemId),
    qty: l.qty,
    allocs: (l.allocs ?? []).map((a) => ({
      mrLineId: String(a.mrLineId),
      projectId: String(a.projectId),
      qty: a.qty,
    })),
  }));

  w.ledger = ledger.map((x) => ({
    id: String(x._id),
    at: x.at.toISOString(),
    itemId: String(x.itemId),
    docType: x.docType,
    qtyIn: x.qtyIn,
    qtyOut: x.qtyOut,
  }));

  w.items = items.map((i) => ({
    id: String(i._id),
    code: i.code,
    name: i.name,
    unit: i.unit,
    category: i.category,
    subCategory: i.subCategory ?? '',
    lastRate: i.lastRate ?? null,
    lastVendorId: i.lastVendorId ? String(i.lastVendorId) : null,
  }));

  w.projects = projects.map((p) => ({
    id: String(p._id),
    code: p.code,
    name: p.name,
  }));

  return w;
}
