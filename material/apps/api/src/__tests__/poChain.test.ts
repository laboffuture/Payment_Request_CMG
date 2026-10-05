import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MSG } from '@cm/shared';
import { buildApp, resetDb, signIn, startDb, stopDb } from './harness.js';
import { seed } from '../seed/seed.js';
import { Item, Po } from '../models/index.js';

/**
 * The three gates a purchase order passes before a vendor ever sees it:
 *
 *   procurement raises and submits
 *   → the Procurement Manager approves (or rejects)
 *   → QS answers one question — is everything QS asked for on this PO?
 *     a "no" carries the reason back to procurement
 *   → management gives the final word, and only then is the vendor told
 *
 * and the status of all of it is readable by everyone from site upwards.
 */
let app: Express;
let site: Awaited<ReturnType<typeof signIn>>;
let pm: Awaited<ReturnType<typeof signIn>>;
let qs: Awaited<ReturnType<typeof signIn>>;
let proc: Awaited<ReturnType<typeof signIn>>;
let pmgr: Awaited<ReturnType<typeof signIn>>;
let mgmt: Awaited<ReturnType<typeof signIn>>;
let admin: Awaited<ReturnType<typeof signIn>>;
let vendorA: Awaited<ReturnType<typeof signIn>>;

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
  mgmt = await signIn(app, 'mgmt', 'demo123');
  admin = await signIn(app, 'admin', 'demo123');
  vendorA = await signIn(app, 'vendora', 'demo123');

  // An MR through the full site → PM → QS chain, so the pool has something
  // for procurement to buy.
  const reference = await site.get('/api/reference');
  const project = reference.body.projects.find(
    (p: { code: string }) => p.code === 'PRJ-0114',
  );
  const items = await site.get('/api/items?limit=200');
  const item = items.body.find((i: { code: string }) => i.code === 'ITM-00231');

  ids.projectId = project.id;
  ids.itemId = item.id;
  ids.vendorId = reference.body.vendors[0].id;
  ids.companyId = reference.body.companies[0].id;

  const mr = await site.post('/api/mrs').send({
    projectId: project.id,
    requiredDate: '2026-12-31',
    submit: true,
    lines: [
      {
        itemId: item.id,
        qty: 100,
        description: 'Gypsum board for the level 4 partitions',
        measurement: '12.5 mm',
        unit: 'Nos',
      },
    ],
  });
  ids.mrId = mr.body.id;

  const withPm = await pm.get(`/api/mrs/${ids.mrId}`);
  ids.mrLineId = withPm.body.lines[0].id;
  await pm
    .post(`/api/mrs/${ids.mrId}/pm-approve`)
    .send({ lines: [{ id: ids.mrLineId, qty: 100 }] })
    .expect(200);

  // QS approves 80 for PO — the number QS validates the PO against later.
  await qs
    .post(`/api/mrs/${ids.mrId}/qs-approve`)
    .send({ lines: [{ id: ids.mrLineId, qty: 100, storeQty: 0, poQty: 80 }] })
    .expect(200);
}, 180_000);

afterAll(stopDb);

/** Raises and submits a PO for the given quantity off the pooled MR line. */
async function raisePo(qty: number): Promise<string> {
  const res = await proc.post('/api/pos').send({
    vendorId: ids.vendorId,
    companyId: ids.companyId,
    rows: [{ mrLineId: ids.mrLineId, qty, rate: 20, gstPct: 5 }],
    submit: true,
    taxMode: 'VAT',
    deliverTo: 'STORE',
  });
  expect(res.status).toBe(201);
  return res.body.id as string;
}

