#!/usr/bin/env node
// Start the merged system locally, on Windows, macOS or Linux:
//
//   node scripts/dev.mjs                   # everything, at http://localhost:8000
//   node scripts/dev.mjs --seed-material   # also wipe Material and load its demo data
//
// Runs: MongoDB (single-node replica set), the application (payment and material
// screens together), the Material API, and the gateway that puts them on one address. Logs go to
// .local/logs/. Ctrl+C stops everything. Needs `npm ci` here
// and `npx pnpm@9.12.0 install` in material first (the script says so if they are missing).
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PAYMENT = ROOT;
const MATERIAL = path.join(ROOT, 'material');
const LOCAL = path.join(ROOT, '.local');
const LOGS = path.join(LOCAL, 'logs');
// The Material API is on 4100, not its standalone 4000, so the old D:Material Management
// app can run beside this one without taking its port.
const PORTS = { gateway: 8000, payment: 5173, materialApi: 4100, mongo: 27017 };
const WIN = process.platform === 'win32';
const seedMaterial = process.argv.includes('--seed-material');

fs.mkdirSync(LOGS, { recursive: true });
fs.mkdirSync(path.join(LOCAL, 'mongo-data'), { recursive: true });

const die = (msg) => { console.error(`\n✖ ${msg}\n`); shutdown(1); };
const say = (msg) => console.log(`• ${msg}`);

// --- secrets: generated once, kept in .local (git-ignored) --------------------
const secretsFile = path.join(LOCAL, 'dev-secrets.json');
const secrets = fs.existsSync(secretsFile)
  ? JSON.parse(fs.readFileSync(secretsFile, 'utf8'))
  : {
      INTEGRATION_TOKEN: randomBytes(32).toString('hex'),
      JWT_ACCESS_SECRET: randomBytes(48).toString('base64'),
      JWT_REFRESH_SECRET: randomBytes(48).toString('base64'),
    };
fs.writeFileSync(secretsFile, JSON.stringify(secrets, null, 2));

// The Payment worker reads its secrets from .dev.vars (git-ignored). Keep any
// other lines already there; only INTEGRATION_TOKEN is ours.
const devVars = path.join(PAYMENT, '.dev.vars');
const kept = fs.existsSync(devVars)
  ? fs.readFileSync(devVars, 'utf8').split(/\r?\n/).filter((l) => l && !l.startsWith('INTEGRATION_TOKEN='))
  : [];
fs.writeFileSync(devVars, [...kept, `INTEGRATION_TOKEN=${secrets.INTEGRATION_TOKEN}`].join('\n') + '\n');

// --- prerequisites -------------------------------------------------------------
if (!fs.existsSync(path.join(PAYMENT, 'node_modules', '.bin', 'vinext')))
  die('Payment dependencies are missing — run `npm ci` in the repository root');
if (!fs.existsSync(path.join(MATERIAL, 'node_modules', '.pnpm')))
  die('Material dependencies are missing — run `npx pnpm@9.12.0 install` in material');

function findMongod() {
  const dirs = [
    path.join(os.homedir(), '.cache', 'mongodb-binaries'),
    path.join(MATERIAL, 'node_modules', '.cache', 'mongodb-memory-server'),
  ];
  const found = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/^mongod(-.*)?(\.exe)?$/i.test(e.name)) found.push(p);
    }
  };
  dirs.forEach(walk);
  // prefer 7.x, which is what production runs (mongo:7)
  return found.sort().reverse().find((p) => /7\.\d/.test(p)) ?? found[0];
}

const portOpen = (port) =>
  new Promise((resolve) => {
    const s = net.connect(port, '127.0.0.1');
    s.once('connect', () => { s.destroy(); resolve(true); });
    s.once('error', () => resolve(false));
  });

