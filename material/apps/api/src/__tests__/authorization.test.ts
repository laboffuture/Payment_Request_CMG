import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, resetDb, signIn, startDb, stopDb } from './harness.js';
import { seed } from '../seed/seed.js';

/**
 * §13: "server-side authorisation on every route". These are the Phase 1
 * proofs; the vendor-isolation and project-scope tests for MRs, POs and quotes
 * arrive with the phases that build those routes.
 */

let app: Express;

beforeAll(async () => {
  await startDb();
  app = await buildApp();
  await resetDb();
  await seed();
});

afterAll(stopDb);

describe('admin routes are admin only', () => {
  const adminRoutes = [
    '/api/admin/users',
    '/api/admin/vendors',
    '/api/admin/projects',
    '/api/admin/companies',
    '/api/admin/categories',
    '/api/admin/items',
    '/api/admin/notify-rules',
    '/api/admin/mail/outbox',
  ];

  it('refuses every one of them without a session', async () => {
    for (const route of adminRoutes) {
      const res = await request(app).get(route);
      expect(res.status, route).toBe(401);
    }
  });

  it('refuses every one of them to a site engineer', async () => {
    const site = await signIn(app, 'site1', 'demo123');
    for (const route of adminRoutes) {
      const res = await site.get(route);
      expect(res.status, route).toBe(403);
    }
  });

  it('refuses them to a vendor', async () => {
    const vendor = await signIn(app, 'vendora', 'demo123');
    for (const route of adminRoutes) {
      const res = await vendor.get(route);
      expect(res.status, route).toBe(403);
    }
  });

  it('allows them to an admin', async () => {
    const admin = await signIn(app, 'admin', 'demo123');
    for (const route of adminRoutes) {
      const res = await admin.get(route);
      expect(res.status, route).toBe(200);
    }
  });
});

describe('inventory is closed to site engineers and vendors', () => {
  it('lets QS, store, management and admin in', async () => {
    for (const login of ['qs', 'store', 'mgmt', 'admin']) {
      const agent = await signIn(app, login, 'demo123');
      expect((await agent.get('/api/inventory')).status, login).toBe(200);
    }
  });

  it('keeps site and vendor out', async () => {
    for (const login of ['site1', 'vendora']) {
      const agent = await signIn(app, login, 'demo123');
      expect((await agent.get('/api/inventory')).status, login).toBe(403);
    }
  });
});

describe('reference data is scoped to the caller', () => {
  it('gives a site engineer only their own projects', async () => {
    const site = await signIn(app, 'site1', 'demo123');
    const res = await site.get('/api/reference');
    expect(res.status).toBe(200);

    const codes = res.body.projects.map((p: { code: string }) => p.code).sort();
    // site1 is restricted to PRJ-0114 and PRJ-0098 by the seed.
    expect(codes).toEqual(['PRJ-0098', 'PRJ-0114']);
  });

  it('gives an unrestricted user every project', async () => {
    const qs = await signIn(app, 'qs', 'demo123');
    const res = await qs.get('/api/reference');
    expect(res.body.projects).toHaveLength(3);
  });

  it('never hands a vendor the internal vendor or company lists', async () => {
    const vendor = await signIn(app, 'vendora', 'demo123');
    const res = await vendor.get('/api/reference');
    expect(res.status).toBe(200);
    expect(res.body.vendors).toEqual([]);
    expect(res.body.companies).toEqual([]);
  });
});

describe('badge counts follow the role', () => {
  it('gives QS the queue and procurement the pool', async () => {
    const qs = await signIn(app, 'qs', 'demo123');
    const qsCounts = await qs.get('/api/me/counts');
    // The seed leaves two MRs waiting for QS.
    expect(qsCounts.body.qsQueue).toBe(2);
    expect(qsCounts.body.pool).toBeUndefined();

    const proc = await signIn(app, 'proc', 'demo123');
    const procCounts = await proc.get('/api/me/counts');
    // MR-0105 was approved with 250 + 30 for purchase, across two items.
    expect(procCounts.body.pool).toBe(2);
    expect(procCounts.body.qsQueue).toBeUndefined();
  });

  it('gives a vendor only its own invitation count', async () => {
    const vendor = await signIn(app, 'vendora', 'demo123');
    const res = await vendor.get('/api/me/counts');
    expect(res.body.vendorRfqs).toBe(0);
    expect(res.body.poApprovals).toBeUndefined();
  });
});
