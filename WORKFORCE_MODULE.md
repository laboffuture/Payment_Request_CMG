# Workforce module

Employee, role, task, token and query management, added to CMG Audit Control as a
second module alongside the existing payment/audit workflow. Nothing in the payment,
audit-queue, observation, reports, community or scheduled-payment screens changed.

## Screens

Nine sidebar items: Organisation, Employees, Tasks, Daily work, Weekly work,
Monthly work, Tokens, Queries, Workforce reports. Audit Head gets all of them
automatically because that access entry is derived from the nav array.

## Data model

Four levels, all editable:

- **Department** — its own org chart. Ships with Group Accounts and Audit.
- **Role** — a position within one department chart, with a parent role, a colour
  and a job description.
- **Employee** — occupies a role, has an own reporting line, a photo, and a personal
  JD that overrides the role's.
- **Task / Token / Query** — the work and the exceptions raised against it.

Roles and employees are separate, so a function can hold 500 people without touching
the structure. Nothing is hard-coded into the UI; every screen renders from the
database, so renaming or restructuring needs no code change.

## Architecture, and why it changed

The first version of this module kept the whole graph in browser state and wrote it
back as a full snapshot: `PUT /api/workforce` cleared five tables and re-inserted
everything on a debounce. That works for one user and fails badly for three hundred —
concurrent snapshots overwrite each other, and every keystroke rewrites the database.

It now works like this:

- **Per-row endpoints.** `POST` / `PATCH` / `DELETE` on `/api/workforce/{employees,
  roles,departments,tasks,tokens,queries}`. Each write touches one row and writes its
  audit entry in the same D1 `batch()`, which is the only transactional primitive D1
  offers.
- **Nothing unbounded is ever loaded.** Bootstrap returns departments, roles and a
  headcount only. Employees, tasks, tokens and queries are always paged and filtered
  in SQL. The server caps page size at 200 regardless of what the client asks for.
