import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import type { Express } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Single sign-on with the Payment app (lib/paymentSso.ts), against a stand-in
 * Payment app that speaks the same /api/auth/session contract as the real one.
 * env.ts is read at import, so SSO is switched on before anything loads it.
 */
const PORT = vi.hoisted(() => {
  const port = 47_000 + Math.floor(Math.random() * 1000);
  process.env.PAYMENT_INTERNAL_URL = `http://127.0.0.1:${port}`;
  return port;
});

import { buildApp, resetDb, startDb, stopDb } from './harness.js';
import { Project, User, Vendor } from '../models/masters.js';
import { hashPassword } from '../lib/password.js';

// ---------------------------------------------------------------------------
// the stand-in Payment app
// ---------------------------------------------------------------------------

interface PayUser {
  userId: string;
  email: string;
  name: string;
  roles: string[];
  password: string;
  mustChange?: boolean;
  material?: { projectIds?: string[]; vendorId?: string };
}

const payUsers = new Map<string, PayUser>();
const paySessions = new Map<string, PayUser>();
let payment: Server;

const cookieOf = (header = '') =>
  /(?:^|;\s*)cot_session=([^;]+)/.exec(header)?.[1] ?? '';

const actorOf = (u: PayUser) => ({
  userId: u.userId,
  email: u.email,
  name: u.name,
  roles: u.roles,
  employeeId: '',
  material: u.material ?? { projectIds: [], vendorId: '' },
});

function startPayment(): Promise<void> {
  payment = createServer((req, res) => {
    const json = (status: number, body: unknown, extra: Record<string, string> = {}) => {
      res.writeHead(status, { 'content-type': 'application/json', ...extra });
      res.end(JSON.stringify(body));
    };
    if (req.url !== '/api/auth/session') return json(404, {});
    const token = decodeURIComponent(cookieOf(req.headers.cookie));

    if (req.method === 'GET') {
      const u = paySessions.get(token);
      return json(200, { actor: u ? actorOf(u) : null });
    }
    if (req.method === 'DELETE') {
      paySessions.delete(token);
      return json(200, { signedOut: true }, { 'set-cookie': 'cot_session=; Path=/; Max-Age=0' });
    }
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const { email, password } = JSON.parse(raw || '{}');
      const u = payUsers.get(String(email).toLowerCase());
      if (!u || u.password !== password) return json(401, { error: 'no match' });
      const t = randomBytes(32).toString('hex');
      paySessions.set(t, u);
      json(200, { actor: actorOf(u), mustChange: !!u.mustChange }, {
        'set-cookie': `cot_session=${t}; HttpOnly; Path=/`,
      });
    });
  });
  return new Promise((resolve) => payment.listen(PORT, '127.0.0.1', resolve));
}

/** A live Payment session for this person, as its browser cookie. */
function paymentSession(u: PayUser): string {
  payUsers.set(u.email, u);
  const t = randomBytes(32).toString('hex');
  paySessions.set(t, u);
  return `cot_session=${t}`;
}

const person = (over: Partial<PayUser> = {}): PayUser => {
  const id = randomBytes(4).toString('hex');
  return {
    userId: `u-${id}`,
    email: `p${id}@cmg.test`,
    name: `Person ${id}`,
    roles: ['Requestor'],
    password: 'payment-pass-1',
    ...over,
  };
};

async function materialUser(over: Record<string, unknown>) {
  return User.create({
    name: 'Local',
    login: `local${randomBytes(3).toString('hex')}`,
    email: '',
    role: 'QS',
    projectIds: [],
    active: true,
    emailOn: true,
    passwordHash: await hashPassword('material-pass-1'),
    ...over,
  });
}

let app: Express;

beforeAll(async () => {
  await startPayment();
  await startDb();
  app = await buildApp();
});

afterAll(async () => {
  await stopDb();
  await new Promise((r) => payment.close(r));
  // Every test file shares this process: leave sign-on off for the ones after us.
  delete process.env.PAYMENT_INTERNAL_URL;
});

beforeEach(async () => {
  await resetDb();
  payUsers.clear();
  paySessions.clear();
});

// ---------------------------------------------------------------------------

describe('one administrator for the whole application', () => {
  it('makes the Administrator ADMIN here on the first visit', async () => {
    const admin = person({ roles: ['Administrator'] });
    const res = await request(app).get('/api/me').set('Cookie', paymentSession(admin));

    expect(res.status).toBe(200);
    expect(res.body.role).toBe('ADMIN');
    const stored = await User.find({ email: admin.email }).lean();
    expect(stored).toHaveLength(1);
    expect(stored[0]!.paymentUserId).toBe(admin.userId);
  });

  it('does not offer the "create the first admin" route', async () => {
    const state = await request(app).get('/api/auth/state');
    expect(state.body.needsFirstSetup).toBe(false);
    const setup = await request(app).post('/api/auth/first-setup').send({
      name: 'Intruder', login: 'intruder', password: 'intruder-pass-1',
    });
    expect(setup.status).toBe(409);
  });
});