describe('QS validation of a purchase order', () => {
  it('goes to QS, not straight to approved, when the manager signs off', async () => {
    const poId = await raisePo(80);
    await pmgr.post(`/api/pos/${poId}/approve`).send({}).expect(200);

    expect((await Po.findById(poId).lean())?.status).toBe('QS_VALIDATION');

    const queue = await qs.get('/api/pos?status=QS_VALIDATION');
    expect(queue.body.rows.some((p: { id: string }) => p.id === poId)).toBe(true);

    await proc.post(`/api/pos/${poId}/cancel`).expect(200);
  });

  it('shows QS what QS approved next to what the PO orders', async () => {
    const poId = await raisePo(60);
    await pmgr.post(`/api/pos/${poId}/approve`).send({}).expect(200);

    const res = await qs.get(`/api/pos/${poId}`);
    const alloc = res.body.allocs[0];

    expect(alloc.qsApprovedQty).toBe(80);
    expect(alloc.qty).toBe(60);
    expect(alloc.itemName).toContain('Gypsum');

    await proc.post(`/api/pos/${poId}/cancel`).expect(200);
  });

  it('sends a "no" back to procurement with the reason, and tells the manager', async () => {
    const poId = await raisePo(60);
    await pmgr.post(`/api/pos/${poId}/approve`).send({}).expect(200);

    const res = await qs.post(`/api/pos/${poId}/validate`).send({
      ok: false,
      remark: 'I approved 80 boards, this PO only orders 60',
    });
    expect(res.status).toBe(200);

    const po = await Po.findById(poId).lean();
    expect(po?.status).toBe('REJECTED');
    expect(po?.qsRemark).toContain('only orders 60');
    expect(po?.lastCommentRole).toBe('QS');

    // Procurement can see why, and put it right.
    const asProc = await proc.get(`/api/pos/${poId}`);
    expect(asProc.body.lastComment).toContain('only orders 60');
    expect(asProc.body.lastCommentRole).toBe('QS');
    expect(asProc.body.canEdit).toBe(true);

    // The Procurement Manager who passed it on is told as well.
    const inbox = await pmgr.get('/api/notifications');
    expect(
      inbox.body.some((n: { event: string }) => n.event === 'PO_VALIDATION_FAILED'),
    ).toBe(true);

    await proc.post(`/api/pos/${poId}/cancel`).expect(200);
  });

  it('will not let QS validate a PO that is not with QS', async () => {
    const poId = await raisePo(50);

    const res = await qs.post(`/api/pos/${poId}/validate`).send({ ok: true });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe(MSG.poNotWithQs);

    await proc.post(`/api/pos/${poId}/cancel`).expect(200);
  });
});

