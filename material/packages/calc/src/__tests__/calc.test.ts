import { describe, expect, it } from 'vitest';
import {
  allocReceived,
  derivedPoStatus,
  displayPoNo,
  issueRows,
  lineCalc,
  lineStage,
  poolRows,
  poReceivedPct,
  poReceivedValue,
  poTotals,
  reportLines,
  shouldCloseMr,
  stock,
} from '../calc.js';
import * as f from './fixtures.js';

describe('lineCalc', () => {
  it('splits a requested quantity into store, PO and cut', () => {
    const w = f.world({
      mrs: [f.mr({ id: 'm1' })],
      mrLines: [
        f.mrLine({ id: 'l1', mrId: 'm1', qty: 100, storeQty: 20, poQty: 30 }),
      ],
    });
    const c = lineCalc(w, w.mrLines[0]!);
    expect(c.store).toBe(20);
    expect(c.po).toBe(30);
    expect(c.approved).toBe(50);
    expect(c.cut).toBe(50);
    expect(c.balance).toBe(50);
    expect(c.closed).toBe(false);
  });

  it('never returns a negative cut when store + PO exceeds the request', () => {
    const w = f.world({
      mrs: [f.mr({ id: 'm1' })],
      mrLines: [
        f.mrLine({ id: 'l1', mrId: 'm1', qty: 10, storeQty: 8, poQty: 5 }),
      ],
    });
    expect(lineCalc(w, w.mrLines[0]!).cut).toBe(0);
  });

  it('poolOpen = po - poAlloc - rfqOpen, and a draft PO still holds quantity', () => {
    const w = f.world({
      mrs: [f.mr({ id: 'm1' })],
      mrLines: [f.mrLine({ id: 'l1', mrId: 'm1', qty: 100, poQty: 100 })],
      pos: [f.po({ id: 'po1', status: 'DRAFT' })],
      poLines: [f.poLine({ id: 'pl1', poId: 'po1', qty: 40, rate: 10 })],
      poAllocs: [
        f.poAlloc({
          id: 'pa1',
          poId: 'po1',
          poLineId: 'pl1',
          mrLineId: 'l1',
          qty: 40,
        }),
      ],
      rfqs: [f.rfq({ id: 'r1', status: 'OPEN' })],
      rfqLines: [
        f.rfqLine({
          id: 'rl1',
          rfqId: 'r1',
          qty: 25,
          allocs: [{ mrLineId: 'l1', projectId: 'p1', qty: 25 }],
        }),
      ],
    });
    const c = lineCalc(w, w.mrLines[0]!);
    expect(c.poAlloc).toBe(40);
    expect(c.rfqOpen).toBe(25);
    expect(c.poolOpen).toBe(35);
  });

  it('a cancelled PO releases its quantity back to the pool', () => {
    const w = f.world({
      mrs: [f.mr({ id: 'm1' })],
      mrLines: [f.mrLine({ id: 'l1', mrId: 'm1', qty: 100, poQty: 100 })],
      pos: [f.po({ id: 'po1', status: 'CANCELLED' })],
      poLines: [f.poLine({ id: 'pl1', poId: 'po1', qty: 40, rate: 10 })],
      poAllocs: [
        f.poAlloc({
          id: 'pa1',
          poId: 'po1',
          poLineId: 'pl1',
          mrLineId: 'l1',
          qty: 40,
        }),
      ],
    });
    expect(lineCalc(w, w.mrLines[0]!).poolOpen).toBe(100);
  });

  it('a closed RFQ releases its quantity back to the pool', () => {
    const w = f.world({
      mrs: [f.mr({ id: 'm1' })],
      mrLines: [f.mrLine({ id: 'l1', mrId: 'm1', qty: 60, poQty: 60 })],
      rfqs: [f.rfq({ id: 'r1', status: 'CLOSED' })],
      rfqLines: [
        f.rfqLine({
          id: 'rl1',
          rfqId: 'r1',
          qty: 60,
          allocs: [{ mrLineId: 'l1', projectId: 'p1', qty: 60 }],
        }),
      ],
    });
    expect(lineCalc(w, w.mrLines[0]!).poolOpen).toBe(60);
  });

  it('store receipt makes PO quantity issuable; a site receipt counts as accepted', () => {
    const base = {
      mrs: [f.mr({ id: 'm1' })],
      mrLines: [f.mrLine({ id: 'l1', mrId: 'm1', qty: 50, poQty: 50 })],
      pos: [f.po({ id: 'po1' })],
      poLines: [f.poLine({ id: 'pl1', poId: 'po1', qty: 50, rate: 10 })],
      poAllocs: [
        f.poAlloc({
          id: 'pa1',
          poId: 'po1',
          poLineId: 'pl1',
          mrLineId: 'l1',
          qty: 50,
        }),
      ],
      grnLines: [
        f.grnLine({ id: 'gl1', grnId: 'g1', poAllocId: 'pa1', qtyReceived: 30 }),
      ],
    };

    const atStore = f.world({ ...base, grns: [f.grn({ id: 'g1', poId: 'po1' })] });
    const cStore = lineCalc(atStore, atStore.mrLines[0]!);
    expect(cStore.recStore).toBe(30);
    expect(cStore.issuable).toBe(30);
    expect(cStore.siteAcc).toBe(0);

    const atSite = f.world({
      ...base,
      grns: [f.grn({ id: 'g1', poId: 'po1', location: 'SITE' })],
    });
    const cSite = lineCalc(atSite, atSite.mrLines[0]!);
    expect(cSite.recSite).toBe(30);
    expect(cSite.issuable).toBe(0);
    expect(cSite.siteAcc).toBe(30);
    expect(cSite.balance).toBe(20);
  });

  it('an issued note holds issuable down; acceptance with a shortfall releases it', () => {
    const base = {
      mrs: [f.mr({ id: 'm1' })],
      mrLines: [f.mrLine({ id: 'l1', mrId: 'm1', qty: 40, storeQty: 40 })],
      issueLines: [
        f.issueLine({
          id: 'il1',
          issueId: 'is1',
          mrLineId: 'l1',
          qtyIssued: 40,
          qtyAccepted: 35,
        }),
      ],
    };

    const pending = f.world({ ...base, issues: [f.issue({ id: 'is1', mrId: 'm1' })] });
    const cPending = lineCalc(pending, pending.mrLines[0]!);
    expect(cPending.pendingIssue).toBe(40);
    expect(cPending.issuedNet).toBe(40);
    expect(cPending.issuable).toBe(0);
    expect(cPending.siteAcc).toBe(0);

    const accepted = f.world({
      ...base,
      issues: [f.issue({ id: 'is1', mrId: 'm1', status: 'ACCEPTED' })],
    });
    const cAccepted = lineCalc(accepted, accepted.mrLines[0]!);
    expect(cAccepted.accepted).toBe(35);
    expect(cAccepted.issuedNet).toBe(35);
    // the 5 short came back into store stock, so it can be issued again
    expect(cAccepted.issuable).toBe(5);
    expect(cAccepted.balance).toBe(5);
    expect(cAccepted.closed).toBe(false);
  });

  it('closes only when the whole approved quantity is accepted at site', () => {
    const w = f.world({
      mrs: [f.mr({ id: 'm1' })],
      mrLines: [f.mrLine({ id: 'l1', mrId: 'm1', qty: 40, storeQty: 40 })],
      issues: [f.issue({ id: 'is1', mrId: 'm1', status: 'ACCEPTED' })],
      issueLines: [
        f.issueLine({
          id: 'il1',
          issueId: 'is1',
          mrLineId: 'l1',
          qtyIssued: 40,
          qtyAccepted: 40,
        }),
      ],
    });
    const c = lineCalc(w, w.mrLines[0]!);
    expect(c.closed).toBe(true);
    expect(c.balance).toBe(0);
    expect(shouldCloseMr(w, 'm1')).toBe(true);
  });

  it('a line with nothing approved does not keep the MR open', () => {
    const w = f.world({
      mrs: [f.mr({ id: 'm1' })],
      mrLines: [
        f.mrLine({ id: 'l1', mrId: 'm1', qty: 10, storeQty: 10 }),
        f.mrLine({ id: 'l2', mrId: 'm1', sn: 2, qty: 10, storeQty: 0, poQty: 0 }),
      ],
      issues: [f.issue({ id: 'is1', mrId: 'm1', status: 'ACCEPTED' })],
      issueLines: [
        f.issueLine({
          id: 'il1',
          issueId: 'is1',
          mrLineId: 'l1',
          qtyIssued: 10,
          qtyAccepted: 10,
        }),
      ],
    });
    expect(shouldCloseMr(w, 'm1')).toBe(true);
  });
});

