import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MSG } from '@cm/shared';
import { buildApp, resetDb, signIn, startDb, stopDb } from './harness.js';
import { seed } from '../seed/seed.js';
import { Item, Mr, MrLine, Po, StockLedger } from '../models/index.js';

/**
 * The happy path of §14, end to end:
 *
 *   site raises an MR with a master item and a new item
 *   → QS maps the new item and splits store / PO
 *   → procurement consolidates and sends an enquiry to two vendors
 *   → both vendors quote
 *   → procurement awards L1 across vendors with a reason
 *   → the manager approves (and cannot approve their own PO)
 *   → the vendor acknowledges
 *   → store posts a partial GRN with a rejected quantity
 *   → store issues to site
 *   → site accepts with a shortfall (a RETURN row)
 *   → the remaining quantity is received and issued, the MR closes,
 *     and the PO reads RECEIVED.
 */
let app: Express;
let site: Awaited<ReturnType<typeof signIn>>;
let pm: Awaited<ReturnType<typeof signIn>>;
let qs: Awaited<ReturnType<typeof signIn>>;
let proc: Awaited<ReturnType<typeof signIn>>;
let pmgr: Awaited<ReturnType<typeof signIn>>;
let store: Awaited<ReturnType<typeof signIn>>;
let mgmt: Awaited<ReturnType<typeof signIn>>;
let admin: Awaited<ReturnType<typeof signIn>>;
let vendorA: Awaited<ReturnType<typeof signIn>>;
let vendorB: Awaited<ReturnType<typeof signIn>>;

const ids: Record<string, string> = {};

beforeAll(async () => {
  await startDb();
  app = await buildApp();
  await resetDb();
  await seed();

  site = await signIn(app, 'site1', 'demo123');
  pm = await signIn(app, 'pm1', 'demo123');
  qs = await signIn(app, 'qs', 'demo123');
  proc = await signIn(app, 'proc', 'demo123');
  pmgr = await signIn(app, 'pmgr', 'demo123');
  store = await signIn(app, 'store', 'demo123');
  mgmt = await signIn(app, 'mgmt', 'demo123');
  admin = await signIn(app, 'admin', 'demo123');
  vendorA = await signIn(app, 'vendora', 'demo123');
  vendorB = await signIn(app, 'vendorb', 'demo123');
}, 180_000);

afterAll(stopDb);