describe('management has the last word', () => {
  it('will not approve before QS has validated', async () => {
    const poId = await raisePo(80);
    await pmgr.post(`/api/pos/${poId}/approve`).send({}).expect(200);

    const res = await mgmt.post(`/api/pos/${poId}/mgmt-approve`).send({});
    expect(res.status).toBe(409);
    expect(res.body.error).toBe(MSG.poNotWithMgmt);

    await proc.post(`/api/pos/${poId}/cancel`).expect(200);
  });

  it('rejects, and every earlier handler sees it', async () => {
    const poId = await raisePo(80);
    await pmgr.post(`/api/pos/${poId}/approve`).send({}).expect(200);
    await qs.post(`/api/pos/${poId}/validate`).send({ ok: true }).expect(200);

    const res = await mgmt
      .post(`/api/pos/${poId}/mgmt-reject`)
      .send({ comment: 'Hold this quarter' });
    expect(res.status).toBe(200);

    for (const who of [proc, pmgr, qs, site, admin, pm]) {
      const seen = await who.get(`/api/pos/${poId}`);
      expect(seen.body.status).toBe('REJECTED');
      expect(seen.body.lastComment).toBe('Hold this quarter');
      expect(seen.body.lastCommentRole).toBe('MGMT');
    }

    // Procurement and the two earlier approvers are all notified.
    for (const who of [pmgr, qs]) {
      const inbox = await who.get('/api/notifications');
      expect(inbox.body.some((n: { event: string }) => n.event === 'PO_REJECTED')).toBe(
        true,
      );
    }

    await proc.post(`/api/pos/${poId}/cancel`).expect(200);
  });

  it('approves, which releases the PO to the vendor and sets the rate', async () => {
    const poId = await raisePo(80);
    ids.poId = poId;

    await pmgr.post(`/api/pos/${poId}/approve`).send({}).expect(200);

    // Hidden from the vendor at every stage before the final approval.
    expect((await vendorA.get(`/api/pos/${poId}`)).status).toBe(403);
    await qs.post(`/api/pos/${poId}/validate`).send({ ok: true }).expect(200);
    expect((await vendorA.get(`/api/pos/${poId}`)).status).toBe(403);

    await mgmt.post(`/api/pos/${poId}/mgmt-approve`).send({}).expect(200);

    const seen = await vendorA.get(`/api/pos/${poId}`);
    expect(seen.status).toBe(200);
    expect(seen.body.status).toBe('APPROVED');

    // The item master only learns the rate once the PO is real.
    expect((await Item.findById(ids.itemId).lean())?.lastRate).toBe(20);
  });

  it('shows the site engineer and the PM the whole chain on their own MR', async () => {
    for (const who of [site, pm]) {
      const mr = await who.get(`/api/mrs/${ids.mrId}`);
      expect(mr.status).toBe(200);

      const linked = mr.body.linkedPos as Record<string, unknown>[];
      const po = linked.find((l) => l.id === ids.poId)!;
      expect(po).toBeTruthy();

      // Every gate, named and dated — the same thing procurement sees.
      expect(po.status).toBe('APPROVED');
      expect(po.raisedByName).toBe('Procurement User');
      expect(po.procMgrByName).toBe('Procurement Manager');
      expect(po.qsByName).toBe('QS User');
      expect(po.approvedByName).toBe('Management User');
      expect(po.procMgrAt).toBeTruthy();
      expect(po.qsAt).toBeTruthy();
      expect(po.approvedAt).toBeTruthy();
      expect(po.vendorName).toBeTruthy();
      expect(po.qty).toBeGreaterThan(0);
    }
  });

  it('tells the site engineer and the PM at every gate, not just the last', async () => {
    for (const who of [site, pm]) {
      const inbox = await who.get('/api/notifications');
      const events = (inbox.body as { event: string }[]).map((n) => n.event);

      expect(events).toContain('PO_QS_VALIDATION');
      expect(events).toContain('PO_VALIDATED');
      expect(events).toContain('PO_APPROVED');
      // And they were told when QS sent one back, too.
      expect(events).toContain('PO_VALIDATION_FAILED');
    }
  });

  it('lets the site engineer and the PM open the PO itself', async () => {
    for (const who of [site, pm]) {
      const res = await who.get(`/api/pos/${ids.poId}`);
      expect(res.status).toBe(200);
      // Not a cut-down view: the trail and the MR split are all there.
      expect(res.body.trail.length).toBeGreaterThan(0);
      expect(res.body.allocs.length).toBeGreaterThan(0);
      expect(res.body.valueCheck).toBeTruthy();

      // Reading is all they can do.
      expect(res.body.canApprove).toBe(false);
      expect(res.body.canValidate).toBe(false);
      expect(res.body.canMgmtApprove).toBe(false);
      expect(res.body.canEdit).toBe(false);
    }
  });

  it('records each step against the person who took it', async () => {
    const res = await site.get(`/api/pos/${ids.poId}`);

    expect(res.body.procMgrByName).toBe('Procurement Manager');
    expect(res.body.qsByName).toBe('QS User');
    expect(res.body.approvedByName).toBe('Management User');
    expect(res.body.procMgrAt).toBeTruthy();
    expect(res.body.qsAt).toBeTruthy();
    expect(res.body.approvedAt).toBeTruthy();
  });

  it('gives each role only its own gate', async () => {
    const poId = ids.poId;
    const gates = [
      [qs, 'canValidate'],
      [mgmt, 'canMgmtApprove'],
      [pmgr, 'canApprove'],
    ] as const;

    // The PO is approved now, so nobody has an open gate on it.
    for (const [who, flag] of gates) {
      const seen = await who.get(`/api/pos/${poId}`);
      expect(seen.body[flag]).toBe(false);
    }
  });
});