describe('stock', () => {
  it('onHand = opening + in - out, available = onHand - reserved', () => {
    const w = f.world({
      mrs: [f.mr({ id: 'm1' })],
      mrLines: [f.mrLine({ id: 'l1', mrId: 'm1', qty: 30, storeQty: 30 })],
      ledger: [
        f.ledger({ id: 'x1', docType: 'OPENING', qtyIn: 100 }),
        f.ledger({ id: 'x2', docType: 'GRN', qtyIn: 20 }),
        f.ledger({ id: 'x3', docType: 'ISSUE', qtyOut: 15 }),
      ],
    });
    const s = stock(w, 'i1');
    expect(s.opening).toBe(100);
    expect(s.in).toBe(20);
    expect(s.out).toBe(15);
    expect(s.onHand).toBe(105);
    // the approved MR line still has 30 issuable, so it is reserved
    expect(s.reserved).toBe(30);
    expect(s.available).toBe(75);
  });

  it('does not reserve against a rejected line or an unapproved MR', () => {
    const w = f.world({
      mrs: [f.mr({ id: 'm1' }), f.mr({ id: 'm2', status: 'QS_PENDING' })],
      mrLines: [
        f.mrLine({
          id: 'l1',
          mrId: 'm1',
          qty: 30,
          storeQty: 30,
          lineStatus: 'REJECTED',
        }),
        f.mrLine({ id: 'l2', mrId: 'm2', qty: 30, storeQty: 30 }),
      ],
      ledger: [f.ledger({ id: 'x1', docType: 'OPENING', qtyIn: 100 })],
    });
    const s = stock(w, 'i1');
    expect(s.reserved).toBe(0);
    expect(s.available).toBe(100);
  });

  it('a site delivery nets to zero in the main store', () => {
    const w = f.world({
      ledger: [
        f.ledger({ id: 'x1', docType: 'GRN', qtyIn: 40 }),
        f.ledger({ id: 'x2', docType: 'SITE_GRN', qtyOut: 40 }),
      ],
    });
    expect(stock(w, 'i1').onHand).toBe(0);
  });
});

