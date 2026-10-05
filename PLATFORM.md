# CMG Application — Payment Request + Material Management

One application: one sign-in, one set of users, one design. Payment Request and
Material Management are menus of the same app, not two sites.

| Part | Where | What it is |
|---|---|---|
| The application | the repository root | Every screen, payment and material, in the payment app's design. vinext (Next.js on Vite), D1 (SQLite), R2 |
| Material screens | `modules/material/` | The material screens, drawn with the app's own panels, tables, badges, modals and tabs (`app/material.css`) |
| Material rules | `material/apps/api`, `apps/worker`, `packages/*` | The Material API (Express + MongoDB), its background jobs and the shared rules, reached at `/material/api` |

## One login, roles from both sides

Everyone signs in on the one sign-in screen. **Users & access** is the only place
logins are made, and a login can hold roles from both families:

| Payment roles | Material Management roles |
|---|---|
| Requestor · Department Head · Accountant · Auditor · Finance · Management · Audit Head · **Administrator** | Site Engineer · Project Manager · QS · Procurement · Procurement Manager · Store · Management (Material) · Material Admin · Vendor |

- **Administrator** runs both sides: the full payment menu plus a *Material
  Management* section.
- **Someone with roles on both sides** (e.g. Accountant + Store) is one person with
  one password; the role selector in the header switches the menu.
- **Material-only people** (site staff, vendors) need not be on the organisation
  chart: tick *Not on the organisation chart*. A **Site Engineer** can be limited to
  chosen projects; a **Vendor** login belongs to one supplier and sees only its own
  enquiries and orders.
- Payment screens and data refuse accounts with no payment role, so a vendor never
  sees staff records. Material rules stay in the Material API.
- A person who already had a Material account is linked to it by email the first time
  they open Material, so their history stays theirs. `scripts/merge-users.mjs` reports
  how the two user lists line up (dry run by default).

## Run it locally

Needs Node 22. Install once:

```bash
npm ci
cd material && npx pnpm@9.12.0 install && cd ..
```

Start everything (MongoDB, the application, the Material API and the gateway):

```bash
node scripts/dev.mjs            # http://localhost:8000
```

On a brand-new database, create the first administrator once:

```bash
curl -X POST "http://localhost:8000/api/workforce/seed?adminEmail=you@example.com"
```

Demo data and a login for every role (wipes the material database):

```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=... node scripts/seed-demo.mjs
```

## Deploy (one VPS, Docker)

```bash
cp env/payment.env.example  env/payment.env    # INTEGRATION_TOKEN, mail …
cp env/material.env.example env/material.env   # JWT secrets, PAYMENT_APP_TOKEN = same token
# certificates: gateway/certs/fullchain.pem + privkey.pem
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

Sign-in needs **HTTPS** (the session cookie is `Secure`); the production overlay serves
443, redirects 80 and backs up both databases nightly into `./backups` (14 days).

## Pipeline

`.github/workflows/ci.yml`, on every push and pull request:

1. **application** — `npm ci`, build (payment and material screens), tests.
2. **material** — typecheck and tests of the Material API and shared rules, including
   the sign-on and role tests.
3. **images** — `docker compose build`, and `nginx -t` on both gateway configs.
4. **deploy** — on `main` once the repository variable `DEPLOY_ENABLED=true`: SSH to
   the VPS and run the compose command above. Secrets: `VPS_HOST`, `VPS_USER`,
   `VPS_SSH_KEY`, `VPS_APP_DIR`.

## Where things are

| | |
|---|---|
| The shell (sidebar, header, role selector) | `app/page.tsx` |
| Role families | `lib/roles.ts` (and `material/apps/api/src/lib/paymentSso.ts`) |
| Material screens and their router | `modules/material/` |
| Material design layer | `app/material.css` |
| Users & access | `app/AccessSetup.tsx`, `app/api/auth/users/route.ts` |
| Gateway | `gateway/dev-gateway.mjs` (local), `gateway/nginx*.conf` + `routes.conf` (server) |
| Containers | `docker-compose.yml`, `docker-compose.prod.yml`, `docker/payment.Dockerfile`, `material/docker/*` |
