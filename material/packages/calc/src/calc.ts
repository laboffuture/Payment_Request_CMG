/**
 * The calculations, ported one-for-one from the prototype.
 * Prototype origin: livePO, allocRec, lineCalc, stock, poCalc, poRecValue,
 * poRecPct, poProjects, poolRows, issueRows, lineStage, reportLines.
 *
 * Pure: no dates from the clock unless passed in, no I/O, no Mongo. The API
 * computes lists and reports with aggregation pipelines and asserts in a test
 * that both paths agree on the seed data (§7).
 */

import { byId, same } from './inputs.js';
import type {
  GrnLineIn,
  ItemIn,
  MrIn,
  MrLineIn,
  PoIn,
  World,
} from './inputs.js';
import { clampMin0, num, r2, sum } from './money.js';

/** Prototype: livePO() — a PO still holding quantity out of the pool. */
export const isLivePo = (po: PoIn | undefined): boolean =>
  !!po && po.status !== 'REJECTED' && po.status !== 'CANCELLED';

export const livePo = (w: World, poId: unknown): boolean =>
  isLivePo(byId(w.pos, poId));

/** Prototype: allocRec() — quantity received against one PO allocation. */
export const allocReceived = (w: World, allocId: unknown): number =>
  sum(
    w.grnLines.filter((g) => same(g.poAllocId, allocId)),
    'qtyReceived',
  );

export interface LineCalc {
  poAlloc: number;
  rfqOpen: number;
  recStore: number;
  recSite: number;
  received: number;
  issuedNet: number;
  issuedGross: number;
  accepted: number;
  pendingIssue: number;
  store: number;
  po: number;
  approved: number;
  cut: number;
  poolOpen: number;
  issuable: number;
  siteAcc: number;
  balance: number;
  closed: boolean;
}

/**
 * Prototype: lineCalc(l)
 *
 *   approved   = store + po
 *   cut        = max(0, requested - approved)
 *   poolOpen   = max(0, po - poAlloc - rfqOpen)      still to be bought
 *   issuable   = max(0, store + recStore - issuedNet) store may still issue
 *   balance    = max(0, approved - siteAcc)
 */
export function lineCalc(w: World, line: MrLineIn): LineCalc {
  const allocs = w.poAllocs.filter(
    (a) => same(a.mrLineId, line.id) && livePo(w, a.poId),
  );
  const poAlloc = sum(allocs, 'qty');

  let rfqOpen = 0;
  for (const rl of w.rfqLines) {
    const rfq = byId(w.rfqs, rl.rfqId);
    if (!rfq || rfq.status !== 'OPEN') continue;
    for (const alloc of rl.allocs) {
      if (same(alloc.mrLineId, line.id)) rfqOpen += num(alloc.qty);
    }
  }

  let recStore = 0;
  let recSite = 0;
  for (const alloc of allocs) {
    const lines: GrnLineIn[] = w.grnLines.filter((g) =>
      same(g.poAllocId, alloc.id),
    );
    for (const gl of lines) {
      const grn = byId(w.grns, gl.grnId);
      if (grn && grn.location === 'SITE') recSite += num(gl.qtyReceived);
      else recStore += num(gl.qtyReceived);
    }
  }

  let issuedNet = 0;
  let accepted = 0;
  let pendingIssue = 0;
  let issuedGross = 0;
  for (const il of w.issueLines.filter((x) => same(x.mrLineId, line.id))) {
    const issue = byId(w.issues, il.issueId);
    if (!issue) continue;
    issuedGross += num(il.qtyIssued);
    if (issue.status === 'ACCEPTED') {
      issuedNet += num(il.qtyAccepted);
      accepted += num(il.qtyAccepted);
    } else {
      issuedNet += num(il.qtyIssued);
      pendingIssue += num(il.qtyIssued);
    }
  }

  const store = num(line.storeQty);
  const po = num(line.poQty);
  const approved = num(store + po);
  const siteAcc = num(accepted + recSite);

  return {
    poAlloc: num(poAlloc),
    rfqOpen: num(rfqOpen),
    recStore: num(recStore),
    recSite: num(recSite),
    received: num(recStore + recSite),
    issuedNet: num(issuedNet),
    issuedGross: num(issuedGross),
    accepted: num(accepted),
    pendingIssue: num(pendingIssue),
    store,
    po,
    approved,
    cut: clampMin0(num(line.qty) - approved),
    poolOpen: clampMin0(po - poAlloc - rfqOpen),
    issuable: clampMin0(store + recStore - issuedNet),
    siteAcc,
    balance: clampMin0(approved - siteAcc),
    closed: approved > 0 && siteAcc >= approved,
  };
}

