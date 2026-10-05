# Chandramari Material Management

> **Part of the CMG application.** Material Management's screens now live inside the
> payment application (`Payment_Request_CMG-main/modules/material`), drawn in its
> design, behind its one sign-in. This folder keeps the Material API, the worker and
> the shared rules. Run and deploy everything from the repository root — see
> `../README.md`. The standalone web app, Docker Compose files and `dev-local.sh`
> described below were retired in the merge.


Material requests, QS approval, consolidation, enquiries, purchase orders, store
and site receiving, a vendor portal and 13 report tabs.

Built from the single-file prototype (`chandramari-material.html`) on
Next.js + Express + MongoDB + Redis/BullMQ + Docker. The prototype is the source
of truth for every screen, label, validation message and calculation; this
repository changes the architecture, not the behaviour.

- **The plan and the decisions:** [`docs/00-PLAN.md`](docs/00-PLAN.md) — the folder
  tree, every collection, the page/endpoint map back to the prototype's
  functions, and the 23 ambiguities found in it with the choice made for each.

---

## Running it locally

You need Docker and Docker Compose. Nothing else — Node, Mongo and Redis all
live in containers.

```bash
cp .env.example .env
# Fill in two secrets, at minimum:
#   openssl rand -base64 48   -> JWT_ACCESS_SECRET
#   openssl rand -base64 48   -> JWT_REFRESH_SECRET

docker compose up -d --build
```

Then open **http://localhost:8080**.

On a brand-new database the sign-in page offers **"First time? Create the first
admin"**. Or load the demo data instead:

```bash
docker compose exec api sh -c "SEED_ALLOWED=true node --import tsx src/seed/run.ts"
```

Every demo login uses the password `demo123`:

| Login | Role |
|---|---|
| `site1`, `pm1` | Site / PM |
| `qs` | QS |
| `proc` | Procurement (buyer) |
| `pmgr` | Procurement Manager |
| `store` | Store |
| `mgmt` | Management (read-only) |
| `admin` | Admin |
| `vendora`, `vendorb`, `vendorc` | Vendor portal |

Seeding **deletes every document first** and is refused unless `SEED_ALLOWED=true`
and `NODE_ENV` is not `production`.

### Without Docker

Docker Desktop needs WSL 2 on Windows, which needs administrator rights and a
reboot. Where that is not available:

```bash
pnpm install
bash scripts/dev-local.sh --seed     # drop --seed to keep existing data
# Open http://localhost:8080
```

That script starts MongoDB as a single-node replica set (reusing the binary
`mongodb-memory-server` downloads for the tests), initiates `rs0` so
transactions work, then starts the API and the web app. Logs land in
`.local/logs/`.

**What you lose without Docker:** there is no Redis. With `REDIS_URL` empty the
API falls back to an in-process stand-in, which means rate limits and
idempotency keys are not shared between processes and **BullMQ is off** — so
emails collect in the outbox instead of being sent, and the inventory import
runs inside the request rather than as a background job. `env.ts` refuses to
start production that way. Everything else behaves identically.

---

## Layout

```
apps/web      Next.js 14 App Router — the whole UI
apps/api      Express — every business rule, every permission check
apps/worker   BullMQ — email, PDFs, imports, the RFQ due-time jobs
packages/shared  Zod schemas, enums, statuses, the exact user-facing messages
packages/calc    Pure calculations (lineCalc, stock, poCalc …), unit tested
docker        Dockerfiles, nginx.conf, the Mongo replica-set init script
```

The browser never writes data directly. Every state change is a named endpoint,
validated with Zod, permission-checked, and executed inside a MongoDB
transaction that also writes the audit-trail row and bumps the sync stamp.

---

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Every app in watch mode |
| `pnpm build` | Build all packages and apps |
| `pnpm typecheck` | TypeScript across the workspace |
| `pnpm test` | Unit and API tests |
| `pnpm seed` | Load the demo data (dev/staging only) |
| `docker compose logs -f api worker` | Follow the server logs |

---

## Email

Email is off until it is configured, and the Email settings page says so in
plain words rather than silently dropping messages.

1. Create a **Brevo** (300/day free) or **Resend** (3,000/month free) account and
   verify your sending domain.
2. In `.env`: `MAIL_PROVIDER=brevo`, `MAIL_API_KEY=…`,
   `MAIL_FROM="Chandramari <noreply@yourdomain.com>"`.