describe('roles come from the one login', () => {
  it('gives a person the material role their login holds', async () => {
    const p = person({ roles: ['Accountant', 'Store'] });
    const res = await request(app).get('/api/me').set('Cookie', paymentSession(p));
    expect(res.status).toBe(200);
    expect(res.body.role).toBe('STORE');
  });

  it('gives payment-only staff nothing here', async () => {
    const res = await request(app).get('/api/me').set('Cookie', paymentSession(person()));
    expect(res.status).toBe(401);
    expect(await User.countDocuments({})).toBe(0);
  });

  it('switches between the material roles a person holds, and no further', async () => {
    const p = person({ roles: ['QS', 'Project Manager'] });
    const cookie = paymentSession(p);
    const pm = await request(app).get('/api/me').set('Cookie', cookie).set('x-cm-role', 'PM');
    expect(pm.body.role).toBe('PM');
    const first = await request(app).get('/api/me').set('Cookie', cookie).set('x-cm-role', 'ADMIN');
    expect(first.body.role).toBe('QS');
  });

  it('follows a role taken away on the payment side', async () => {
    const p = person({ roles: ['Store'] });
    const cookie = paymentSession(p);
    expect((await request(app).get('/api/me').set('Cookie', cookie)).status).toBe(200);
    p.roles = ['Accountant'];
    // a new session, as the change would bring after the cache window
    expect((await request(app).get('/api/me').set('Cookie', paymentSession(p))).status).toBe(401);
  });

  it("keeps a site engineer to the projects on their login", async () => {
    const pr = await Project.create({ code: 'PRJ-9', name: 'Tower' });
    const p = person({ roles: ['Site Engineer'], material: { projectIds: [String(pr._id), 'junk'] } });
    const res = await request(app).get('/api/me').set('Cookie', paymentSession(p));
    expect(res.body.role).toBe('SITE');
    expect(res.body.projectIds).toEqual([String(pr._id)]);
  });

  it('binds a vendor login to its supplier, and refuses one without', async () => {
    const v = await Vendor.create({ name: 'Acme Supplies' });
    const good = person({ roles: ['Vendor'], material: { vendorId: String(v._id) } });
    const res = await request(app).get('/api/me').set('Cookie', paymentSession(good));
    expect(res.body.role).toBe('VENDOR');
    expect(res.body.vendorId).toBe(String(v._id));

    const bad = person({ roles: ['Vendor'] });
    expect((await request(app).get('/api/me').set('Cookie', paymentSession(bad))).status).toBe(401);
  });
});

describe('the same person is one account', () => {
  it('links an existing Material user by email, keeping their history', async () => {
    const p = person({ roles: ['Store'] });
    const local = await materialUser({ email: p.email, role: 'QS' });

    const res = await request(app).get('/api/me').set('Cookie', paymentSession(p));
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(String(local._id));
    expect(res.body.role).toBe('STORE');
    expect(await User.countDocuments({ email: p.email })).toBe(1);
  });

  it("links a vendor login to that supplier's existing portal user", async () => {
    const v = await Vendor.create({ name: 'Beta Traders' });
    const p = person({ roles: ['Vendor'], material: { vendorId: String(v._id) } });
    const local = await materialUser({ email: p.email, role: 'VENDOR', vendorId: v._id });
    const res = await request(app).get('/api/me').set('Cookie', paymentSession(p));
    expect(res.body.id).toBe(String(local._id));
    expect(await User.countDocuments({ email: p.email })).toBe(1);
  });

  it('refuses to guess when two Material users share the address', async () => {
    const p = person({ roles: ['QS'] });
    await materialUser({ email: p.email, role: 'QS' });
    await materialUser({ email: p.email, role: 'STORE' });

    const res = await request(app).get('/api/me').set('Cookie', paymentSession(p));
    expect(res.status).toBe(401);
    expect(await User.countDocuments({ paymentUserId: p.userId })).toBe(0);
  });

  it('never takes over a vendor record that happens to share the email', async () => {
    const p = person({ roles: ['QS'] });
    const vendorUser = await materialUser({ email: p.email, role: 'VENDOR', vendorId: null });

    const res = await request(app).get('/api/me').set('Cookie', paymentSession(p));
    expect(res.status).toBe(200);
    expect(res.body.id).not.toBe(String(vendorUser._id));
  });

  it('stops working here once the session ends', async () => {
    const admin = person({ roles: ['Administrator'] });
    const cookie = paymentSession(admin);
    expect((await request(app).get('/api/me').set('Cookie', cookie)).status).toBe(200);

    const out = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(out.status).toBe(200);
    expect(String(out.headers['set-cookie'])).toContain('cot_session=;');
    expect((await request(app).get('/api/me').set('Cookie', cookie)).status).toBe(401);
  });

  it("will not change a linked account's password here", async () => {
    const p = person({ roles: ['QS'] });
    const res = await request(app)
      .patch('/api/me')
      .set('Cookie', paymentSession(p))
      .send({ currentPassword: 'x', newPassword: 'another-pass-1' });
    expect(res.status).toBe(400);
  });
});