- **Search is escaped and capped.** `%`, `_` and `\` in a query are escaped and the
  term is truncated to 40 characters, so a user typing `%` cannot turn a search into
  a full table scan.
- **Aggregates run in SQL.** The dossier and dashboard use `SUM(CASE WHEN …)` rather
  than counting rows in the browser.
- **Photos live apart from the employee row.** Employee lists never carry image bytes.

## Measured behaviour

Loaded with **10,000 employees, 200,000 tasks, 20,000 queries, 20,000 observations,
50,000 tag rows and 30,000 replies** (80 MB), on the local dev server:

| Endpoint | Before | After |
| --- | --- | --- |
| Bootstrap | — | 21 ms |
| Employees page (any offset) | — | 17–21 ms |
| Employee search | — | 24 ms |
| Dossier (the one-click record) | — | 31–38 ms |
| Tasks, overdue filter | 235 ms | 35 ms |
| Dashboard summary | 1554 ms | 24 ms warm |
| Observations list | — | 35 ms |
| Observations tagged to one person | — | 21 ms |
| Employee record incl. observations | — | 32 ms |

Two fixes did the work. The overdue filter got a covering `(due_date, status)` index.
The dashboard was joining `wf_tasks` → `wf_employees` → `wf_departments` and grouping
200k rows; tasks already carry `dept_id`, so the join disappeared, and the result is
now stored in `wf_stats` and recomputed at most once a minute. Under 300 concurrent
dashboard loads the recompute fired **zero** times — the first stale request claims
the refresh by bumping the timestamp before doing the work, so a burst produces one
recompute rather than a stampede.

### Concurrency

Two runs against that dataset, on the local dev server:

- **300 users all acting at the same instant** (1,560 requests, no think time):
  100% success, zero errors, 81 req/s, p50 3.2 s. Everyone is served, but a simultaneous
  burst queues.
- **300 signed-in users acting every 2.5–5.5 seconds** for 24 seconds, mixed reads and
  writes (1,834 requests): 100% success, zero errors, 62 req/s sustained, **p50 99 ms**,
  p95 2.6 s.

The second is what 300 concurrent users actually looks like, and it holds comfortably. The
first is the worst case and still completes without a single failure.

These are dev-server numbers on a single Node process. Production Workers spread the
application tier across many isolates; D1 stays serial, so the database is the real ceiling.
The shape is what matters: no endpoint scales with headcount except the once-a-minute
recompute.

## Capacity

D1's documented limits are the real ceiling:

- **10 GB per database, not raisable.** At ~1 KB per task row, 200k tasks is under
  100 MB, so the task table is not the risk. Photos are, which is why they are capped
  at 80 KB server-side and resized to 256 px (~20 KB) in the browser first. 10,000
  photos is roughly 200 MB — fine, but it will be the largest table. Move photos to
  R2 before that changes.
- **Single-threaded, one query at a time.** Throughput is `1 / average query time`.
  At the measured 20–40 ms per page request, one D1 database supports roughly
  25–50 requests per second. 300 concurrent users browsing — not each firing a request
  every second — sits inside that. 300 users each hammering refresh does not.
- **~50 writes/second.** Task updates from 300 people will not approach this. Bulk
  recurring generation could, which is why `PUT /api/workforce/tasks` is capped at
  100 rows per call.

If the group outgrows this, the migration path is a database per department (D1 is
designed for many small databases, not one large one) or Postgres via Hyperdrive.

## Photos

Uploaded through the employee editor or the profile drawer. The browser resizes to
256 px JPEG before upload; the server rejects anything over 80 KB or outside
JPEG/PNG/WebP. Photo URLs carry the update timestamp (`?v=…`) and are served
`immutable`, so they cache for a year and a replacement busts the cache with no purge.

## The one-click record

Clicking a name anywhere opens a drawer with, in one request:

- Photo, designation, role, department, reporting line, direct reports
- Job description — the employee's own, or inherited from the role, labelled either way
- Task performance: total, completed, **on time**, **late**, **delayed**, open, plus
  on-time rate and completion rate, and a breakdown by frequency
- Query stats: raised, open, followed up, sorted out, total follow-ups, resolution rate
- Token stats and the token list
- Tabs for work (by frequency, with a timeliness column), queries, tokens and team

Timeliness is derived, never stored: completed on or before the due date is **on time**,
completed after it is **late**, still open past it is **delayed**.

## Queries

Raised against an employee, optionally linked to a task. Follow-ups and resolution are
server-side state transitions (`action: "follow-up" | "resolve" | "reopen"`) rather
than free-form field writes, so the follow-up count and resolution date cannot drift.

## Setup on a fresh deployment

1. Apply `drizzle/0002_pale_northstar.sql` and `drizzle/0003_milky_layla_miller.sql`
   to your D1 instance.
2. Open the Organisation screen. An empty database shows a **Load starter structure**
   button, which calls `POST /api/workforce/seed` and creates both charts, 20 roles,
   20 employees, sample tasks, tokens and queries. `?force=1` replaces existing data;
   without it a second call is refused.

`preview/workforce-preview.html` is a standalone file — open it in any browser, no
server — showing the org charts, the one-click record and the query register with
sample data.

## Observations with tagging and threads

Raise an observation, tag one or more employees, and everyone tagged sees it in their list
and can reply in a shared thread.

- `wf_obs_tags` is a join table rather than a JSON column, so "tagged to me" is an indexed
  lookup — it stays at 21 ms against 50,000 tag rows instead of scanning the table.
- The API refuses an observation with nobody tagged; there would be no one to answer it.
- Retagging replaces the set rather than adding to it, so stale names do not accumulate.
- A reply bumps `replyCount` and `lastReplyAt` on the parent in the same D1 batch, so the
  list shows activity without counting replies per row.
- Resolve and reopen are server-side transitions, so the resolution date cannot drift.
- The employee record gains an Observations tab plus tagged / open / overdue / closed counts,
  replies written, and a response rate.

## Bulk task import

`POST /api/workforce/tasks/import` takes up to 500 rows and validates every one against the
live employee register before writing anything.

- Employees resolve by ID, employee code or full name.
- Rejected rows come back with the line number and the reason; good rows still import, so a
  single typo does not fail the sheet.
- Rows are refused for: missing task name, missing or unknown employee, an inactive employee,
  an invalid frequency, priority or status, and a due date that is not `YYYY-MM-DD`.
- `wf_tasks` has 22 columns and D1 binds at most 100 parameters per statement, so multi-row
  inserts are chunked at four rows and the chunks go out as a single batch.
- The Import tasks screen reads pasted text or a CSV file, previews the first 25 rows, then
  sends in batches of 200.

Measured: 128 rows in one call imported 120 and rejected 8, each with its reason.

## Job description screen

`app/JobDescription.tsx`, reached from the JD button on the employee register and the
profile, or from the Job descriptions nav item. One screen per person:

- Who they are, their role, department and reporting line
- What the role holds them accountable for, marked when it is inherited rather than
  their own
- Their daily, weekly, monthly and one-off work, each in its own table with start
  date, end date, priority, status, timeliness, progress and expected output
- Totals and on-time rate, an Export button, and a link straight into the importer

It runs off the single `/api/workforce/dossier` call, so opening it costs one request.

## Import: end dates, job descriptions and an editable preview

The importer now takes twelve columns. `start date` is the anchor for recurrence, and
the new `end date` closes the series (blank runs open ended). A `job description`
column writes the person's own JD in the same pass, so one sheet can set both the work
and what the work is for.

The preview grid is editable. Every cell can be corrected in the browser and rows
removed before anything is written, rather than going back to the spreadsheet.

Validation covers: end date before start date, malformed dates, unknown or inactive
employees, and invalid frequency, priority or status. Bad rows are listed with their
line number; good rows still import.

## Authentication

Added in `lib/credentials.ts` (pure crypto, unit tested) and `lib/auth.ts` (sessions).

- PBKDF2-SHA256, 120,000 iterations, per-account 16-byte salt. Verified with a
  constant-time comparison so the response time cannot leak the hash.
- Sessions are rows in `wf_sessions` rather than signed tokens, so a sign-out, a
  password change or a deactivation invalidates them on the next request.
- Cookie is `HttpOnly; Secure; SameSite=Lax`, 12-hour life.
- `requireAuth(req, level)` guards every route: `read` needs any account, `write`
  needs a role permitted to change data, `admin` needs Administrator or Audit Head.
- Sign-in returns the same message for an unknown address and a wrong password, so it
  cannot be used to enumerate accounts.
- A login can only be created for somebody already on an organisation chart, and each
  person gets at most one.

Verified against a live D1 instance: all thirteen workforce endpoints return 401 to an
anonymous caller; a Requestor gets 200 on reads and 403 on create, delete, user
administration and re-seed; deactivating an account kills its live session immediately;
changing a password invalidates every other session.

See `DEPLOY.md` for the hosting steps and what still needs doing.

## Known limits

- **Authorisation is not enforced server-side.** The API trusts its caller. Anyone who
  can reach `/api/workforce/*` can read or write any employee's record. Before this
  holds real staff data it needs identity checks in the route handlers; the existing
  login is demo-grade and stores users in `localStorage`.
- Recurring catch-up occurrences are generated on demand from the Daily/Weekly/Monthly
  screens rather than automatically, so a burst of page loads cannot trigger a write
  storm. A scheduled Worker (Cron Trigger) is the right home for this.
- Report export pages through the server but stops at 5,000 rows.
- The role rollup on the dashboard is served separately (`/summary?detail=roles`)
  because it still needs a join; it is not on the default dashboard path.
- The Netlify note still applies: a static publish serves the frontend, but every
  `/api/*` route needs Cloudflare-compatible hosting or a rewrite to Netlify Functions
  plus an external database.