export interface StockCalc {
  opening: number;
  in: number;
  out: number;
  onHand: number;
  reserved: number;
  available: number;
}

/**
 * Prototype: stock(itemId)
 *
 *   onHand    = opening + in - out
 *   reserved  = sum of `issuable` over lines on APPROVED MRs for that item
 *   available = onHand - reserved
 */
export function stock(w: World, itemId: unknown): StockCalc {
  const rows = w.ledger.filter((x) => same(x.itemId, itemId));
  const opening = sum(
    rows.filter((x) => x.docType === 'OPENING'),
    'qtyIn',
  );
  const inQty = sum(
    rows.filter((x) => x.docType !== 'OPENING'),
    'qtyIn',
  );
  const outQty = sum(rows, 'qtyOut');
  const onHand = num(opening + inQty - outQty);

  let reserved = 0;
  for (const line of w.mrLines) {
    if (!same(line.itemId, itemId) || line.lineStatus === 'REJECTED') continue;
    const mr = byId(w.mrs, line.mrId);
    if (mr && mr.status === 'APPROVED') reserved += lineCalc(w, line).issuable;
  }
  reserved = num(reserved);

  return {
    opening: num(opening),
    in: num(inQty),
    out: num(outQty),
    onHand,
    reserved,
    available: num(onHand - reserved),
  };
}

export interface PoTotals {
  subtotal: number;
  taxTotal: number;
  total: number;
}

/**
 * Prototype: poCalc(p). §7: tax is 0 when taxMode is NONE.
 * (Lines are saved with gstPct 0 in that mode anyway; the guard makes a
 * preview of an unsaved PO agree with the saved one.)
 */
export function poTotals(
  lines: readonly { qty: number; rate: number; gstPct: number }[],
  taxMode?: string,
): PoTotals {
  let subtotal = 0;
  let taxTotal = 0;
  for (const line of lines) {
    const amount = num(line.qty) * num(line.rate);
    subtotal += amount;
    taxTotal += taxMode === 'NONE' ? 0 : (amount * num(line.gstPct)) / 100;
  }
  return {
    subtotal: r2(subtotal),
    taxTotal: r2(taxTotal),
    total: r2(subtotal + taxTotal),
  };
}

export const poCalc = (w: World, po: PoIn): PoTotals & { lines: typeof w.poLines } => {
  const lines = w.poLines.filter((l) => same(l.poId, po.id));
  return { ...poTotals(lines, po.taxMode), lines };
};

/**
 * Prototype: poRecValue(p)
 * sum of min(allocQty, received) x rate x (1 + gst/100)
 */
export function poReceivedValue(w: World, po: PoIn): number {
  let value = 0;
  for (const alloc of w.poAllocs.filter((a) => same(a.poId, po.id))) {
    const line = byId(w.poLines, alloc.poLineId);
    if (!line) continue;
    const received = Math.min(num(alloc.qty), allocReceived(w, alloc.id));
    value += received * num(line.rate) * (1 + num(line.gstPct) / 100);
  }
  return r2(value);
}