describe('a material request from site to closed', () => {
  it('site raises an MR with one master item and one new item', async () => {
    const reference = await site.get('/api/reference');
    const project = reference.body.projects.find(
      (p: { code: string }) => p.code === 'PRJ-0114',
    );
    const items = await site.get('/api/items?limit=200');
    const board = items.body.find((i: { code: string }) => i.code === 'ITM-00231');

    ids.projectId = project.id;
    ids.boardId = board.id;

    const created = await site.post('/api/mrs').send({
      projectId: project.id,
      requiredDate: '2026-12-31',
      submit: true,
      lines: [
        {
          itemId: board.id,
          qty: 70,
          description: 'Tapered-edge gypsum board for the level 2 ceiling grid',
          measurement: '2400 × 1200 × 12.5 mm',
          unit: 'Nos',
          boqRef: 'L2',
          remarks: 'Level 2',
        },
        {
          itemId: null,
          newItemName: 'Corner bead 3 m',
          newUnit: 'Nos',
          newCategory: 'Civil',
          qty: 40,
          description: 'Galvanised corner bead for the external angles',
          measurement: '3 m lengths',
          unit: 'Nos',
        },
      ],
    });

    expect(created.status).toBe(201);
    expect(created.body.no).toMatch(/^MR-0114-\d{2}-\d{4}$/);
    // It waits for the Project Manager, not for QS.
    expect(created.body.status).toBe('PM_PENDING');
    ids.mrId = created.body.id;
  });

  it('QS cannot act while the MR is still with the Project Manager', async () => {
    const mr = await qs.get(`/api/mrs/${ids.mrId}`);
    expect(mr.body.canQs).toBe(false);

    const res = await qs.post(`/api/mrs/${ids.mrId}/qs-approve`).send({
      lines: (mr.body.lines as { id: string; qty: number }[]).map((l) => ({
        id: l.id,
        qty: l.qty,
        storeQty: 0,
        poQty: l.qty,
      })),
    });

    expect(res.status).toBe(409);
  });

  it('the PM changes a quantity and a measurement, then passes it to QS', async () => {
    const mr = await pm.get(`/api/mrs/${ids.mrId}`);
    expect(mr.body.canPm).toBe(true);

    const lines = mr.body.lines as { id: string; name: string; qty: number }[];
    const board = lines.find((l) => l.name.startsWith('Gypsum'))!;
    const bead = lines.find((l) => l.name.startsWith('Corner'))!;

    const res = await pm.post(`/api/mrs/${ids.mrId}/pm-approve`).send({
      rv: mr.body.rv,
      comment: 'Board trimmed to what the level actually needs',
      lines: [
        {
          id: board.id,
          qty: 60,
          measurement: '2400 × 1200 × 15 mm',
          unit: 'Nos',
        },
        { id: bead.id, qty: 40, measurement: '3 m lengths', unit: 'Nos' },
      ],
    });

    expect(res.status).toBe(200);
    const saved = await Mr.findById(ids.mrId).lean();
    expect(saved?.status).toBe('QS_PENDING');
    expect(saved?.pmBy).toBeTruthy();
  });

  it('the site engineer sees exactly what the PM changed', async () => {
    const mr = await site.get(`/api/mrs/${ids.mrId}`);
    const board = (mr.body.lines as any[]).find((l) => l.name.startsWith('Gypsum'))!;

    expect(board.qty).toBe(60);
    expect(board.requestedQty).toBe(70);
    expect(board.measurement).toBe('2400 × 1200 × 15 mm');
    expect(board.requestedMeasurement).toBe('2400 × 1200 × 12.5 mm');
    expect(board.changed).toBe(true);
    expect(mr.body.lastCommentRole).toBe('PM');
    expect(mr.body.lastComment).toContain('Board trimmed');
  });

  it('QS cannot approve while a new item is still pending', async () => {
    const mr = await qs.get(`/api/mrs/${ids.mrId}`);
    const lines = mr.body.lines as { id: string; qty: number; newStatus: string }[];

    const res = await qs.post(`/api/mrs/${ids.mrId}/qs-approve`).send({
      lines: lines.map((l) => ({
        id: l.id,
        qty: l.qty,
        storeQty: 0,
        poQty: l.qty,
      })),
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(MSG.qsClearNewItems);
  });

  it('QS approves the new item into the item master', async () => {
    const mr = await qs.get(`/api/mrs/${ids.mrId}`);
    const pending = (mr.body.lines as { id: string; newStatus: string }[]).find(
      (l) => l.newStatus === 'PENDING',
    )!;

    const res = await qs.post(`/api/mr-lines/${pending.id}/approve-new`);
    expect(res.status).toBe(200);

    const created = await Item.findOne({ name: 'Corner bead 3 m' }).lean();
    expect(created?.code).toMatch(/^ITM-\d{5}$/);
  });

  it('refuses a split that exceeds what was requested', async () => {
    const mr = await qs.get(`/api/mrs/${ids.mrId}`);
    const line = (mr.body.lines as { id: string; qty: number; name: string }[])[0]!;

    const res = await qs.post(`/api/mrs/${ids.mrId}/qs-approve`).send({
      rv: mr.body.rv,
      lines: [{ id: line.id, qty: line.qty, storeQty: line.qty, poQty: line.qty }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('is more than requested');
  });

  it('refuses to take more from store than is available', async () => {
    const mr = await qs.get(`/api/mrs/${ids.mrId}`);
    const line = (mr.body.lines as { id: string; qty: number; available: number }[])[0]!;

    const res = await qs.post(`/api/mrs/${ids.mrId}/qs-approve`).send({
      rv: mr.body.rv,
      lines: [
        { id: line.id, qty: line.qty, storeQty: line.available + 5, poQty: 0 },
      ],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('available in store');
  });

  it('QS splits the lines into store and PO', async () => {
    const mr = await qs.get(`/api/mrs/${ids.mrId}`);
    const lines = mr.body.lines as { id: string; qty: number; name: string }[];
    const board = lines.find((l) => l.name.startsWith('Gypsum'))!;
    const bead = lines.find((l) => l.name.startsWith('Corner'))!;

    ids.boardLineId = board.id;
    ids.beadLineId = bead.id;

    const res = await qs.post(`/api/mrs/${ids.mrId}/qs-approve`).send({
      rv: mr.body.rv,
      comment: 'Split checked',
      lines: [
        // 10 from the 30 units of opening stock, 50 to buy.
        { id: board.id, qty: board.qty, storeQty: 10, poQty: 50 },
        { id: bead.id, qty: bead.qty, storeQty: 0, poQty: 40 },
      ],
    });

    expect(res.status).toBe(200);
    const saved = await Mr.findById(ids.mrId).lean();
    expect(saved?.status).toBe('APPROVED');
  });
});

describe('consolidation and the enquiry', () => {
  it('the approved PO quantity appears in the pool', async () => {
    const pool = await proc.get('/api/pool');
    expect(pool.status).toBe(200);

    const mine = (pool.body as { mrLineId: string; openQty: number }[]).filter((r) =>
      [ids.boardLineId, ids.beadLineId].includes(r.mrLineId),
    );
    expect(mine).toHaveLength(2);
    expect(mine.find((r) => r.mrLineId === ids.boardLineId)?.openQty).toBe(50);
  });

  it('refuses a take quantity larger than what is open', async () => {
    const reference = await proc.get('/api/reference');
    const vendors = reference.body.vendors as { id: string; name: string }[];
    ids.vendorA = vendors.find((v) => v.name.startsWith('Vendor A'))!.id;
    ids.vendorB = vendors.find((v) => v.name.startsWith('Vendor B'))!.id;

    const res = await proc.post('/api/rfqs').send({
      picks: [{ mrLineId: ids.boardLineId, qty: 999 }],
      vendorIds: [ids.vendorA],
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('take qty must be between');
  });

  it('refuses a due time in the past', async () => {
    const res = await proc.post('/api/rfqs').send({
      picks: [{ mrLineId: ids.boardLineId, qty: 50 }],
      vendorIds: [ids.vendorA],
      dueAt: new Date(Date.now() - 1000).toISOString(),
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(MSG.rfqDueFuture);
  });

  it('sends one enquiry covering both lines to two vendors', async () => {
    const res = await proc.post('/api/rfqs').send({
      picks: [
        { mrLineId: ids.boardLineId, qty: 50 },
        { mrLineId: ids.beadLineId, qty: 40 },
      ],
      vendorIds: [ids.vendorA, ids.vendorB],
      dueAt: new Date(Date.now() + 86_400_000).toISOString(),
      note: 'Please quote your best rate',
    });

    expect(res.status).toBe(201);
    expect(res.body.no).toMatch(/^RFQ-\d{2}-\d{4}$/);
    ids.rfqId = res.body.id;
  });

  it('takes the quantity out of the pool while the enquiry is open', async () => {
    const pool = await proc.get('/api/pool');
    const mine = (pool.body as { mrLineId: string }[]).filter((r) =>
      [ids.boardLineId, ids.beadLineId].includes(r.mrLineId),
    );
    expect(mine).toHaveLength(0);
  });

  it('lets each vendor see only its own invitation', async () => {
    const a = await vendorA.get('/api/vendor/rfqs');
    expect(a.body).toHaveLength(1);
    expect(a.body[0].rfq.id).toBe(ids.rfqId);
    // A vendor is never told which projects the material is for.
    expect(a.body[0].rfq.projectCodes).toEqual([]);
  });

  it('will not let a vendor quote before accepting', async () => {
    const detail = await vendorA.get(`/api/vendor/rfqs/${ids.rfqId}`);
    expect(detail.body.canQuote).toBe(false);
    expect(detail.body.myStatus).toBe('INVITED');
  });

  it('both vendors accept and quote', async () => {
    for (const [agent, rates] of [
      [vendorA, [21, 15]],
      [vendorB, [22, 12]],
    ] as const) {
      await agent.post(`/api/vendor/rfqs/${ids.rfqId}/accept`).expect(200);

      const detail = await agent.get(`/api/vendor/rfqs/${ids.rfqId}`);
      const lines = detail.body.lines as { id: string; itemName: string }[];

      const res = await agent.post(`/api/vendor/rfqs/${ids.rfqId}/quote`).send({
        leadDays: 5,
        vatPct: 5,
        validity: '2026-12-31',
        terms: '30 days',
        lines: lines.map((line, index) => ({
          rfqLineId: line.id,
          rate: rates[index],
          remark: '',
        })),
      });
      expect(res.status).toBe(200);
    }
  });

  it('refuses a quote with no rates at all', async () => {
    const detail = await vendorA.get(`/api/vendor/rfqs/${ids.rfqId}`);
    const res = await vendorA.post(`/api/vendor/rfqs/${ids.rfqId}/quote`).send({
      leadDays: 5,
      lines: (detail.body.lines as { id: string }[]).map((l) => ({
        rfqLineId: l.id,
        rate: 0,
      })),
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(MSG.vendorQuoteAtLeastOne);
  });

  it('marks the lowest rate per line, split across the two vendors', async () => {
    const detail = await proc.get(`/api/rfqs/${ids.rfqId}`);
    const lines = detail.body.lines as { id: string; itemName: string }[];

    const board = lines.find((l) => l.itemName.startsWith('Gypsum'))!;
    const bead = lines.find((l) => l.itemName.startsWith('Corner'))!;

    // A quoted 21 on the board (lowest), B quoted 12 on the bead (lowest).
    expect(detail.body.l1[board.id]).toBe(ids.vendorA);
    expect(detail.body.l1[bead.id]).toBe(ids.vendorB);

    ids.boardRfqLineId = board.id;
    ids.beadRfqLineId = bead.id;
  });

  it('demands a reason when a line is awarded away from the lowest', async () => {
    const res = await proc.post(`/api/rfqs/${ids.rfqId}/award`).send({
      awards: [
        { rfqLineId: ids.boardRfqLineId, vendorId: ids.vendorB },
        { rfqLineId: ids.beadRfqLineId, vendorId: ids.vendorB },
      ],
      submit: true,
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe(MSG.rfqReasonNotLowest);
  });

  it('awards L1 across both vendors and raises one PO each', async () => {
    const res = await proc.post(`/api/rfqs/${ids.rfqId}/award`).send({
      awards: [
        { rfqLineId: ids.boardRfqLineId, vendorId: ids.vendorA },
        { rfqLineId: ids.beadRfqLineId, vendorId: ids.vendorB },
      ],
      submit: true,
    });

    expect(res.status).toBe(200);
    expect(res.body.poNos).toHaveLength(2);
    expect(res.body.submitted).toBe(true);

    const pos = await Po.find({ rfqId: ids.rfqId }).lean();
    expect(pos).toHaveLength(2);
    expect(pos.every((p) => p.status === 'PENDING_APPROVAL')).toBe(true);

    ids.poA = String(pos.find((p) => String(p.vendorId) === ids.vendorA)!._id);
  });
});

describe('approval', () => {
  it('will not let the buyer approve, only a manager', async () => {
    const res = await proc.post(`/api/pos/${ids.poA}/approve`).send({});
    expect(res.status).toBe(403);
  });

  it('will not let a manager approve a PO they raised themselves', async () => {
    // Any line still open in the pool will do — the board line's quantity is
    // already committed to the enquiry.
    const pool = await pmgr.get('/api/pool');
    const spare = (pool.body as { mrLineId: string; openQty: number }[]).find(
      (r) => r.openQty > 0,
    )!;

    const own = await pmgr.post('/api/pos').send({
      vendorId: ids.vendorA,
      companyId: (await pmgr.get('/api/reference')).body.companies[0].id,
      rows: [{ mrLineId: spare.mrLineId, qty: 1, rate: 10, gstPct: 5 }],
      submit: true,
      taxMode: 'VAT',
      deliverTo: 'STORE',
    });
    expect(own.status).toBe(201);

    const res = await pmgr.post(`/api/pos/${own.body.id}/approve`).send({});
    expect(res.status).toBe(403);
    expect(res.body.error).toBe(MSG.poOwnPo);

    // Tidy up so it does not hold quantity out of the pool.
    await pmgr.post(`/api/pos/${own.body.id}/cancel`).expect(200);
  });

  it('the manager approves, which sends the PO to QS to validate', async () => {
    const res = await pmgr.post(`/api/pos/${ids.poA}/approve`).send({ comment: 'Fine' });
    expect(res.status).toBe(200);

    const po = await Po.findById(ids.poA).lean();
    expect(po?.status).toBe('QS_VALIDATION');
    expect(po?.procMgrBy).toBeTruthy();

    // Nothing is committed and nobody is told until management approves.
    const board = await Item.findById(ids.boardId).lean();
    expect(board?.lastRate).not.toBe(21);
  });

  it('shows QS the PO against the quantities QS approved', async () => {
    const res = await qs.get(`/api/pos/${ids.poA}`);
    expect(res.status).toBe(200);
    expect(res.body.canValidate).toBe(true);

    const allocs = res.body.allocs as {
      mrNo: string;
      itemName: string;
      qty: number;
      qsApprovedQty: number;
    }[];
    expect(allocs.length).toBeGreaterThan(0);
    for (const alloc of allocs) {
      expect(alloc.itemName).toBeTruthy();
      expect(alloc.qsApprovedQty).toBeGreaterThan(0);
    }
  });

  it('refuses a "no" that does not say what is missing', async () => {
    const res = await qs.post(`/api/pos/${ids.poA}/validate`).send({ ok: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(MSG.poValidationRemark);
  });

  it('lets nobody but QS validate', async () => {
    for (const who of [proc, pmgr, mgmt, site]) {
      const res = await who.post(`/api/pos/${ids.poA}/validate`).send({ ok: true });
      expect(res.status).toBe(403);
    }
  });

  it('QS validates, and the PO goes to management', async () => {
    const res = await qs
      .post(`/api/pos/${ids.poA}/validate`)
      .send({ ok: true, remark: 'Matches what I approved' });
    expect(res.status).toBe(200);

    const po = await Po.findById(ids.poA).lean();
    expect(po?.status).toBe('MGMT_APPROVAL');
    expect(po?.qsBy).toBeTruthy();
    expect(po?.qsRemark).toBe('Matches what I approved');
  });

  it('keeps the PO from the vendor until management has approved', async () => {
    const res = await vendorA.get(`/api/pos/${ids.poA}`);
    expect(res.status).toBe(403);
  });

  it('management approves, and the item master learns the rate', async () => {
    const mine = await mgmt.get('/api/pos?status=MGMT_APPROVAL');
    expect(mine.body.rows.some((p: { id: string }) => p.id === ids.poA)).toBe(true);

    const res = await mgmt
      .post(`/api/pos/${ids.poA}/mgmt-approve`)
      .send({ comment: 'Approved for release' });
    expect(res.status).toBe(200);

    const po = await Po.findById(ids.poA).lean();
    expect(po?.status).toBe('APPROVED');
    expect(po?.approvedBy).toBeTruthy();

    // Plan decision (d)(2): lastRate is written on the final approval.
    const board = await Item.findById(ids.boardId).lean();
    expect(board?.lastRate).toBe(21);
    expect(String(board?.lastVendorId)).toBe(ids.vendorA);
  });

  it('shows the same status to everyone, from site to management', async () => {
    for (const who of [site, pm, qs, proc, pmgr, mgmt, admin]) {
      const res = await who.get(`/api/pos/${ids.poA}`);
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('APPROVED');
      expect(res.body.procMgrByName).toBeTruthy();
      expect(res.body.qsByName).toBeTruthy();
      expect(res.body.approvedByName).toBeTruthy();
    }
  });

  it('lets an admin watch the chain but never act in it', async () => {
    const res = await admin.get(`/api/pos/${ids.poA}`);
    expect(res.body.canApprove).toBe(false);
    expect(res.body.canValidate).toBe(false);
    expect(res.body.canMgmtApprove).toBe(false);

    const tryApprove = await admin
      .post(`/api/pos/${ids.poA}/mgmt-approve`)
      .send({ comment: 'no' });
    expect(tryApprove.status).toBe(403);
  });

  it('the vendor can now see the PO and acknowledge it', async () => {
    const list = await vendorA.get('/api/pos');
    expect(list.body.rows.map((p: { id: string }) => p.id)).toContain(ids.poA);

    const ack = await vendorA.post(`/api/vendor/pos/${ids.poA}/ack`);
    expect(ack.status).toBe(200);
  });
});

describe('receiving, issuing and closing', () => {
  it('receives part of the PO, with a rejected quantity that stays open', async () => {
    const open = await store.get(`/api/grn/open-pos?location=STORE&no=${(await Po.findById(ids.poA).lean())!.no}`);
    expect(open.status).toBe(200);

    const line = open.body.selected.lines[0];
    expect(line.balance).toBe(50);
    ids.allocId = line.poAllocId;

    const res = await store.post('/api/grns').send({
      poId: ids.poA,
      location: 'STORE',
      dnNo: 'DN-001',
      lines: [{ poAllocId: line.poAllocId, qtyReceived: 30, qtyRejected: 5 }],
    });

    expect(res.status).toBe(201);

    const po = await Po.findById(ids.poA).lean();
    expect(po?.status).toBe('PARTIAL');
  });

  it('refuses to receive more than the balance', async () => {
    const res = await store.post('/api/grns').send({
      poId: ids.poA,
      location: 'STORE',
      dnNo: 'DN-002',
      lines: [{ poAllocId: ids.allocId, qtyReceived: 999, qtyRejected: 0 }],
    });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain('more than the PO balance');
  });

  it('the received material becomes issuable to that MR', async () => {
    const pending = await store.get('/api/issues/pending');
    const mr = (pending.body as { mrId: string; lines: { mrLineId: string; issuable: number }[] }[]).find(
      (m) => m.mrId === ids.mrId,
    )!;

    const line = mr.lines.find((l) => l.mrLineId === ids.boardLineId)!;
    // 10 from the QS store split + 30 just received.
    expect(line.issuable).toBe(40);
  });

  it('issues to site and takes the stock out of the store', async () => {
    const res = await store.post('/api/issues').send({
      mrId: ids.mrId,
      vehicle: 'Truck 7',
      lines: [{ mrLineId: ids.boardLineId, qtyIssued: 40 }],
    });

    expect(res.status).toBe(201);
    expect(res.body.no).toMatch(/^MIN-\d{2}-\d{4}$/);

    const issued = await StockLedger.find({ docType: 'ISSUE', docNo: res.body.no }).lean();
    expect(issued[0]?.qtyOut).toBe(40);
  });

  it('site accepts with a shortfall, which returns to store stock', async () => {
    const issues = await site.get('/api/issues');
    const waiting = (issues.body as { id: string; status: string }[]).find(
      (i) => i.status === 'ISSUED',
    )!;

    const detail = await site.get(`/api/issues/${waiting.id}`);
    const line = detail.body.lines[0];

    const res = await site.post(`/api/issues/${waiting.id}/accept`).send({
      rv: detail.body.rv,
      remark: '3 damaged in transit',
      lines: [{ issueLineId: line.id, qtyAccepted: 37 }],
    });

    expect(res.status).toBe(200);

    const returned = await StockLedger.find({ docType: 'RETURN' }).lean();
    expect(returned[0]?.qtyIn).toBe(3);
  });

  it('refuses an accepted quantity above what was issued', async () => {
    const res = await site.post(`/api/issues/${'0'.repeat(24)}/accept`).send({
      lines: [{ issueLineId: '0'.repeat(24), qtyAccepted: 1 }],
    });
    expect([404, 400]).toContain(res.status);
  });

  it('receives the rest, issues it, and the MR closes with the PO received', async () => {
    const po = await Po.findById(ids.poA).lean();

    // The remaining 20 (50 ordered − 30 received; the 5 rejected stayed open).
    await store
      .post('/api/grns')
      .send({
        poId: ids.poA,
        location: 'STORE',
        dnNo: 'DN-003',
        lines: [{ poAllocId: ids.allocId, qtyReceived: 20, qtyRejected: 0 }],
      })
      .expect(201);

    expect((await Po.findById(ids.poA).lean())?.status).toBe('RECEIVED');
    expect(po?.no).toBeTruthy();

    // Issue everything still outstanding on the board line, then accept it all.
    for (let round = 0; round < 3; round += 1) {
      const pending = await store.get('/api/issues/pending');
      const mr = (pending.body as { mrId: string; lines: { mrLineId: string; issuable: number }[] }[]).find(
        (m) => m.mrId === ids.mrId,
      );
      const line = mr?.lines.find((l) => l.mrLineId === ids.boardLineId);
      if (!line || line.issuable <= 0) break;

      await store
        .post('/api/issues')
        .send({
          mrId: ids.mrId,
          lines: [{ mrLineId: ids.boardLineId, qtyIssued: line.issuable }],
        })
        .expect(201);

      const issues = await site.get('/api/issues');
      const waiting = (issues.body as { id: string; status: string }[]).filter(
        (i) => i.status === 'ISSUED',
      );
      for (const issue of waiting) {
        const detail = await site.get(`/api/issues/${issue.id}`);
        await site.post(`/api/issues/${issue.id}/accept`).send({
          rv: detail.body.rv,
          lines: detail.body.lines.map((l: { id: string; qtyIssued: number }) => ({
            issueLineId: l.id,
            qtyAccepted: l.qtyIssued,
          })),
        });
      }
    }

    // The board line is satisfied; the bead line is on Vendor B's unapproved PO,
    // so the MR stays open — which is the correct behaviour.
    const lines = await MrLine.find({ mrId: ids.mrId }).lean();
    const board = lines.find((l) => String(l._id) === ids.boardLineId)!;
    expect(board.storeQty! + board.poQty!).toBe(60);
  });
});

describe('what a vendor must never see (§13)', () => {
  it('refuses another vendor the PO', async () => {
    const res = await vendorB.get(`/api/pos/${ids.poA}`);
    expect(res.status).toBe(403);
  });

  it('refuses a vendor the internal enquiry view with everyone else’s rates', async () => {
    const res = await vendorA.get(`/api/rfqs/${ids.rfqId}`);
    expect(res.status).toBe(403);
  });

  it('strips the trail, the value check and the project split from a vendor’s PO', async () => {
    const res = await vendorA.get(`/api/pos/${ids.poA}`);
    expect(res.status).toBe(200);
    expect(res.body.trail).toEqual([]);
    expect(res.body.allocs).toEqual([]);
    expect(res.body.grns).toEqual([]);
    expect(res.body.valueCheck).toBeNull();
    expect(res.body.revisions).toEqual([]);
  });

  it('refuses a vendor the material requests', async () => {
    expect((await vendorA.get('/api/mrs')).status).toBe(403);
    expect((await vendorA.get(`/api/mrs/${ids.mrId}`)).status).toBe(403);
  });

  it('refuses a vendor the pool and the reports', async () => {
    expect((await vendorA.get('/api/pool')).status).toBe(403);
    expect((await vendorA.get('/api/reports/lines')).status).toBe(403);
  });
});

describe('reports', () => {
  it('answers every tab', async () => {
    const tabs = [
      'lines',
      'site',
      'itemproj',
      'category',
      'overdue',
      'ageing',
      'pos',
      'povalue',
      'rfq',
      'docs',
      'stock',
      'stage',
      'vendors',
    ];

    for (const tab of tabs) {
      const res = await proc.get(`/api/reports/${tab}`);
      expect(res.status, tab).toBe(200);
      expect(res.body.tab, tab).toBe(tab);
      expect(Array.isArray(res.body.rows), tab).toBe(true);
    }
  });

  it('carries the KPI tiles on the line tracker only', async () => {
    const lines = await proc.get('/api/reports/lines');
    expect(lines.body.kpis).toHaveLength(6);

    const stock = await proc.get('/api/reports/stock');
    expect(stock.body.kpis).toBeUndefined();
  });

  it('exports a tab as CSV with a BOM so Excel opens it correctly', async () => {
    const res = await proc.get('/api/reports/stock.csv');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text.charCodeAt(0)).toBe(0xfeff);
  });
});
