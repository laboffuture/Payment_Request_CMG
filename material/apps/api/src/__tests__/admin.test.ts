import type { Express } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MSG } from '@cm/shared';
import { buildApp, resetDb, signIn, startDb, stopDb } from './harness.js';
import { seed } from '../seed/seed.js';
import { Company, Item } from '../models/masters.js';
import { StockLedger } from '../models/stock.js';
import { preview, readPreviewRows } from '../services/import.service.js';
import { runImport } from '../services/importRun.service.js';

let app: Express;
let admin: Awaited<ReturnType<typeof signIn>>;

beforeAll(async () => {
  await startDb();
  app = await buildApp();
  await resetDb();
  await seed();
  admin = await signIn(app, 'admin', 'demo123');
});

afterAll(stopDb);

describe('users', () => {
  it('refuses a duplicate login id with the prototype wording', async () => {
    const res = await admin.post('/api/admin/users').send({
      name: 'Another QS',
      login: 'qs',
      role: 'QS',
      password: 'newpass12',
      confirmPassword: 'newpass12',
      projectIds: [],
      active: true,
      emailOn: true,
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe(MSG.userLoginTaken);
  });

  it('refuses mismatched passwords', async () => {
    const res = await admin.post('/api/admin/users').send({
      name: 'Typo',
      login: 'typo',
      role: 'QS',
      password: 'newpass12',
      confirmPassword: 'newpass13',
      projectIds: [],
      active: true,
      emailOn: true,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(MSG.passwordMismatch);
  });

  it('requires a vendor for a vendor portal login', async () => {
    const res = await admin.post('/api/admin/users').send({
      name: 'Loose vendor',
      login: 'loose',
      role: 'VENDOR',
      password: 'newpass12',
      confirmPassword: 'newpass12',
      projectIds: [],
      active: true,
      emailOn: true,
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe(MSG.userVendorRequired);
  });

  it('keeps project scope only for site users', async () => {
    const reference = await admin.get('/api/reference');
    const projectIds = reference.body.projects.map((p: { id: string }) => p.id);

    const created = await admin.post('/api/admin/users').send({
      name: 'Scoped QS',
      login: 'scopedqs',
      role: 'QS',
      password: 'newpass12',
      confirmPassword: 'newpass12',
      projectIds,
      active: true,
      emailOn: true,
    });
    expect(created.status).toBe(201);
    // A QS user sees every project, so the list is not stored.
    expect(created.body.projectIds).toEqual([]);
  });
});

describe('vendors and projects', () => {
  it('refuses a duplicate vendor name whatever the casing', async () => {
    const res = await admin
      .post('/api/admin/vendors')
      .send({ name: 'vendor a (DEMO)' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe(MSG.vendorNameExists);
  });

  it('refuses a duplicate project code', async () => {
    const res = await admin
      .post('/api/admin/projects')
      .send({ code: 'PRJ-0114', name: 'Clash' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe(MSG.projectCodeExists);
  });

  it('counts the MRs against each project', async () => {
    const res = await admin.get('/api/admin/projects');
    const p114 = res.body.find((p: { code: string }) => p.code === 'PRJ-0114');
    expect(p114.mrCount).toBe(1);
  });
});

describe('companies', () => {
  it('moves the default flag rather than having two defaults', async () => {
    const created = await admin.post('/api/admin/companies').send({
      name: 'Second entity',
      taxMode: 'VAT',
      defaultTax: 5,
      isDefault: true,
    });
    expect(created.status).toBe(201);

    const defaults = await Company.find({ isDefault: true }).lean();
    expect(defaults).toHaveLength(1);
    expect(String(defaults[0]!._id)).toBe(created.body.id);
  });
});

describe('categories', () => {
  it('refuses a duplicate under the same parent', async () => {
    const res = await admin.post('/api/admin/categories').send({ name: 'Civil' });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe(MSG.categoryExists);
  });

  it('allows the same name under a different parent', async () => {
    const list = await admin.get('/api/admin/categories');
    const mep = list.body.find((c: { name: string }) => c.name === 'MEP');
    const res = await admin
      .post('/api/admin/categories')
      .send({ name: 'Paint', parentId: mep.id });
    expect(res.status).toBe(201);
  });

  it('will not nest a sub-category under a sub-category', async () => {
    const list = await admin.get('/api/admin/categories');
    const mep = list.body.find((c: { name: string }) => c.name === 'MEP');
    const electrical = mep.children.find(
      (c: { name: string }) => c.name === 'Electrical',
    );
    const res = await admin
      .post('/api/admin/categories')
      .send({ name: 'Cables', parentId: electrical.id });
    expect(res.status).toBe(400);
  });
});

describe('item master', () => {
  it('allocates the next ITM code from the counter', async () => {
    const res = await admin.post('/api/admin/items').send({
      name: 'Fire-rated board 15 mm',
      unit: 'Nos',
      category: 'Civil',
      subCategory: 'Drywall',
    });
    expect(res.status).toBe(201);
    // The seed's highest code is ITM-00955.
    expect(res.body.code).toBe('ITM-00956');
  });

  it('refuses a duplicate name', async () => {
    const res = await admin.post('/api/admin/items').send({
      name: 'gypsum board 12.5 MM',
      unit: 'Nos',
      category: 'Civil',
    });
    expect(res.status).toBe(409);
    expect(res.body.error).toBe(MSG.itemExists);
  });
});

describe('inventory import', () => {
  const csv = (rows: string[]) =>
    ['Item Code,Item Name,Unit,Category,Sub Category,Opening Qty,Rate,Remarks', ...rows].join(
      '\n',
    );

  it('flags an unknown category and a bad quantity, and skips example rows', async () => {
    const result = await preview(
      csv([
        ',Example — ignore me,Nos,Civil,Drywall,10,1,',
        ',Mystery item,Nos,Atlantis,,10,1,',
        ',Bad quantity,Nos,Civil,Drywall,-5,1,',
        ',Sub in the wrong place,Nos,Civil,Paint,10,1,',
      ]),
    );

    expect(result.skip[0]!.err).toBe(MSG.importExampleRow);
    expect(result.bad.map((b) => b.err)).toEqual([
      MSG.importCategoryUnknown('Atlantis'),
      MSG.importQtyNumber,
      MSG.importSubCategoryUnknown('Paint', 'Civil'),
    ]);
    expect(result.ok).toHaveLength(0);
  });

  it('flags a duplicate inside the file', async () => {
    const result = await preview(
      csv([',Twice over,Nos,Civil,Drywall,1,1,', ',Twice over,Nos,Civil,Drywall,2,1,']),
    );
    expect(result.ok).toHaveLength(1);
    expect(result.bad[0]!.err).toBe(MSG.importDuplicate);
  });

  it('skips an item that already has opening stock — this is a one-time import', async () => {
    const result = await preview(csv([',Gypsum board 12.5 mm,Nos,Civil,Drywall,10,21.5,']));
    expect(result.ok).toHaveLength(0);
    expect(result.skip[0]!.err).toBe(
      MSG.importAlreadyOpening('ITM-00231', 'Gypsum board 12.5 mm'),
    );
  });

  it('creates the items and their opening ledger rows', async () => {
    const result = await preview(
      csv([
        ',Cable tray 100 mm,Lm,MEP,Electrical,250,14.5,',
        ',Ball valve 25 mm,Nos,MEP,Plumbing,40,32,',
      ]),
    );
    expect(result.ok).toHaveLength(2);

    const rows = await readPreviewRows(result.token);
    const outcome = await runImport(rows, String((await adminId()) ?? ''));

    expect(outcome.newItems).toBe(2);
    expect(outcome.withStock).toBe(2);

    const tray = await Item.findOne({ name: 'Cable tray 100 mm' }).lean();
    expect(tray?.code).toMatch(/^ITM-\d{5}$/);
    expect(tray?.lastRate).toBe(14.5);

    const ledger = await StockLedger.find({ itemId: tray!._id }).lean();
    expect(ledger).toHaveLength(1);
    expect(ledger[0]!.docType).toBe('OPENING');
    expect(ledger[0]!.qtyIn).toBe(250);
  });

  it('shows the imported stock on the inventory page', async () => {
    const res = await admin.get('/api/inventory');
    const tray = res.body.find(
      (r: { name: string }) => r.name === 'Cable tray 100 mm',
    );
    expect(tray.onHand).toBe(250);
    expect(tray.available).toBe(250);
  });
});

async function adminId(): Promise<string | null> {
  const res = await admin.get('/api/me');
  return res.body?.id ?? null;
}
