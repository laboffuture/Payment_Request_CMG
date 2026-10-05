import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CURRENCIES, DEFAULT_CURRENCY } from '@cm/shared';
import { buildApp, resetDb, signIn, startDb, stopDb } from './harness.js';
import { seed } from '../seed/seed.js';
import { Grn, Po } from '../models/index.js';

/**
 * Two suggested vendors for the items a buyer has picked — the cheapest and
 * the quickest — and the currency the resulting order is placed in.
 *
 * The suggestions are read out of what vendors have actually quoted and
 * delivered, so the fixture below builds that history rather than asserting
 * against anything hand-set.
 */
let app: Express;
let site: Awaited<ReturnType<typeof signIn>>;
let pm: Awaited<ReturnType<typeof signIn>>;
let qs: Awaited<ReturnType<typeof signIn>>;
let proc: Awaited<ReturnType<typeof signIn>>;
let pmgr: Awaited<ReturnType<typeof signIn>>;
let mgmt: Awaited<ReturnType<typeof signIn>>;

const ids: Record<string, string> = {};

/** Walks an MR from site through the PM and QS so the pool has a line. */
async function pooledLine(qty: number): Promise<string> {
  const reference = await site.get('/api/reference');
  const project = reference.body.projects.find(
    (p: { code: string }) => p.code === 'PRJ-0114',
  );
  const items = await site.get('/api/items?limit=200');
  const item = items.body.find((i: { code: string }) => i.code === 'ITM-00231');
  ids.itemId = item.id;

  const mr = await site.post('/api/mrs').send({
    projectId: project.id,
    requiredDate: '2026-12-31',
    submit: true,
    lines: [{ itemId: item.id, qty, description: 'Board for the partitions' }],
  });

  const lineId = (await pm.get(`/api/mrs/${mr.body.id}`)).body.lines[0].id;
  await pm
    .post(`/api/mrs/${mr.body.id}/pm-approve`)
    .send({ lines: [{ id: lineId, qty }] })
    .expect(200);
  await qs
    .post(`/api/mrs/${mr.body.id}/qs-approve`)
    .send({ lines: [{ id: lineId, qty, storeQty: 0, poQty: qty }] })
    .expect(200);

  return lineId;
}

/** Raises a PO at a given rate and walks it through all three gates. */
async function orderedAt(
  mrLineId: string,
  vendorId: string,
  qty: number,
  rate: number,
): Promise<string> {
  const reference = await proc.get('/api/reference');
  const po = await proc.post('/api/pos').send({
    vendorId,
    companyId: reference.body.companies[0].id,
    rows: [{ mrLineId, qty, rate, gstPct: 5 }],
    submit: true,
    taxMode: 'VAT',
    deliverTo: 'STORE',
  });
  expect(po.status).toBe(201);

  await pmgr.post(`/api/pos/${po.body.id}/approve`).send({}).expect(200);
  await qs.post(`/api/pos/${po.body.id}/validate`).send({ ok: true }).expect(200);
  await mgmt.post(`/api/pos/${po.body.id}/mgmt-approve`).send({}).expect(200);

  return po.body.id as string;
}

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

  const reference = await proc.get('/api/reference');
  ids.vendorA = reference.body.vendors[0].id;
  ids.vendorB = reference.body.vendors[1].id;
  ids.companyId = reference.body.companies[0].id;

  // Vendor A charged 30; vendor B charged 20 for the same item.
  await orderedAt(await pooledLine(10), ids.vendorA, 10, 30);
  ids.cheapPo = await orderedAt(await pooledLine(10), ids.vendorB, 10, 20);

  // …but vendor A delivered, and vendor B has not.
  const po = await Po.findById(
    (await Po.findOne({ vendorId: ids.vendorA }).lean())!._id,
  );
  ids.fastPo = String(po!._id);
}, 240_000);

afterAll(stopDb);

const ask = (qty: number) =>
  proc.post('/api/pos/recommendations').send({ rows: [{ itemId: ids.itemId, qty }] });

