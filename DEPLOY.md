# Deploying Chandramari One Task

The hosted build runs on Cloudflare Workers with a D1 database. `chandramari-one-task.html`
in `preview/` is the demo and is **not** what you host — it keeps its data in one browser.

## 1. Create the database

```bash
npx wrangler d1 create chandramari-one-task
```

Put the returned `database_id` in `wrangler.jsonc` under `d1_databases`, keeping the
binding name `DB`.

## 2. Apply the schema

```bash
npx wrangler d1 migrations apply chandramari-one-task --remote
```

Six migrations, `0000` to `0006`. The last one creates `wf_users` and `wf_sessions`.

## 3. Deploy

```bash
npm install
npm run build
npx wrangler deploy
```

## 4. Create the first administrator

Once, immediately after deploying:

```bash
curl -X POST "https://<your-worker>/api/workforce/seed?adminEmail=you@yourcompany.com"
```

The response contains a one-time password. **Save it, sign in, and change it straight
away** — the account is flagged so the first sign-in forces a new password.

This endpoint bootstraps only while `wf_users` is empty. Every later call requires an
administrator session, so it cannot be used to wipe a live register.

## 5. Check the door is locked

```bash
curl -i https://<your-worker>/api/workforce/employees
```

Expect `401`. If you get data back, stop and do not put real staff records in.

## Security notes

- Passwords are PBKDF2-SHA256, 120,000 iterations, with a per-account 16-byte salt.
  Clear text is never stored or logged.
- Sessions are rows in D1, not signed tokens. Signing out, changing a password or
  deactivating an account invalidates every live session for that user immediately.
- The cookie is `HttpOnly; Secure; SameSite=Lax`, so it is not readable from
  JavaScript and is not sent on cross-site requests. `Secure` means **you must serve
  over HTTPS** — sign-in will not work over plain HTTP.
- Sessions last 12 hours.
- Read endpoints need any signed-in account. Writes need Administrator, Audit Head,
  Management, Accountant, Auditor or Finance. User administration and re-seeding need
  Administrator or Audit Head.

## What now persists in the database

Every one of these is a D1 table with a guarded API, shared by all users:

| Area | Table | Endpoint |
| --- | --- | --- |
| Organisation charts, roles, layers | `wf_departments`, `wf_roles` | `/api/workforce/departments`, `/roles` |
| Employees, photos, JDs | `wf_employees`, `wf_photos` | `/api/workforce/employees`, `/photo` |
| Tasks, recurrence, import | `wf_tasks` | `/api/workforce/tasks`, `/tasks/import` |
| Tickets and queries | `wf_tokens`, `wf_queries` | `/api/workforce/tokens`, `/queries` |
| Observations, tags, replies | `wf_observations`, `wf_obs_tags`, `wf_obs_replies` | `/api/workforce/observations` |
| **Companies** | `wf_companies` | `/api/audit/companies` |
| **Audit tasks** (pre, post, special, meetings) | `wf_audit_tasks` | `/api/audit/tasks` |
| **Scheduled payment batches** | `wf_batches` | `/api/audit/batches` |
| **Community chat, including private messages** | `wf_messages` | `/api/audit/messages` |
| **Scorecard** | computed | `/api/audit/scorecard` |
| Logins, sessions | `wf_users`, `wf_sessions` | `/api/auth/session`, `/users` |

Rules the server enforces, not the browser:

- An audit task can only be accepted once — a second auditor gets a clear 409 rather
  than silently taking it.
- A scheduled batch must be accepted before approval, cannot be approved above the
  vendor request, needs a reason when approved for less, and cannot be released until
  an auditor has approved it and proof is attached.
- A private message is filtered out in SQL, so it never reaches the browser of anyone
  other than its author and recipient.
- Company deletion is refused where audit history exists; the record is deactivated.

## Still to do before this carries real data

- **Rate limiting on sign-in.** There is no lockout after repeated failures. Put
  Cloudflare rate limiting in front of `/api/auth/session`.
- **Expired sessions are not swept.** Rows stay until replaced. Add a Cron Trigger
  that deletes `wf_sessions` past `expires_at`.
- **No audit of sign-ins beyond `last_login_at`.** Failed attempts are not recorded.
- **Email is not wired.** Password resets return the temporary password to the
  administrator to pass on. Connect a mail service to send it directly.
- **The front end still needs pointing at these APIs.** The database and endpoints
  exist and are tested, but `ScheduledPayments.tsx`, `CommunityChat.tsx`,
  `CompanySetup.tsx`, `AuditTaskQueue.tsx` and the Scorecard still read browser state.
  Until they are rewired, hide them from the navigation or the same
  looks-saved-but-is-not problem remains.
- The training, points, ticket-SLA and management-queue features exist only in the
  HTML demo and have not been ported to this build.
