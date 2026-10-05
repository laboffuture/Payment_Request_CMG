#!/usr/bin/env node
// Merge the two user lists: one person, one account.
//
//   node scripts/merge-users.mjs            # dry run: report only, writes nothing
//   node scripts/merge-users.mjs --apply    # link the unambiguous matches
//
// The Payment app is the master and is never written to. For every Material user:
//
//   linked      already tied to a Payment account (paymentUserId)       - nothing to do
//   match       same email as exactly one Payment account               - --apply links it;
//               their Material role is kept, and from then on they use their Payment password
//   conflict    several Material users share that email                  - you decide; never guessed
//   vendor      a supplier login                                         - stays Material-only
//   local-only  no email, or an email the Payment app does not know      - stays Material-only
//
// It also lists Payment staff with no Material account. They need nothing now: the
// administrator gives them Material access with Admin -> Users -> Import from Payment app.
// Sign-on links the same email automatically too, so --apply is only needed to link
// everyone up front instead of on each person's first visit.
//
// Settings (defaults suit `node scripts/dev.mjs`):
//   PAYMENT_URL        http://127.0.0.1:5173
//   INTEGRATION_TOKEN  from .local/dev-secrets.json
//   MONGO_URI          mongodb://127.0.0.1:27017/chandramari_material?replicaSet=rs0&directConnection=true
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const apply = process.argv.includes('--apply');

const secretsFile = path.join(ROOT, '.local', 'dev-secrets.json');
const devSecrets = fs.existsSync(secretsFile) ? JSON.parse(fs.readFileSync(secretsFile, 'utf8')) : {};
const PAYMENT_URL = (process.env.PAYMENT_URL ?? 'http://127.0.0.1:5173').replace(/\/+$/, '');
const TOKEN = process.env.INTEGRATION_TOKEN ?? devSecrets.INTEGRATION_TOKEN ?? '';
const MONGO_URI = process.env.MONGO_URI ??
  'mongodb://127.0.0.1:27017/chandramari_material?replicaSet=rs0&directConnection=true';

// the Mongo driver the Material API already depends on
const fromApi = createRequire(path.join(ROOT, 'material', 'apps', 'api', 'package.json'));
const { MongoClient } = createRequire(fromApi.resolve('mongoose'))('mongodb');

if (!TOKEN) {
  console.error('INTEGRATION_TOKEN is not set (and .local/dev-secrets.json has none).');
  process.exit(1);
}

const res = await fetch(`${PAYMENT_URL}/api/integration/users`, {
  headers: { authorization: `Bearer ${TOKEN}` },
}).catch((e) => ({ ok: false, status: e.message }));
if (!res.ok) {
  console.error(`Could not read Payment users from ${PAYMENT_URL} (${res.status}).`);
  process.exit(1);
}
const paymentUsers = await res.json();
const paymentByEmail = new Map();
for (const p of paymentUsers) if (p.email) paymentByEmail.set(p.email.toLowerCase(), p);
const paymentById = new Map(paymentUsers.map((p) => [p.id, p]));

const client = new MongoClient(MONGO_URI);
await client.connect();
const users = client.db().collection('users');
const material = await users.find({}, { projection: { passwordHash: 0 } }).toArray();

const emailCount = new Map();
for (const u of material) {
  const e = (u.email || '').toLowerCase();
  if (e && u.role !== 'VENDOR') emailCount.set(e, (emailCount.get(e) ?? 0) + 1);
}

const rows = { linked: [], match: [], conflict: [], vendor: [], 'local-only': [] };
for (const u of material) {
  const email = (u.email || '').toLowerCase();
  const who = { id: String(u._id), login: u.login, name: u.name, email, role: u.role };
  if (u.paymentUserId) rows.linked.push({ ...who, payment: paymentById.get(u.paymentUserId)?.email ?? `(${u.paymentUserId} - not active in Payment)` });
  else if (u.role === 'VENDOR') rows.vendor.push(who);
  else if (email && (emailCount.get(email) ?? 0) > 1 && paymentByEmail.has(email)) rows.conflict.push(who);
  else if (email && paymentByEmail.has(email)) rows.match.push({ ...who, paymentId: paymentByEmail.get(email).id });
  else rows['local-only'].push(who);
}

const inMaterial = new Set(material.map((u) => u.paymentUserId).filter(Boolean));
const matchedIds = new Set(rows.match.map((r) => r.paymentId));
const importable = paymentUsers.filter((p) => !inMaterial.has(p.id) && !matchedIds.has(p.id));

const show = (title, list, fmt) => {
  console.log(`\n${title} (${list.length})`);
  for (const r of list) console.log(`  ${fmt(r)}`);
};
console.log(`Payment app: ${paymentUsers.length} active accounts   Material: ${material.length} users`);
show('Already one account', rows.linked, (r) => `${r.login.padEnd(28)} ${r.role.padEnd(9)} = ${r.payment}`);
show('Same person - will be linked, Material role kept', rows.match, (r) => `${r.login.padEnd(28)} ${r.role.padEnd(9)} = ${r.email}`);
show('CONFLICT - several Material users share this email; fix by hand', rows.conflict, (r) => `${r.login.padEnd(28)} ${r.role.padEnd(9)} ${r.email}`);
show('Vendors - stay Material-only', rows.vendor, (r) => `${r.login.padEnd(28)} ${r.email || '(no email)'}`);
show('Material-only staff - no Payment account with that email', rows['local-only'], (r) => `${r.login.padEnd(28)} ${r.role.padEnd(9)} ${r.email || '(no email)'}`);
show('Payment staff without Material access (import them in Material when needed)', importable, (p) => `${p.email.padEnd(36)} ${p.name}`);

if (apply && rows.match.length) {
  for (const r of rows.match) {
    await users.updateOne({ _id: material.find((u) => String(u._id) === r.id)._id, paymentUserId: { $in: ['', null] } },
      { $set: { paymentUserId: r.paymentId } });
  }
  console.log(`\nLinked ${rows.match.length} account(s).`);
} else if (rows.match.length) {
  console.log('\nDry run - nothing written. Run again with --apply to link the matches above.');
}
await client.close();