describe('PO money', () => {
  const lines = [
    { qty: 10, rate: 21.5, gstPct: 5 },
    { qty: 4, rate: 100, gstPct: 5 },
  ];

  it('totals each line and adds tax', () => {
    const t = poTotals(lines);
    expect(t.subtotal).toBe(615);
    expect(t.taxTotal).toBe(30.75);
    expect(t.total).toBe(645.75);
  });

  it('charges no tax when the tax mode is NONE', () => {
    const t = poTotals(lines, 'NONE');
    expect(t.taxTotal).toBe(0);
    expect(t.total).toBe(615);
  });

  it('received value and percentage follow the GRNs', () => {
    const w = f.world({
      pos: [f.po({ id: 'po1' })],
      poLines: [f.poLine({ id: 'pl1', poId: 'po1', qty: 100, rate: 10, gstPct: 5 })],
      poAllocs: [
        f.poAlloc({
          id: 'pa1',
          poId: 'po1',
          poLineId: 'pl1',
          mrLineId: 'l1',
          qty: 100,
        }),
      ],
      grns: [f.grn({ id: 'g1', poId: 'po1' })],
      grnLines: [
        f.grnLine({
          id: 'gl1',
          grnId: 'g1',
          poAllocId: 'pa1',
          qtyReceived: 25,
          qtyRejected: 5,
        }),
      ],
    });
    expect(allocReceived(w, 'pa1')).toBe(25);
    // rejected quantity is NOT received value — it stays open on the PO
    expect(poReceivedValue(w, w.pos[0]!)).toBe(262.5);
    expect(poReceivedPct(w, w.pos[0]!)).toBe(25);
  });

  it('over-receipt never counts more than the ordered quantity', () => {
    const w = f.world({
      pos: [f.po({ id: 'po1' })],
      poLines: [f.poLine({ id: 'pl1', poId: 'po1', qty: 10, rate: 10, gstPct: 0 })],
      poAllocs: [
        f.poAlloc({ id: 'pa1', poId: 'po1', poLineId: 'pl1', mrLineId: 'l1', qty: 10 }),
      ],
      grns: [f.grn({ id: 'g1', poId: 'po1' })],
      grnLines: [
        f.grnLine({ id: 'gl1', grnId: 'g1', poAllocId: 'pa1', qtyReceived: 12 }),
      ],
    });
    expect(poReceivedValue(w, w.pos[0]!)).toBe(100);
    expect(poReceivedPct(w, w.pos[0]!)).toBe(100);
  });

  it('derives PARTIAL and RECEIVED, and never RECEIVED with no allocations', () => {
    const mk = (received: number) =>
      f.world({
        pos: [f.po({ id: 'po1' })],
        poLines: [f.poLine({ id: 'pl1', poId: 'po1', qty: 10, rate: 1 })],
        poAllocs: [
          f.poAlloc({ id: 'pa1', poId: 'po1', poLineId: 'pl1', mrLineId: 'l1', qty: 10 }),
        ],
        grns: [f.grn({ id: 'g1', poId: 'po1' })],
        grnLines: [
          f.grnLine({ id: 'gl1', grnId: 'g1', poAllocId: 'pa1', qtyReceived: received }),
        ],
      });
    expect(derivedPoStatus(mk(0), mk(0).pos[0]!)).toBe('APPROVED');
    expect(derivedPoStatus(mk(4), mk(4).pos[0]!)).toBe('PARTIAL');
    expect(derivedPoStatus(mk(10), mk(10).pos[0]!)).toBe('RECEIVED');

    const noAllocs = f.world({ pos: [f.po({ id: 'po1' })] });
    expect(derivedPoStatus(noAllocs, noAllocs.pos[0]!)).toBe('APPROVED');
  });

  it('shows the revision in the PO number only once revised', () => {
    expect(displayPoNo(f.po({ id: '1', no: 'PO-26-0007', rev: 0 }))).toBe('PO-26-0007');
    expect(displayPoNo(f.po({ id: '1', no: 'PO-26-0007', rev: 2 }))).toBe(
      'PO-26-0007 Rev 2',
    );
  });
});