/** Prototype: poRecPct(p) */
export function poReceivedPct(w: World, po: PoIn): number {
  const allocs = w.poAllocs.filter((a) => same(a.poId, po.id));
  const ordered = sum(allocs, 'qty');
  if (!ordered) return 0;
  const received = sum(allocs, (a) =>
    Math.min(num(a.qty), allocReceived(w, a.id)),
  );
  return Math.round((received / ordered) * 100);
}

/** Prototype: poProjects(p) */
export const poProjects = (w: World, po: PoIn): string[] => [
  ...new Set(
    w.poAllocs.filter((a) => same(a.poId, po.id)).map((a) => String(a.projectId)),
  ),
];

/**
 * Prototype: refreshPO() — derive APPROVED / PARTIAL / RECEIVED from GRNs.
 * Plan decision (d)(3): a PO with no allocations must not become RECEIVED.
 */
export function derivedPoStatus(
  w: World,
  po: PoIn,
): 'APPROVED' | 'PARTIAL' | 'RECEIVED' | null {
  if (po.status !== 'APPROVED' && po.status !== 'PARTIAL' && po.status !== 'RECEIVED')
    return null;
  const allocs = w.poAllocs.filter((a) => same(a.poId, po.id));
  if (!allocs.length) return 'APPROVED';
  const done = allocs.every((a) => allocReceived(w, a.id) >= num(a.qty));
  const any = allocs.some((a) => allocReceived(w, a.id) > 0);
  return done ? 'RECEIVED' : any ? 'PARTIAL' : 'APPROVED';
}

export interface PoolRow {
  line: MrLineIn;
  mr: MrIn;
  calc: LineCalc;
}

/** A line procurement has sent back to QS and QS has not answered yet. */
export const isHeld = (line: MrLineIn): boolean =>
  !!line.procHold && line.procHold !== 'NONE';

/** Prototype: poolRows() — QS-approved PO qty not yet on an open RFQ or live PO. */
export function poolRows(w: World): PoolRow[] {
  const rows: PoolRow[] = [];
  for (const line of w.mrLines) {
    const mr = byId(w.mrs, line.mrId);
    if (!mr || mr.status !== 'APPROVED') continue;
    if (line.lineStatus === 'REJECTED' || !line.itemId) continue;
    // Sent back to QS by procurement: not to be bought until QS answers.
    if (isHeld(line)) continue;
    const calc = lineCalc(w, line);
    if (calc.poolOpen > 0) rows.push({ line, mr, calc });
  }
  return rows;
}

/** Prototype: issueRows() — lines the store may still issue. */
export function issueRows(w: World): PoolRow[] {
  const rows: PoolRow[] = [];
  for (const line of w.mrLines) {
    const mr = byId(w.mrs, line.mrId);
    if (!mr || mr.status !== 'APPROVED') continue;
    if (line.lineStatus === 'REJECTED') continue;
    const calc = lineCalc(w, line);
    if (calc.issuable > 0) rows.push({ line, mr, calc });
  }
  return rows;
}

/** Prototype: refreshMR() — close an MR once every approved line is accepted. */
export function shouldCloseMr(w: World, mrId: unknown): boolean {
  const mr = byId(w.mrs, mrId);
  if (!mr || mr.status !== 'APPROVED') return false;
  const lines = w.mrLines
    .filter((l) => same(l.mrId, mrId) && l.lineStatus !== 'REJECTED')
    .filter((l) => num(l.storeQty) + num(l.poQty) > 0);
  return lines.length > 0 && lines.every((l) => lineCalc(w, l).closed);
}

const MR_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft',
  PM_PENDING: 'With PM',
  QS_PENDING: 'With QS',
  SENT_BACK: 'Sent back',
  REJECTED: 'Rejected',
  APPROVED: 'In progress',
  CLOSED: 'Closed',
};

