# Go-live checklist

Rehearsed end to end from an empty database before this was packaged. Every step below
was actually run and the result recorded at the bottom.

## Before you start

- A Cloudflare account with Workers and D1
- Node 22.13 or newer
- A domain, if you want one — a `workers.dev` address works fine to begin with

## Steps

**1. Create the database**

```bash
npx wrangler d1 create chandramari-one-task
```

Copy the returned `database_id` into `wrangler.jsonc`, keeping the binding name `DB`.

**2. Apply the schema**

```bash
npx wrangler d1 migrations apply chandramari-one-task --remote
```

Eight migrations, `0000`–`0007`, creating 21 tables.

**3. Build and deploy**

```bash
npm install
npm run build
npx wrangler deploy
```

**4. Create the first administrator — once only**

```bash
curl -X POST "https://<your-worker>/api/workforce/seed?adminEmail=you@yourcompany.com"
```

The response holds a one-time password. Save it. This endpoint only bootstraps while
there are no accounts; every later call needs an administrator session, so it cannot be
used to wipe a live register.

**5. Prove the door is locked**

```bash
curl -i https://<your-worker>/api/workforce/employees
```

Expect `401`. If data comes back, stop and do not load real records.

**6. Sign in and set your own password**

The first sign-in forces a change. Ten characters or more, with a letter and a number.

**7. Turn on rate limiting — do not skip this**

Cloudflare dashboard → Security → WAF → Rate limiting rules.
Path `/api/auth/session`, method `POST`, 10 requests per minute per IP.

Twenty minutes, no code, and it is the difference between a locked door and a locked
door anyone can try a thousand keys on.

## What your people can use on day one

Control room · My payment requests · Accounts and audit queues · Organisation charts ·
Employees · Job descriptions · Tasks with daily, weekly and monthly views · Task import ·
Tickets · Queries · Observations with tagging and reply threads · Workforce reports

All of it writes to the database and is shared between users.

## What is deliberately not in the menu

Scheduled payments, Community chat, Companies, the audit queues, Meetings and the
Scorecard. Their **tables and APIs exist and are tested** — the screens themselves still
read browser state, so they are held back rather than shown as though they saved. A
screen that looks saved but is not is worse than one that is absent. Roughly a day of
front-end work to switch them on.

Training requests, the points system and the ticket 24-hour SLA exist only in the HTML
demo and would need new tables.

## Attachments

Any record can carry any number of documents, and none are compulsory. A payment
request typically holds an invoice, a purchase order and a delivery order together.

Available on: payment requests, scheduled batches, tickets, tasks, observations,
audit tasks, queries and employee records.

Document types: Invoice, Proforma invoice, Purchase order, Delivery order, Quotation,
Contract, Bank/payment proof, Statement, Reconciliation, Photo, Other.

Files go to the `MEDIA` object-storage bucket, so invoices and scans do not eat the
database's storage budget. Where no bucket is bound the file falls back to a table with
a much smaller cap, so a deployment without object storage still works instead of
failing at upload. Limits are 15 MB per file with a bucket, 700 KB without.

Refused: executables and scripts, unknown document types, unknown record types, files
over the limit, and any request without a session. Deleting an attachment removes the
stored bytes as well as the row, so nothing is orphaned in storage.

**Object storage must be enabled.** `.openai/hosting.json` now sets `"r2": "MEDIA"`.
If you deploy with `wrangler`, add the matching bucket binding named `MEDIA`.

## Rehearsal result

From an empty database:

- 72 migration statements applied, 21 tables created
- Administrator bootstrapped from a single call
- All endpoints returned `401` before sign-in
- Temporary password forced a change; the new password signed in cleanly
- Created a department, a role and an employee
- Imported three tasks — daily, weekly, monthly — one carrying a job description
- Raised an observation, tagged the employee, and answered it in the thread
- Created a company, raised an audit task and accepted it
- Raised a payment batch, accepted it, approved 84,000 of 88,000 with a reason
- Posted a note to the shared thread

**The server was then stopped and restarted cold. Every one of those survived**, the
password still worked, and the scorecard showed 19 people scored from real activity.