3. `docker compose up -d --build worker`

Then use **Admin → Email settings → Send test**. Plain SMTP works too — set
`MAIL_PROVIDER=smtp` and the `SMTP_*` variables.

Which events send a portal alert or an email is controlled per event under
**Admin → Notification settings**, and each person can switch their own email
alerts off in their profile.

---

## Deploying to the VPS

```bash
git clone <repo> /opt/chandramari-material && cd /opt/chandramari-material
cp .env.example .env    # real secrets, APP_URL=https://material.yourdomain.com

docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Put your TLS certificates in `docker/certs` and add the `443` server block to
`docker/nginx.conf` (or terminate TLS at Caddy/Traefik in front of Nginx).

**Nothing but Nginx publishes a port.** Mongo, Redis, the API, the worker and
Bull Board are on the internal Docker network only. To look at the queues:

```bash
ssh -L 4100:localhost:4100 you@server
docker compose exec worker sh -c 'echo ok'   # confirm it is up
# then open http://localhost:4100
```

### Backups

The production overlay runs a `mongodump` every 24 hours into `./backups`,
gzipped, keeping 14 days. Restore with:

```bash
docker compose exec -T mongo mongorestore \
  --uri "mongodb://mongo:27017/chandramari_material?replicaSet=rs0&directConnection=true" \
  --gzip --archive < backups/cm-2026-09-22-0300.archive.gz
```

Copy the archives off the box — a backup on the same disk is not a backup.

---

## Where things are

| You want to change… | Look in |
|---|---|
| A validation message | `packages/shared/src/messages.ts` — one place, used by the API and the UI |
| A calculation | `packages/calc/src/calc.ts` — pure, with the tests beside it |
| Who can do what | `apps/api/src/middleware/auth.ts` and the service that owns the action |
| A status rule | `packages/shared/src/statuses.ts` (the transition tables) |
| Colours, fonts, spacing | `apps/web/app/globals.css` and `apps/web/tailwind.config.ts` |
| Sidebar order and labels | `packages/shared/src/nav.ts` |

---

## Status

**Complete.** Every screen, rule, calculation and report in the prototype is
built and working.

| Area | What is there |
|---|---|
| Material requests | Mobile-first form with the item picker (master list, or a new item for QS to clear), register with status tabs and a project filter, detail with per-line progress, the paper MR form (15 ruled rows, struck-through rejections, three signature blocks), CSV export |
| QS | Queue sorted by required date, new-item clearing (approve to master / map / reject), the store-vs-PO split with a live "not approved" column and the availability check inside the transaction |
| Procurement | The pool grouped by item, site-wise analysis, enquiries with a due countdown, the comparison matrix with the L1 highlight, award by L1 or by lowest single vendor, and the three-step PO wizard (new / edit / revise) |
| Vendor portal | Enquiry list, accept / decline, the quotation sheet on screen or as a CSV to fill offline and upload back, My POs with acknowledgement, invoice and DO upload |
| Approvals | PO approvals for the Procurement Manager — never your own PO — with reject reasons and the revision history |
| Store and site | GRN against a PO (several projects in one GRN, rejected quantity stays open), issue notes, site acceptance with the shortfall returning to stock, the append-only stock ledger, inventory with reserved and available |
| Documents | Invoices and delivery orders, verify or reject with a reason, the value check against PO total and received value, files served behind signed expiring URLs |
| Reports | All thirteen tabs, with the KPI tiles and CSV export |
| Cross-cutting | Portal notifications and the email outbox, the audit trail on MR / PO / RFQ, live-refresh polling, optimistic locking, idempotency keys, print CSS, and a Puppeteer PDF of the PO attached to the vendor's approval email |

**125 tests pass**: 34 calculation, 15 shared-rule and 76 API tests — including
the whole §14 happy path from an MR through QS, enquiry, award, approval, GRN,
issue and site acceptance, plus the vendor-isolation proofs §13 asks for.

### Still to wire up

The **Payment app adapter** (§10) ships as the `ExternalMasters` interface, a
stub that returns empty arrays, and the 15-minute repeatable sync job. Give me
the Payment app's API base URL and auth (or read access to its database) and the
real adapter drops into `apps/api/src/integrations/paymentApp.ts`. We never
write back to it.