/** Prototype: lineStage(l, m, c) */
export function lineStage(line: MrLineIn, mr: MrIn, calc: LineCalc): string {
  if (line.lineStatus === 'REJECTED') return 'Line rejected';
  if (mr.status !== 'APPROVED' && mr.status !== 'CLOSED')
    return MR_STATUS_LABEL[mr.status] ?? mr.status;
  if (calc.approved === 0) return 'Not approved';
  if (calc.closed) return 'Closed';
  const stages: string[] = [];
  if (calc.pendingIssue > 0) stages.push('Awaiting site');
  if (calc.issuable > 0) stages.push('At store');
  if (calc.rfqOpen > 0) stages.push('Enquiry');
  if (calc.poolOpen > 0) stages.push('In pool');
  if (calc.poAlloc > calc.received) stages.push('On PO');
  return stages.join(' · ') || 'In progress';
}

export interface ReportLine {
  mr: string;
  mrId: string;
  project: string;
  projectId: string;
  item: string;
  itemId: string | null;
  cat: string;
  unit: string;
  req: number;
  store: number;
  po: number;
  cut: number;
  poNo: string;
  onPo: number;
  received: number;
  issued: number;
  site: number;
  balance: number;
  stage: string;
  required: string;
  overdue: boolean;
}

/** Prototype: poNo(p) — "PO-26-0007 Rev 2" once revised. */
export const displayPoNo = (po: PoIn | undefined): string =>
  po ? po.no + (num(po.rev) > 0 ? ` Rev ${po.rev}` : '') : '';

const lineName = (w: World, l: MrLineIn, item?: ItemIn): string =>
  item ? item.name : l.newItemName || '—';

const lineUnit = (l: MrLineIn, item?: ItemIn): string =>
  item ? item.unit : l.newUnit || '';

/**
 * Prototype: reportLines(pj)
 *
 * `overdue` = MR in QS_PENDING or APPROVED, line not closed, not rejected,
 * requiredDate before today.
 */
export function reportLines(
  w: World,
  projectId?: string,
  today = new Date().toISOString().slice(0, 10),
): ReportLine[] {
  const out: ReportLine[] = [];
  for (const line of w.mrLines) {
    const mr = byId(w.mrs, line.mrId);
    if (!mr || mr.status === 'DRAFT') continue;
    if (projectId && !same(mr.projectId, projectId)) continue;

    const calc = lineCalc(w, line);
    const post = mr.status === 'APPROVED' || mr.status === 'CLOSED';
    const item = line.itemId ? byId(w.items, line.itemId) : undefined;
    const project = byId(w.projects, mr.projectId);

    const poNos = [
      ...new Set(
        w.poAllocs
          .filter((a) => same(a.mrLineId, line.id) && livePo(w, a.poId))
          .map((a) => displayPoNo(byId(w.pos, a.poId))),
      ),
    ];

    const overdue =
      (mr.status === 'APPROVED' || mr.status === 'QS_PENDING') &&
      !calc.closed &&
      line.lineStatus !== 'REJECTED' &&
      mr.requiredDate < today;

    out.push({
      mr: mr.no,
      mrId: mr.id,
      project: project?.code ?? '—',
      projectId: mr.projectId,
      item: lineName(w, line, item),
      itemId: line.itemId,
      cat: item?.category ?? line.newCategory ?? '',
      unit: lineUnit(line, item),
      req: num(line.qty),
      store: calc.store,
      po: calc.po,
      cut: post ? calc.cut : 0,
      poNo: poNos.join(' '),
      onPo: calc.poAlloc,
      received: calc.received,
      issued: calc.issuedGross,
      site: calc.siteAcc,
      balance: post ? calc.balance : num(line.qty),
      stage: lineStage(line, mr, calc),
      required: mr.requiredDate,
      overdue,
    });
  }
  return out.sort((a, b) => String(a.required).localeCompare(b.required));
}

/** Prototype: allocVal(a) — value of one PO allocation including tax. */
export function allocValue(w: World, allocId: unknown): number {
  const alloc = byId(w.poAllocs, allocId);
  if (!alloc) return 0;
  const line = byId(w.poLines, alloc.poLineId);
  if (!line) return 0;
  return r2(num(alloc.qty) * num(line.rate) * (1 + num(line.gstPct) / 100));
}