async function waitFor(port, label, seconds = 180) {
  for (let i = 0; i < seconds * 2; i += 1) {
    if (await portOpen(port)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  die(`${label} did not start on port ${port} — see .local/logs/`);
}

// --- process management --------------------------------------------------------
const children = [];
function start(name, command, args, cwd, env = {}) {
  const log = fs.openSync(path.join(LOGS, `${name}.log`), 'a');
  const child = spawn(command, args, {
    cwd,
    env: { ...process.env, ...env },
    stdio: ['ignore', log, log],
    shell: WIN,
    windowsHide: true,
  });
  child.on('exit', (code) => {
    if (!stopping) console.error(`✖ ${name} exited (${code}) — see .local/logs/${name}.log`);
  });
  children.push({ name, child });
  return child;
}

function run(label, command, args, cwd, env = {}) {
  const r = spawnSync(command, args, { cwd, env: { ...process.env, ...env }, shell: WIN, encoding: 'utf8' });
  if (r.status !== 0) die(`${label} failed:\n${r.stdout ?? ''}${r.stderr ?? ''}`);
  return r.stdout;
}

let stopping = false;
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const { child } of children.reverse()) {
    if (child.exitCode !== null) continue;
    if (WIN) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else child.kill('SIGTERM');
  }
  process.exit(code);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

// --- 1. MongoDB ----------------------------------------------------------------
if (await portOpen(PORTS.mongo)) {
  say(`MongoDB already running on ${PORTS.mongo}`);
} else {
  const mongod = findMongod();
  if (!mongod) die('No mongod binary found — run the Material tests once (`npx pnpm@9.12.0 test`) to download one');
  say(`starting MongoDB (${path.basename(mongod)})`);
  start('mongod', mongod, ['--replSet', 'rs0', '--dbpath', path.join(LOCAL, 'mongo-data'),
    '--port', String(PORTS.mongo), '--bind_ip', '127.0.0.1'], ROOT);
  await waitFor(PORTS.mongo, 'MongoDB', 60);
}
run('replica set init', 'node', ['rs-init.cjs'], path.join(MATERIAL, 'apps', 'api'));

// --- 2. Material shared packages (built once) ------------------------------------
if (!fs.existsSync(path.join(MATERIAL, 'packages', 'shared', 'dist', 'index.js')) ||
    !fs.existsSync(path.join(MATERIAL, 'packages', 'calc', 'dist', 'index.js'))) {
  say('building Material shared packages');
  run('shared build', 'npx', ['-y', 'pnpm@9.12.0', '--filter', '@cm/shared', '--filter', '@cm/calc', 'build'], MATERIAL);
}

const materialEnv = {
  NODE_ENV: 'development',
  PORT: String(PORTS.materialApi),
  LOG_LEVEL: 'info',
  // Material's emails link into the one application (?open=mr:<id>).
  APP_URL: `http://localhost:${PORTS.gateway}/`,
  WEB_ORIGIN: `http://localhost:${PORTS.gateway}`,
  MONGO_URI: `mongodb://127.0.0.1:${PORTS.mongo}/chandramari_material?replicaSet=rs0&directConnection=true`,
  REDIS_URL: '',
  SEED_ALLOWED: 'true',
  BULL_BOARD_ENABLED: 'false',
  JWT_ACCESS_SECRET: secrets.JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET: secrets.JWT_REFRESH_SECRET,
  PAYMENT_INTERNAL_URL: `http://127.0.0.1:${PORTS.payment}`,
  PAYMENT_APP_BASE_URL: `http://127.0.0.1:${PORTS.payment}`,
  PAYMENT_APP_TOKEN: secrets.INTEGRATION_TOKEN,
  PUBLIC_BASE_PATH: '/material',
};

if (seedMaterial) {
  say('loading Material demo data (wipes the Material database)');
  run('material seed', 'npx', ['tsx', 'src/seed/run.ts'], path.join(MATERIAL, 'apps', 'api'), materialEnv);
}

// --- 3. Payment app --------------------------------------------------------------
say('applying Payment database migrations');
run('payment migrations', 'npx', ['wrangler', 'd1', 'migrations', 'apply', 'chandramari-one-task',
  '--local', '-c', 'wrangler.selfhost.jsonc'], PAYMENT, { CI: '1', WRANGLER_SEND_METRICS: 'false' });
say('starting the Payment app');
start('payment', 'npx', ['vite', '--port', String(PORTS.payment), '--strictPort'], PAYMENT,
  { WRANGLER_LOG_PATH: '.wrangler/wrangler.log' });

// --- 4. Material API and web -----------------------------------------------------
say('starting the Material API');
start('material-api', 'npx', ['tsx', 'watch', 'src/server.ts'], path.join(MATERIAL, 'apps', 'api'), materialEnv);

// --- 5. gateway --------------------------------------------------------------------
start('gateway', 'node', [path.join(ROOT, 'gateway', 'dev-gateway.mjs')], ROOT,
  { GATEWAY_PORT: String(PORTS.gateway), PAYMENT_PORT: String(PORTS.payment),
    MATERIAL_API_PORT: String(PORTS.materialApi) });

await waitFor(PORTS.payment, 'Payment app');
await waitFor(PORTS.materialApi, 'Material API');
await waitFor(PORTS.gateway, 'gateway', 30);

console.log(`
  ✔ Everything is up

    CMG application     http://localhost:${PORTS.gateway}/

  One sign-in. Payment and Material Management menus follow the role chosen
  in the header.
  Logs: .local/logs/   Stop: Ctrl+C
`);