describe('pool and issue queues', () => {
  it('lists only approved MRs, skips rejected lines and unapproved new items', () => {
    const w = f.world({
      mrs: [
        f.mr({ id: 'm1' }),
        f.mr({ id: 'm2', status: 'QS_PENDING' }),
      ],
      mrLines: [
        f.mrLine({ id: 'l1', mrId: 'm1', qty: 10, poQty: 10 }),
        f.mrLine({ id: 'l2', mrId: 'm1', sn: 2, qty: 10, poQty: 10, lineStatus: 'REJECTED' }),
        // a new item not yet approved has no itemId -> not buyable
        f.mrLine({ id: 'l3', mrId: 'm1', sn: 3, itemId: null, qty: 10, poQty: 10 }),
        f.mrLine({ id: 'l4', mrId: 'm2', qty: 10, poQty: 10 }),
      ],
    });
    expect(poolRows(w).map((r) => r.line.id)).toEqual(['l1']);
  });

  it('the issue queue includes a new-item line once it has store quantity', () => {
    const w = f.world({
      mrs: [f.mr({ id: 'm1' })],
      mrLines: [
        f.mrLine({ id: 'l1', mrId: 'm1', qty: 10, storeQty: 10 }),
        f.mrLine({ id: 'l2', mrId: 'm1', sn: 2, qty: 10, poQty: 10 }),
      ],
    });
    expect(issueRows(w).map((r) => r.line.id)).toEqual(['l1']);
  });
});