describe('suggested vendors', () => {
  it('names the cheapest vendor, with the saving spelled out', async () => {
    const res = await ask(100);
    expect(res.status).toBe(200);

    const { byMoney } = res.body;
    expect(byMoney.vendorId).toBe(ids.vendorB);
    // 100 at 20 rather than 100 at 30.
    expect(byMoney.estimatedTotal).toBe(2000);
    expect(byMoney.itemsPriced).toBe(1);
    expect(byMoney.reason).toContain('Cheapest known rates');
    expect(byMoney.reason).toContain('1000');
  });

  it('scales the estimate with the quantity asked for', async () => {
    const res = await ask(5);
    expect(res.body.byMoney.estimatedTotal).toBe(100);
  });

  it('lists every vendor it considered, cheapest first', async () => {
    const res = await ask(10);
    const names = res.body.considered.map((v: { vendorId: string }) => v.vendorId);

    expect(names).toContain(ids.vendorA);
    expect(names).toContain(ids.vendorB);
    expect(names[0]).toBe(ids.vendorB);
  });

  it('prefers the vendor that actually delivered when judging on time', async () => {
    // Vendor A's order was received four days after approval. The timestamp is
    // set after the insert, because mongoose stamps createdAt on create.
    const approved = await Po.findById(ids.fastPo).lean();
    const [grn] = await Grn.create([
      {
        no: 'GRN-TEST-1',
        poId: approved!._id,
        location: 'STORE',
        dnNo: 'DN-1',
        createdBy: approved!.createdBy,
      },
    ]);
    // Straight through the driver, so mongoose's timestamps cannot re-stamp it.
    await Grn.collection.updateOne(
      { _id: grn!._id },
      { $set: { createdAt: new Date(approved!.approvedAt!.getTime() + 4 * 86_400_000) } },
    );

    const res = await ask(10);
    expect(res.body.byTime.vendorId).toBe(ids.vendorA);
    expect(res.body.byTime.measuredDays).toBe(4);
    expect(res.body.byTime.reason).toContain('Delivered in 4 day(s)');
  });

  it('says so plainly when there is no history to go on', async () => {
    const res = await proc.post('/api/pos/recommendations').send({
      rows: [{ itemId: ids.companyId, qty: 1 }],
    });

    expect(res.status).toBe(200);
    expect(res.body.byMoney).toBeNull();
    expect(res.body.byTime).toBeNull();
    expect(res.body.considered).toEqual([]);
  });

  it('is for buyers, not for everyone', async () => {
    for (const who of [site, qs, mgmt]) {
      const res = await who
        .post('/api/pos/recommendations')
        .send({ rows: [{ itemId: ids.itemId, qty: 1 }] });
      expect(res.status).toBe(403);
    }
  });
});

describe('the currency a PO is placed in', () => {
  it('offers exactly the four the business uses', () => {
    expect(CURRENCIES).toEqual(['INR', 'USD', 'AED', 'SAR']);
  });

  it('takes the one the buyer chose', async () => {
    const po = await proc.post('/api/pos').send({
      vendorId: ids.vendorA,
      companyId: ids.companyId,
      rows: [{ mrLineId: await pooledLine(4), qty: 4, rate: 12, gstPct: 5 }],
      submit: false,
      taxMode: 'VAT',
      deliverTo: 'STORE',
      currency: 'INR',
    });

    expect(po.status).toBe(201);
    expect((await proc.get(`/api/pos/${po.body.id}`)).body.currency).toBe('INR');
  });

  it('falls back to the billing entity when the buyer says nothing', async () => {
    const po = await proc.post('/api/pos').send({
      vendorId: ids.vendorA,
      companyId: ids.companyId,
      rows: [{ mrLineId: await pooledLine(4), qty: 4, rate: 12, gstPct: 5 }],
      submit: false,
      taxMode: 'VAT',
      deliverTo: 'STORE',
    });

    expect(po.status).toBe(201);
    expect((await proc.get(`/api/pos/${po.body.id}`)).body.currency).toBe(
      DEFAULT_CURRENCY,
    );
  });

  it('refuses a currency that is not one of the four', async () => {
    const po = await proc.post('/api/pos').send({
      vendorId: ids.vendorA,
      companyId: ids.companyId,
      rows: [{ mrLineId: await pooledLine(4), qty: 4, rate: 12, gstPct: 5 }],
      submit: false,
      taxMode: 'VAT',
      deliverTo: 'STORE',
      currency: 'GBP',
    });

    expect(po.status).toBe(400);
  });

  it('keeps the currency when the order is edited', async () => {
    const mrLineId = await pooledLine(4);
    const po = await proc.post('/api/pos').send({
      vendorId: ids.vendorA,
      companyId: ids.companyId,
      rows: [{ mrLineId, qty: 4, rate: 12, gstPct: 5 }],
      submit: false,
      taxMode: 'VAT',
      deliverTo: 'STORE',
      currency: 'SAR',
    });

    const saved = await proc.get(`/api/pos/${po.body.id}`);
    await proc.put(`/api/pos/${po.body.id}`).send({
      vendorId: ids.vendorA,
      companyId: ids.companyId,
      rows: [{ mrLineId, qty: 6, rate: 12, gstPct: 5 }],
      submit: false,
      taxMode: 'VAT',
      deliverTo: 'STORE',
      currency: 'SAR',
      rv: saved.body.rv,
    });

    expect((await proc.get(`/api/pos/${po.body.id}`)).body.currency).toBe('SAR');
  });
});
