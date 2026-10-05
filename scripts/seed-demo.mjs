#!/usr/bin/env node
// Demo data and a login for every role - for local testing only.
//
//   ADMIN_EMAIL=admin@local.test ADMIN_PASSWORD=... node scripts/seed-demo.mjs
//
// 1. Loads Material Management's demo data (projects, vendors, items, and requests,
//    enquiries, POs and receipts at every stage). This WIPES the material database.
// 2. Creates - or resets - one login per role through Users & access, signed in as the
//    administrator, so each is made exactly as one made by hand would be. Every test
//    login gets the same password, printed at the end.
//
// The material logins use the demo users' email addresses, so each links to its demo
// user and arrives with that user's history (the same-person merge at work).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = (process.env.APP_URL ?? 'http://localhost:8000').replace(/\/+$/, '');
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';
const TEST_PASSWORD = process.env.TEST_PASSWORD ?? 'Welcome2026';
if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set ADMIN_EMAIL and ADMIN_PASSWORD (an Administrator login).');
  process.exit(1);
}

const oid = (hex) => hex.padStart(24, '0'); // the demo seed's stable ids
const PROJECT = { p98: oid('3001'), p114: oid('3002'), p105: oid('3003') };
const VENDOR = { a: oid('2001'), b: oid('2002'), c: oid('2003') };

// [email, name, roles, organisation-chart employee id or '', material scope]
const LOGINS = [
  ['requestor@cmg.test', 'Rahul Menon', ['Requestor'], 'E-002'],
  ['depthead@cmg.test', 'Divya Raman', ['Department Head'], 'E-003'],
  ['accountant@cmg.test', 'Sanjay Pillai', ['Accountant'], 'E-004'],
  ['auditor@cmg.test', 'Nithya Krishnan', ['Auditor'], 'E-005'],
  ['finance@cmg.test', 'Ahmed Faisal', ['Finance'], 'E-006'],
  ['management@cmg.test', 'Sara Thomas', ['Management'], 'E-007'],
  ['audithead@cmg.test', 'Priya Sundaram', ['Audit Head'], 'E-009'],
  ['site1@example.com', 'Site Engineer 1', ['Site Engineer'], '', { projectIds: [PROJECT.p114, PROJECT.p98] }],
  ['site2@example.com', 'Site Engineer 2', ['Site Engineer'], '', { projectIds: [PROJECT.p105] }],
  ['pm1@example.com', 'Project Manager 1', ['Project Manager'], ''],
  ['qs@example.com', 'QS User', ['QS'], ''],
  ['proc@example.com', 'Procurement User', ['Procurement'], ''],
  ['pmgr@example.com', 'Procurement Manager', ['Procurement Manager'], ''],
  ['store@example.com', 'Store Keeper', ['Store'], ''],
  ['mgmt@example.com', 'Management User', ['Management (Material)'], ''],
  ['admin@example.com', 'Material Admin', ['Material Admin'], ''],
  ['vendora@example.com', 'Vendor A — sales', ['Vendor'], '', { vendorId: VENDOR.a }],
  ['vendorb@example.com', 'Vendor B — sales', ['Vendor'], '', { vendorId: VENDOR.b }],
  ['vendorc@example.com', 'Vendor C — sales', ['Vendor'], '', { vendorId: VENDOR.c }],
];

// ------------------------------------------------------------------ 1. material data
const secrets = JSON.parse(fs.readFileSync(path.join(ROOT, '.local', 'dev-secrets.json'), 'utf8'));
console.log('• loading Material demo data (wipes the material database)');
const seeded = spawnSync('npx', ['tsx', 'src/seed/run.ts'], {
  cwd: path.join(ROOT, 'material', 'apps', 'api'),
  shell: process.platform === 'win32',
  encoding: 'utf8',
  env: {
    ...process.env,
    NODE_ENV: 'development',
    SEED_ALLOWED: 'true',
    REDIS_URL: '',
    LOG_LEVEL: 'warn',
    MONGO_URI: process.env.MONGO_URI ??
      'mongodb://127.0.0.1:27017/chandramari_material?replicaSet=rs0&directConnection=true',
    JWT_ACCESS_SECRET: secrets.JWT_ACCESS_SECRET,
    JWT_REFRESH_SECRET: secrets.JWT_REFRESH_SECRET,
  },
});
if (seeded.status !== 0) {
  console.error(seeded.stdout, seeded.stderr);
  process.exit(1);
}

// ------------------------------------------------------------------ 2. logins
const jar = new Map();
async function call(method, url, body, cookies = jar) {
  const res = await fetch(BASE + url, {
    method,
    headers: {
      'content-type': 'application/json',
      cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join('; '),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(';');
    const [k, v] = pair.split('=');
    cookies.set(k.trim(), v);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${method} ${url}: ${res.status} ${data.error ?? ''}`);
  return data;
}

await call('POST', '/api/auth/session', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
const existing = new Map();
for (const u of (await call('GET', '/api/auth/users?limit=200')).users) existing.set(u.email, u);

/* The temporary password a new or reset login is given, then replaced with the test one
   the way a person would: sign in, change it. */
async function setPassword(email, temporary) {
  const own = new Map();
  await call('POST', '/api/auth/session', { email, password: temporary }, own);
  await call('POST', '/api/auth/change-password', { current: temporary, next: TEST_PASSWORD }, own);
}

for (const [email, name, roles, employeeId, material = {}] of LOGINS) {
  const scope = { projectIds: material.projectIds ?? [], vendorId: material.vendorId ?? '' };
  const had = existing.get(email);
  let temporary;
  if (had) {
    await call('PATCH', '/api/auth/users', { id: had.id, roles, material: scope });
    if (!had.active) await call('PATCH', '/api/auth/users', { id: had.id, action: 'activate' });
    temporary = (await call('PATCH', '/api/auth/users', { id: had.id, action: 'reset' })).temporaryPassword;
  } else {
    temporary = (await call('POST', '/api/auth/users', { name, email, employeeId, roles, material: scope }))
      .temporaryPassword;
  }
  await setPassword(email, temporary);
  console.log(`  ✔ ${email.padEnd(24)} ${roles.join(', ')}`);
}

console.log(`\nEvery login above signs in with the password: ${TEST_PASSWORD}`);