describe('lineStage and reportLines', () => {
  it('names every stage a line can be in', () => {
    const w = f.world({
      mrs: [f.mr({ id: 'm1' })],
      mrLines: [f.mrLine({ id: 'l1', mrId: 'm1', qty: 100, storeQty: 40, poQty: 60 })],
      pos: [f.po({ id: 'po1' })],
      poLines: [f.poLine({ id: 'pl1', poId: 'po1', qty: 20, rate: 1 })],
      poAllocs: [
        f.poAlloc({ id: 'pa1', poId: 'po1', poLineId: 'pl1', mrLineId: 'l1', qty: 20 }),
      ],
      rfqs: [f.rfq({ id: 'r1' })],
      rfqLines: [
        f.rfqLine({
          id: 'rl1',
          rfqId: 'r1',
          qty: 10,
          allocs: [{ mrLineId: 'l1', projectId: 'p1', qty: 10 }],
        }),
      ],
      issues: [f.issue({ id: 'is1', mrId: 'm1' })],
      issueLines: [
        f.issueLine({ id: 'il1', issueId: 'is1', mrLineId: 'l1', qtyIssued: 5 }),
      ],
    });
    const line = w.mrLines[0]!;
    const stage = lineStage(line, w.mrs[0]!, lineCalc(w, line));
    expect(stage).toBe('Awaiting site · At store · Enquiry · In pool · On PO');
  });

  it('reports a rejected line, an unapproved MR and a fully cut line distinctly', () => {
    const w = f.world({
      mrs: [f.mr({ id: 'm1' }), f.mr({ id: 'm2', status: 'QS_PENDING' })],
      mrLines: [
        f.mrLine({ id: 'l1', mrId: 'm1', lineStatus: 'REJECTED' }),
        f.mrLine({ id: 'l2', mrId: 'm1', sn: 2, qty: 10, storeQty: 0, poQty: 0 }),
        f.mrLine({ id: 'l3', mrId: 'm2', qty: 10 }),
      ],
    });
    const rows = reportLines(w, undefined, '2026-01-01');
    const byLine = Object.fromEntries(rows.map((r) => [r.item + r.stage, r.stage]));
    expect(Object.values(byLine)).toContain('Line rejected');
    expect(Object.values(byLine)).toContain('Not approved');
    expect(Object.values(byLine)).toContain('With QS');
  });

  it('flags a line overdue only while it is still open', () => {
    const w = f.world({
      mrs: [f.mr({ id: 'm1', requiredDate: '2026-01-01' })],
      mrLines: [f.mrLine({ id: 'l1', mrId: 'm1', qty: 10, storeQty: 10 })],
      issues: [f.issue({ id: 'is1', mrId: 'm1', status: 'ACCEPTED' })],
      issueLines: [
        f.issueLine({
          id: 'il1',
          issueId: 'is1',
          mrLineId: 'l1',
          qtyIssued: 10,
          qtyAccepted: 10,
        }),
      ],
    });
    expect(reportLines(w, undefined, '2026-06-01')[0]!.overdue).toBe(false);

    const open = f.world({
      mrs: [f.mr({ id: 'm1', requiredDate: '2026-01-01' })],
      mrLines: [f.mrLine({ id: 'l1', mrId: 'm1', qty: 10, storeQty: 10 })],
    });
    expect(reportLines(open, undefined, '2026-06-01')[0]!.overdue).toBe(true);
  });

  it('never reports a draft MR', () => {
    const w = f.world({
      mrs: [f.mr({ id: 'm1', status: 'DRAFT' })],
      mrLines: [f.mrLine({ id: 'l1', mrId: 'm1' })],
    });
    expect(reportLines(w)).toHaveLength(0);
  });
});
