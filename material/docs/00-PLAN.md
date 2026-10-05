# Chandramari Material Management — Build Plan (pre-code deliverable)

Answers §15 (a)–(d) of `chandramari-material-build-prompt-v2.md`.

- Source of truth for **behaviour, wording, UI**: `chandramari-material (8).html` (prototype, ~1400 lines).
- Source of truth for **stack, architecture, security**: the v2 build prompt.

---

## (a) Folder tree

```
chandramari-material/                    <- repo root (D:\Material Management)
├─ apps/
│  ├─ web/                               Next.js 14 App Router
│  │  ├─ app/
│  │  │  ├─ (auth)/login/page.tsx
│  │  │  ├─ (auth)/first-setup/page.tsx
│  │  │  ├─ (app)/layout.tsx             TopBar + Sidebar + mobile bottom bar
│  │  │  ├─ (app)/page.tsx               Home dashboard
│  │  │  ├─ (app)/mrs/…                  list | new | [id] | [id]/edit | print
│  │  │  ├─ (app)/qs/page.tsx
│  │  │  ├─ (app)/pool/page.tsx
│  │  │  ├─ (app)/rfqs/…                 list | [id] | [id]/print
│  │  │  ├─ (app)/pos/…                  list | new | [id] | [id]/edit | [id]/revise | approvals
│  │  │  ├─ (app)/docs/page.tsx
│  │  │  ├─ (app)/grn/page.tsx
│  │  │  ├─ (app)/issue/page.tsx
│  │  │  ├─ (app)/issues/page.tsx
│  │  │  ├─ (app)/receive/page.tsx
│  │  │  ├─ (app)/inventory/page.tsx
│  │  │  ├─ (app)/reports/page.tsx
│  │  │  ├─ (app)/notifications/page.tsx
│  │  │  ├─ (app)/vendor/…               index | rfqs/[id] | pos | docs
│  │  │  └─ (app)/admin/…                users vendors projects company categories
│  │  │                                  items import notification-rules email
│  │  ├─ components/                     TopBar Sidebar Card Tile Chip Tag Btn DataTable
│  │  │                                  Tabs Modal StickyActionBar Stepper EmptyState
│  │  │                                  Toast ProgressBar DueCountdown Trail
│  │  ├─ features/                       mr qs pool rfq vendor po grn issue inventory
│  │  │                                  reports admin notifications
│  │  ├─ lib/                            api.ts (fetch + retry + refresh), format.ts,
│  │  │                                  session.ts, query.ts, csv.ts, deep-link.ts
│  │  └─ styles/globals.css              design tokens ported from the prototype :root
│  ├─ api/                               Express + TypeScript (Node 20)
│  │  └─ src/
│  │     ├─ app.ts server.ts env.ts db.ts redis.ts logger.ts
│  │     ├─ models/                      base masters mr rfq po stock system
│  │     ├─ routes/                      one router per domain
│  │     ├─ controllers/                 thin: parse -> service -> serialize
│  │     ├─ services/                    ALL business rules, inside transactions
│  │     ├─ serializers/                 role-aware field stripping (vendor safety)
│  │     ├─ middleware/                  auth authorize rateLimit idempotency error
│  │     ├─ jobs/                        BullMQ producers
│  │     ├─ lib/                         counters audit notify sync-stamp csv files
│  │     └─ seed/                        seed.ts (the prototype's seed(), dev/staging only)
│  └─ worker/                            BullMQ consumers
│     └─ src/                            email notify pdf import rfq-due reports
│                                        + Bull Board (admin only, behind auth)
├─ packages/
│  ├─ shared/src/                        enums statuses roles events messages zod/ types
│  └─ calc/src/                          lineCalc stock poCalc poRecValue poRecPct
│                                        poolRows issueRows lineStage reportLines
│                                        money (num, r2) + __tests__/
├─ docker/                               api.Dockerfile web.Dockerfile worker.Dockerfile
│                                        nginx.conf mongo-rs-init.js
├─ docs/                                 00-PLAN.md (this file)
├─ docker-compose.yml  docker-compose.prod.yml
├─ .env.example  .gitignore  README.md
├─ package.json  pnpm-workspace.yaml  turbo.json  tsconfig.base.json
```

---

## (b) Mongoose collections

Every schema: `timestamps: true`, `optimisticConcurrency: true`, version key **`rv`**.
Indexes on every foreign key, every `status`, and `no` (unique).
Money rounded with `r2` on write, quantities with `num` (3 dp) — both from `packages/calc`.

### Masters

| Collection | Fields |
|---|---|
| `users` | `login` (unique, lowercase, `^[a-z0-9._@-]{2,}$`), `name`, `email`, `phone`, `role` (8 roles), `vendorId`, `projectIds[]`, `paymentUserId`, `active`, `emailOn`, `passwordHash`, `failedLogins`, `lockedUntil` |
| `refreshTokens` | `userId`, `tokenHash`, `expiresAt` (TTL index), `userAgent`, `ip` |
| `vendors` | `name` (unique, case-insensitive collation), `email`, `phone`, `taxNo`, `address`, `source` (`LOCAL`\|`PAYMENT_APP`), `externalId` |
| `projects` | `code` (unique), `name`, `source`, `externalId`, `active` |
| `companies` | `name`, `legalName`, `address`, `taxLabel` (def. `TRN`), `taxNo`, `phone`, `email`, `currency` (def. `AED`), `taxMode`, `defaultTax` (def. 5), `poTerms`, `logo{publicId,url}`, `isDefault` |
| `categories` | `name`, `parentId` (null = main), `active` — unique (`name`,`parentId`) |
| `items` | `code` (`ITM-00001`, unique), `name`, `unit`, `category`, `subCategory`, `spec`, `active`, `lastRate`, `lastVendorId`, `createdBy` |

### Material requests

| Collection | Fields |
|---|---|
| `mrs` | `no`, `projectId`, `requiredDate`, `remarks`, `status` (`DRAFT`\|`QS_PENDING`\|`SENT_BACK`\|`REJECTED`\|`APPROVED`\|`CLOSED`), `createdBy`, `submittedAt`, `lastComment`, `qsBy`, `qsAt`, `closedAt` |
| `mrLines` | `mrId`, `sn`, `itemId`, `newItemName`, `newUnit`, `newCategory`, `newSpec`, `newStatus` (`NONE`\|`PENDING`\|`APPROVED`\|`MAPPED`\|`REJECTED`), `qty`, `boqRef` (≤30), `remarks` (≤250), `storeQty`, `poQty`, `qsRemark`, `lineStatus` (`ACTIVE`\|`REJECTED`) — index (`mrId`,`sn`) |

### Enquiries

| Collection | Fields |
|---|---|
| `rfqs` | `no`, `status` (`OPEN`\|`AWARDED`\|`CLOSED`), `dueAt`, `note`, `createdBy` |
| `rfqLines` | `rfqId`, `itemId`, `qty`, `allocs[]` `{mrLineId, projectId, qty}` |
| `rfqVendors` | `rfqId`, `vendorId`, `status` (`INVITED`\|`ACCEPTED`\|`DECLINED`\|`QUOTED`), `leadDays`, `validity`, `terms`, `vatPct`, `submittedAt` — unique (`rfqId`,`vendorId`) |
| `quotes` | `rfqId`, `rfqLineId`, `vendorId`, `rate`, `remark` — unique (`rfqLineId`,`vendorId`) |

### Purchase orders

| Collection | Fields |
|---|---|
| `pos` | `no`, `rev`, `status` (`DRAFT`\|`PENDING_APPROVAL`\|`APPROVED`\|`PARTIAL`\|`RECEIVED`\|`REJECTED`\|`CANCELLED`), `vendorId`, `companyId`, `deliverTo` (`STORE`\|`SITE`), `deliveryDate`, `terms`, `notes`, `taxMode`, `reason`, `rfqId`, `subtotal`, `taxTotal`, `total`, `createdBy`, `approvedBy`, `approvedAt`, `lastComment`, `vendorAckAt` |
| `poLines` | `poId`, `itemId`, `qty`, `rate`, `gstPct` |
| `poAllocs` | `poId`, `poLineId`, `mrLineId`, `projectId`, `qty` |
| `poRevisions` | `poId`, `rev`, `reason`, `by`, `at`, `totalBefore`, `snapshot` |
| `vendorDocs` | `poId`, `vendorId`, `docType` (`INVOICE`\|`DO`), `docNo`, `docDate`, `amount`, `file{publicId,url,name,mime,size}`, `status` (`SUBMITTED`\|`VERIFIED`\|`REJECTED`), `remark`, `uploadedBy`, `uploadedAt`, `checkedBy` |

### Receiving, issuing, stock

| Collection | Fields |
|---|---|
| `grns` | `no`, `poId`, `location` (`STORE`\|`SITE`), `dnNo`, `invNo`, `remark`, `createdBy` |
| `grnLines` | `grnId`, `poAllocId`, `qtyReceived`, `qtyRejected` |
| `issues` | `no` (`MIN-…`), `mrId`, `projectId`, `status` (`ISSUED`\|`ACCEPTED`), `vehicle`, `createdBy`, `acceptedBy`, `acceptedAt`, `remark` |
| `issueLines` | `issueId`, `mrLineId`, `itemId`, `qtyIssued`, `qtyAccepted` |
| `stockLedger` | `at`, `itemId`, `docType` (`OPENING`\|`GRN`\|`SITE_GRN`\|`ISSUE`\|`RETURN`), `docNo`, `refNo`, `projectId`, `mrLineId`, `qtyIn`, `qtyOut`, `note` — **append-only**, index (`itemId`,`at`) |

### System

| Collection | Fields |
|---|---|
| `auditLogs` | `docType` (`MR`\|`PO`\|`RFQ`), `docId`, `action`, `userId`, `at`, `note` — append-only |
| `counters` | `_id` (sequence key), `n` |
| `notifications` | `event`, `title`, `body`, `link`, `userId`, `role`, `vendorId`, `readBy[]`, `createdAt` |
| `emailOutbox` | `event`, `toUserId`, `toRole`, `toVendorId`, `subject`, `body`, `status`, `tries`, `sentAt`, `sentTo[]`, `error` |
| `notifyRules` | `_id` = event code, `portal`, `email`, `vendorEmail` |
| `syncStamp` | single doc `{_id:"global", upd}` |

Idempotency keys live in **Redis** (24 h), not in Mongo.

---

## (c) Pages and endpoints → the prototype function they come from

| Route / endpoint | From the HTML |
|---|---|
| `/login`, `POST /auth/login` | `loginView()`, `doLogin()` |
| `/first-setup`, `POST /auth/first-setup` | `A.firstSetup`, `A.doFirstSetup` |
| `/`, `GET /me/counts` | `VIEWS.home`, `counts()` |
| `/mrs`, `GET /mrs` | `VIEWS.mrs`, `mrTable()` |
| `/mrs/new`, `/mrs/[id]/edit`, `POST /mrs`, `PUT /mrs/:id` | `VIEWS.mrnew`, `mrForm()`, `lineCard()`, `pickerHtml()`, `itemList()`, `A.saveMR` |
| `DELETE /mrs/:id` | `A.delMR` |
| `POST /mrs/:id/submit` | `A.saveMR` (submit branch) |
| `/mrs/[id]`, `GET /mrs/:id` | `VIEWS.mrview`, `linesTable()`, `mrDocs()`, `trail()` |
| `/mrs/print?ids=`, `GET /mrs/print` | `VIEWS.mrprint`, `mrDoc()` |
| `GET /mrs/export.csv` | `A.mrCsv` |
| `/qs`, `GET /mrs?queue=qs` | `VIEWS.approvals` |
| `POST /mrs/:id/qs-approve` | `A.qsApprove`, `qsForm()` |
| `POST /mrs/:id/send-back`, `/reject` | `A.sendBack`, `A.rejectMR` |
| `POST /mr-lines/:id/approve-new\|map\|reject` | `A.approveNew`, `A.mapNew`, `A.rejectNew`, `newItemPanel()` |
| `/pool`, `GET /pool` | `VIEWS.pool`, `poolRows()`, `poolSel()` |
| `GET /pool/analysis` | `analysisHtml()` |
| `POST /rfqs` | `A.rfqModal`, `rvListHtml()`, `A.createRFQ` |
| `/rfqs`, `GET /rfqs` | `VIEWS.rfqs` |
| `/rfqs/[id]`, `GET /rfqs/:id` | `VIEWS.rfqview`, `quoteOf()`, L1 highlight + award panel |
| `POST /rfqs/:id/extend\|cancel\|award` | `A.doExtend`, `A.closeRFQ`, `A.awardRFQ`, `A.awardL1`, `A.awardOne`, `A.awardL1Raise` |
| `GET /rfqs/:id/pdf?kind=rfq\|cmp` | `rfqDoc()`, `cmpDoc()`, `docHead()` |
| `/vendor`, `GET /vendor/rfqs` | `VIEWS.vhome` |
| `/vendor/rfqs/[id]`, `GET /vendor/rfqs/:id` | `VIEWS.vrfq` (2nd definition — quotation-sheet layout) |
| `POST /vendor/rfqs/:id/accept\|decline\|quote` | `A.vAccept`, `A.vDecline`, `A.vQuote` |
| `GET /vendor/rfqs/:id/sheet.csv` + upload | `A.vSheetCsv`, `vSheetFill()`, `vqTotals()` |
| `/vendor/pos`, `GET /vendor/pos` | `VIEWS.vpos` (2nd definition) |
| `POST /vendor/pos/:id/ack` | `A.poAck` |
| `/vendor/docs`, `POST /vendor/docs` | `VIEWS.vdocs`, `docForm()`, `A.uploadDoc` (2nd definition) |
| `/pos`, `GET /pos` | `VIEWS.pos`, `poTable()` |
| `/pos/new`, `/pos/[id]/edit`, `/pos/[id]/revise` | `VIEWS.poform`, `poStep1/2/3`, `A.poStep`, `poToForm()`, `poAvail()` |
| `POST /pos`, `PUT /pos/:id` | `savePOCore()`, `A.savePO` |
| `POST /pos/:id/submit\|approve\|reject\|revise\|cancel` | `A.poApprove`, `A.poReject`, `A.poCancel`, `A.poRevise` |
| `/pos/approvals` | `VIEWS.poapprove` |
| `/pos/[id]`, `GET /pos/:id`, `GET /pos/:id/pdf` | `VIEWS.poview`, `poDoc()`, `poCalc()`, `poRecValue()`, `poRecPct()` |
| `/docs`, `GET /docs` | `VIEWS.docs`, `docTable()` |
| `POST /docs/:id/verify\|reject`, `GET /docs/:id/file` | `A.docOk`, `A.doDocNo`, `A.viewFile` |
| `/grn`, `GET /grn/open-pos?location=`, `POST /grns` | `VIEWS.grn`, `grnSection()`, `A.findPO`, `A.postGRN`, `grnTable()` |
| `/issue`, `GET /issues/pending`, `POST /issues` | `VIEWS.issue`, `issueRows()`, `A.createIssue` |
| `/issues`, `/issues/[id]`, `GET /issues` | `VIEWS.issues`, `issueTable()`, `A.showIssue` |
| `/receive`, `POST /issues/:id/accept` | `VIEWS.receive`, `A.acceptIssue`, `grnSection('SITE')` |
| `/inventory`, `GET /inventory`, `GET /items/:id/ledger` | `VIEWS.inventory`, `stock()`, `A.ledger` |
| `/reports`, `GET /reports/:tab`, `GET /reports/:tab.csv` | `VIEWS.reports`, `REPORTS`, `reportData()`, `reportLines()`, `lineStage()`, `A.csv` |
| `/notifications`, `GET /notifications`, `POST /notifications/:id/read`, `/read-all` | `VIEWS.notifs`, `myNotifs()`, `isRead()`, `A.openNotif`, `A.readAll` |
| `/admin/users` + users CRUD | `VIEWS.users`, `userModalHtml()`, `A.saveUser` |
| `POST /admin/users/import-payment` | `A.importUsers`, `A.doImportUsers` |
| `/admin/vendors` | `VIEWS.vendors`, `vendorModalHtml()`, `A.saveVendor` |
| `/admin/projects` | `VIEWS.projects`, `A.addProject` |
| `/admin/company` (+ logo) | `VIEWS.company`, `A.saveCompany`, `A.newCompany`, `A.rmLogo` |
| `/admin/categories` | `VIEWS.cats`, `A.addCat`, `A.toggleCat` |
| `/admin/items` | `VIEWS.items`, `A.addMaster` |
| `/admin/import`, `POST /import/preview\|run` | `VIEWS.import`, `impPreview()`, `A.impRun`, `A.tplCsv`, `csvParse()` |
| `/admin/notification-rules` | `VIEWS.notifyrules`, `EVENTS`, `rule()` |
| `/admin/email` + mail endpoints | `VIEWS.outbox` (2nd definition), `A.mailTest`, `A.mailSendNow`, `A.mailRetry`, `A.showMail` |
| `GET /sync/stamp` | `sync()`, `applyChanges()` |
| Deep links `?open=mr:<id>` … | `openLink()`, `appLink()` |

---

## (d) Ambiguities and prototype bugs — with the decision taken

1. **`SUBMITTED` vs `QS_PENDING`.** The HTML tests `['QS_PENDING','SUBMITTED']` everywhere but only ever writes `QS_PENDING`. → One canonical status, `QS_PENDING`; `SUBMITTED` is not in the enum. The chip label stays "With QS".

2. **`lastRate` / `lastVendorId` are written on PO *submit*** (`savePOCore`), but prompt §6 says *on approval*. On submit, an unapproved — or later rejected — PO rewrites the item master and every "estimated value" in the pool and site-wise analysis. → **Set on approval**, per §6. Flagged because it is a deliberate departure from the prototype.

3. **`refreshPO()` on a PO with no allocations**: `[].every()` is `true`, so it would jump straight to `RECEIVED`. → Guard on `allocs.length > 0`.

4. **`A.poCancel` has no server-side guard** — the button is merely hidden once a GRN exists. → The service returns 409 *"Goods have already been received against this PO — it cannot be cancelled."*

5. **`A.approveNew` never checks for a duplicate item name**, although §6 requires *"Already in item master as …"* (only `A.addNew` and `A.addMaster` check). → Check added in the service, same message.

6. **`nextItemCode()` scans `max(code)`** instead of using a counter — racy under concurrency. → `counters._id = "ITM"`, seeded from the current maximum at migration time.

7. **Site project scope is missing in two places.** `counts().receive` counts *all* `ISSUED` notes, and `grnSection('SITE')` lists *all* site POs, so a site user of project A sees project B's. (`VIEWS.receive` does filter the issue list.) → Project scope enforced at the query level for both.

8. **Deep link `iss:<id>` breaks for SITE users**: it maps to view `issues`, which is neither in the SITE nav nor in `DETAIL`, so `render()` bounces to Home. → `/issues/[id]` becomes a real route, readable by STORE and by SITE for its own projects.

9. **`notify()` skips the actor only for direct `user_id` recipients**, not for role fan-out — a buyer notifying role `PROC` notifies themselves. §9 says "skips the actor". → Actor skipped in role fan-out too.

10. **No permission check on MR / PO / RFQ detail.** Any authenticated user can open any id — including a vendor opening another vendor's PO. → Ownership, project scope and vendor scope enforced in the service and the serializer, with tests proving it.

11. **`poRevisions` shape.** §5 wants `totalBefore`; the HTML stores a `snapshot` JSON and the UI reads `snapshot.po.total`. → Store **both**: `totalBefore` (printed in the revision history) and `snapshot` (audit).

12. **`pos.basis`** is written by `savePOCore` but is fully derivable from `rfqId`. → Dropped; the `COMPARED` / `DIRECT` tag is derived.

13. **Four things are defined twice in the prototype** — `VIEWS.vpos`, `VIEWS.outbox`, `A.uploadDoc` and `NAV.VENDOR` — and the *later* definition is the one that runs. → The later version is what gets built: vendor nav includes "Invoices & DOs", the upload modal picks the PO from a dropdown, and the email page has provider status / test / send-now / retry.

14. **Password rules differ by mode** (demo ≥ 6, live ≥ 8 with a letter and a digit, profile dialog says "min 6"). → One rule everywhere: **≥ 8 characters with a letter and a digit**.

15. **Draft POs hold quantity out of the pool** (`livePO` = anything not REJECTED/CANCELLED). Deliberate — it stops the same MR line being bought twice — so it is kept, and the pool's empty-state wording is unchanged.

16. **Cancelling an RFQ does not notify the invited vendors**; the quantities simply return to the pool. Not required by §9. → Behaviour kept; vendors see the status flip to "Closed" on the portal. Say the word and I will add the email.

17. **`stock().reserved` is global, but QS validates `store ≤ available` only within the MR being approved.** Two QS users approving different MRs at the same moment could over-commit stock. → The availability check runs **inside the transaction** at approval time, so the second one fails with the existing message *"&lt;item&gt;: only x available in store"*.

18. **Awarded POs inherit `deliverTo = STORE`, the default company and its tax mode**, not anything from the RFQ. That is right for a multi-project award; kept, and the buyer still edits before submitting.

19. **Rejected GRN quantity is recorded but changes nothing** — it stays open on the PO. That is the intended rule; `qtyRejected` is stored for the report and the GRN print only.

20. **`VIEWS.poview` shows a vendor the whole `poDoc`**, including rates — those are the vendor's own rates, so it is safe; value check, project/MR split, GRNs, revision history and the trail are hidden. → Enforced in the **serializer**, not the UI.

21. **The comparative statement is reachable from the vendor page** via `A.rfqPrint`. → A vendor may print the RFQ and their own quotation sheet, **never** the comparative statement (it carries other vendors' rates).

22. **`mrs.no` is empty until the first submit** (drafts display "Draft"). Kept — the per-project counter is only consumed on submit, which keeps numbering gap-free.

23. **The demo password `demo123` is shorter than the ≥ 8 rule** §13 requires (§9 names it explicitly). → Both stand: the length rule lives in the request schema and applies to passwords people type, while the seed writes hashes directly. The demo logins work exactly as documented, the real rule is not weakened, and seeding is refused in production anyway.

24. **Mongoose bugs found while wiring Phase 1 up**, each fixed and covered by a test: creating several documents inside a session needs `ordered: true`; a counter floor must be raised with `$max` rather than an upsert guarded by `$lt` (which tries to insert a duplicate once the counter is already high enough); and the global `sanitizeFilter` flag escapes operators in *our own* filters, so it is off — request input is sanitised at the edge by `express-mongo-sanitize` instead.

**Open question (does not block Phase 1):** the Payment-app adapter (§10) ships as the `ExternalMasters` interface, a stub returning empty arrays, and a 15-minute repeatable sync job. I need the Payment app's API base URL and auth (or read access to its database) before wiring the real adapter.

---

## (e) The two-step approval, measurements and the BOQ — change of 22 Sep 2026

Asked for after the first build: the site engineer enters a quantity, a
measurement and a unit per line; the request goes to the **Project Manager**,
who may approve, reject or change all three; it then goes to **QS**, who may do
the same; everything either of them does is visible to the site engineer, and a
QS rejection reaches the Project Manager as well. The site engineer may also
attach an optional **bill of quantities**, which the PM and QS then see.

25. **`PM` is a role, not a flag on a site user.** The seed's `pm1` was a second
    *site* engineer; it is now the Project Manager, and a new `site2` takes over
    PRJ-0105 so no project loses its engineer. The PM's sidebar is Home · MR
    approvals · All MRs · Inventory · Reports · Notifications, with the
    `pmQueue` badge.

26. **The chain is `DRAFT → PM_PENDING → QS_PENDING → APPROVED`.** A submit no
    longer reaches QS directly, and a sent-back MR returns to the PM, not to QS
    — the PM asked for the change, so the PM checks that it was made. `PM_PENDING`
    is a real status with its own tab ("With PM"), chip and queue.

27. **Both approvers edit the same three fields**, through one shared
    `reviewedLine` schema and one `applyReviewedLines()` helper, so the PM panel
    and the QS panel cannot drift apart. QS's store/PO split is validated against
    *the quantity QS is approving*, not the one that arrived.

28. **What the site engineer asked for is frozen on the first submit**
    (`requestedQty`, `requestedMeasurement`, `requestedUnit`). Every later edit is
    therefore visibly a change: the API returns `changed`, and the UI shows
    "18 — asked 30" next to a CHANGED tag, on screen, in the printed MR form and
    in the CSV export.

29. **A dropped line is rejected, not deleted.** Its allocations and history
    stay attached; dropping *every* line is refused with *"Nothing approved — use
    Reject instead"*, because that is a rejection wearing an approval's clothes.

30. **Who said what is recorded, not just what was said.** `lastCommentBy` and
    `lastCommentRole` sit alongside `lastComment`, so the banner reads
    "Rejected by QS (QS User)" rather than an unattributed sentence.

31. **Notification fan-out follows the chain.** Submit → PM. PM approval → QS
    *and* the requester (they need to know what changed). QS approval, send-back
    or rejection → the requester *and* the PM who passed it on. A PM rejection
    stops at the requester, since QS never saw it.

32. **The measurement is free text, the unit is from `UNITS`.** A measurement is
    "2400 × 1200 × 12.5 mm", "M20", "6 m lengths" — a dimension, not a number, so
    validating its shape would only get in the way. The unit stays a closed list
    because stock and POs are counted in it. A line's own unit overrides the item
    master's, since steel may be ordered by the length and stocked by weight.

33. **The BOQ is optional and belongs to the MR, not the line.** It is attached
    while the MR is still the site engineer's to edit (draft or sent back) and
    read-only afterwards, so what the PM and QS approved against cannot be
    swapped underneath them. PDF, image or spreadsheet, ≤ 5 MB, magic-byte
    checked — a CSV carries no signature, so it is accepted only when the bytes
    really are text. It is served through a short-lived signed URL like every
    other document, to whoever may read the MR.

34. **Submitting with a BOQ saves first, attaches, then submits.** A file needs
    an MR to belong to, and the MR stops being editable the moment it reaches the
    PM — so the form does draft → upload → submit rather than asking the engineer
    to save twice.

35. **Development without Cloudinary keeps files on disk** (`lib/localFiles.ts`,
    under the git-ignored `.local/uploads`), the same bargain already struck for
    Redis: without it a developer could not try the feature at all. The public id
    is validated so a crafted one cannot read elsewhere on the disk, the link
    carries a 5-minute signature, and `env.ts` still refuses to start production
    without Cloudinary.

---

## (f) The purchase-order approval chain — change of 22 Sep 2026

Asked for next: after QS approves the MR, procurement raises the PO and submits
it; the **Procurement Manager** approves or rejects; on approval it goes **back
to QS to validate** — QS sees everything QS specified and presses **Validate**,
which asks one question, *is everything you mentioned there?* A **yes**
validates it; a **no** takes a remark saying what is missing. Once validated it
goes to **management and admin**: the admin only watches the process, management
approves or rejects. Whatever they decide, the status is visible everywhere,
from site to the Procurement Manager.

36. **Three gates, not one: `PENDING_APPROVAL → QS_VALIDATION → MGMT_APPROVAL
    → APPROVED`.** Each is a real status with its own chip ("With Procurement
    Manager", "With QS for validation", "With management"), its own queue and
    its own badge, so nobody has to guess where a PO is sitting.

37. **Nothing is committed until the last gate.** The item master learns the
    rate (plan decision (d)(2)) and the vendor is told *only* on management's
    approval. A PO that dies at gate one or two leaves no mark on the master and
    the vendor never knew it existed — verified by a test that asks for the PO
    as the vendor at every stage and expects 403 until the end.

38. **QS validates against QS's own numbers.** The allocation rows now carry the
    item, the unit and `qsApprovedQty` — the for-PO quantity QS set on that MR
    line — beside what the PO actually orders, tagged MATCHES / SHORT BY n /
    OVER BY n. The question QS is asked is one the screen has already answered.

39. **A "no" must say what is missing.** The Zod schema refuses `ok: false` with
    an empty remark, because procurement is the one who has to put it right. The
    PO goes to REJECTED with the remark as its last comment, which is exactly the
    state procurement can already edit and resubmit from — no new status needed.

40. **Every step is attributed.** `procMgrBy/At`, `qsBy/At/qsRemark` and
    `approvedBy/At` sit on the PO alongside `lastCommentBy`/`lastCommentRole`,
    so the chain strip at the top of the PO page names who did what and when,
    and a rejection reads "Rejected by QS (QS User): …" to everyone.

41. **Fan-out follows the chain, backwards as well as forwards.** A failed
    validation reaches procurement *and* the Procurement Manager who passed it
    on; management's rejection reaches procurement, the Procurement Manager, QS
    and the requesters. Nobody who touched a PO learns second-hand that it died.

42. **"Approved by" on the printed PO means management.** `approvedBy` was
    already the field the paper PO signs off with, so it now holds the final
    approver rather than the Procurement Manager — the other two steps got
    fields of their own instead of overloading it.

43. **The admin watches and never acts.** ADMIN gains a read-only Purchase
    orders entry and a home tile counting POs in the chain, but `canApprove`,
    `canValidate` and `canMgmtApprove` are all false for them and the three
    endpoints refuse the role outright. Tested from both ends.

44. **A revision walks the whole chain again.** `revisePo` already returns a PO
    to `PENDING_APPROVAL`; with three gates that now means the Procurement
    Manager, QS and management all see the revision. That is the point of
    revising, so it was left alone.

45. **Quantities stay out of the pool throughout.** `isLivePo` counts anything
    that is not REJECTED or CANCELLED, so a PO waiting at any gate still holds
    its quantity — a second buyer cannot order the same line twice while the
    first PO is being checked.

---

## (g) Transparency for the requesting side — change of 23 Sep 2026

Reported after (f) shipped: *"procurement and procurement manager and management
actions are not shown for the site engineer and project manager — everything
should be transparent and should be visible in that status."* Correct. The chain
strip existed only on the PO page, and neither role had any way to reach one.

46. **The people who asked for the material can reach the purchase order.**
    SITE and PM gain a read-only **Purchase orders** entry in the sidebar (PM
    also gets **Enquiries**), and the RFQ read endpoints, which were
    `PROC · MGMT · ADMIN` only, now serve the whole internal side. Write routes
    were untouched — only the two GETs changed.

47. **The MR page tells the whole story, not just its own half.** The bare
    "Linked documents" chips are replaced by a **Procurement** section: the
    enquiries that went out, then a card per PO carrying the vendor, the
    quantity that came from *this* MR, the value, and the same four-step chain
    the PO page shows — raised · Procurement Manager · QS validated · management
    — each step named and dated, with the reason shown when one of them stopped
    it. `MrDetailDto.linkedPos` carries `LinkedPoDto` for this; `linkedRfqs` is
    new.

48. **Nothing is summarised down for them.** A site engineer opening the PO
    itself gets the full internal view — trail, MR/project split, value check —
    exactly as procurement does. Only the *actions* differ: `canApprove`,
    `canValidate`, `canMgmtApprove` and `canEdit` are all false. Transparency is
    about what you can see, not what you can do, and a test asserts both halves.

49. **They are told at every gate, not only at the end.** `requesterIdsFor()`
    now returns the MR's Project Manager alongside its creator, and that list is
    added to `PO_QS_VALIDATION`, `PO_VALIDATED`, `PO_VALIDATION_FAILED` and both
    rejections. Previously the requesting side heard only about the final
    approval, so a PO sitting at a gate for a week looked like silence.

50. **The status a requester sees is the status, not a copy of it.** Every field
    on the card is read from the PO at request time rather than mirrored onto
    the MR, so the two can never disagree — which is the whole point of the
    complaint that prompted this.

---

## (h) The Chandramari Group mark on every document — change of 28 Sep 2026

Asked for: *"in every MR and PO cmg logo should be added as a header … literally
every MR and PO should have this logo."* The plumbing for a logo already
existed — the `Company` record carries one, and both document headers rendered
it — but nothing supplied one, so every document came out unbranded.

51. **The mark is a static asset, not an upload.** `apps/web/public/logo.png`,
    referenced through `BRAND_LOGO_URL` in `@cm/shared`. Making it depend on an
    admin remembering to upload a file is exactly how a document ends up
    unbranded, which is the thing being complained about.

52. **A billing entity's own logo still wins.** Both headers read
    `company?.logoUrl || BRAND_LOGO_URL`. The Company & PO print setting exists
    so a second legal entity can print under its own letterhead; removing that
    to force one logo would break a feature to satisfy a default. The default is
    now the group mark, which is what was actually missing.

53. **The emailed PO PDF carries the bytes, not a link.** Puppeteer renders with
    no network and no document origin, so `/logo.png` or an `APP_URL` would
    reach the vendor as a broken image. `apps/worker/src/pdf/brandLogo.ts` holds
    the PNG as a base64 data URI (~75 KB of source, worker-side only, kept out
    of the browser bundle), and `printableLogo()` uses a company logo only when
    it is an absolute http(s) URL — a `local:` dev-fallback logo is not
    fetchable either, so that falls back to the mark as well.

54. **Four surfaces, all covered:** the MR detail page header, the printed MR
    form (`/mrs/print`), the PO document — which the PO detail page embeds, so
    it is branded on screen and on paper from one component — and the PDF the
    vendor is emailed. The PO detail page is not branded twice: its header sits
    directly above the document that carries the mark.

55. **Regenerating:** `apps/worker/src/pdf/brandLogo.ts` is generated from
    `apps/web/public/logo.png`. Replacing the logo means replacing both.

---

## (i) The BOQ upload, rebuilt — change of 28 Sep 2026

Reported: *"in new mr while uploading bom we can't [attach] multiple files and
we can't remove the selected files, and alignment for uploading file is not
good … people are not able to find the upload button."* All three were true. The
first version stored one file in one slot behind a bare `<input type="file">`.

56. **A BOQ is a list, not a slot.** `Mr.boqFiles` is an array of stored files,
    up to `MAX_BOQ_FILES` (10). Uploading **adds** to what is there rather than
    replacing it, so a second sheet does not silently destroy the first — the
    old code deleted the previous file on every upload.

57. **The file's storage id is its handle.** `fileSchema` has `_id: false`, and
    `publicId` is already a random unguessable string, so removal is keyed on
    that rather than inventing a second id. Because a publicId is a *path*
    (`boq/<hex>.pdf`), the route is `/mrs/:id/boq/:fileId(*)` and the client
    escapes it — an unescaped slash split the URL and 404'd, which is exactly
    the bug the browser walk caught.

58. **Nothing is lost from the old shape.** The legacy single `boq` field is
    kept and folded in by `boqFilesOf()`, so an MR raised before this change
    still shows its attachment and can still have it removed.

59. **The control is now findable.** A dashed drop area with a primary
    **Choose files** button, a count badge on the label, drag-and-drop, and a
    list of every file with its size and a **Remove** — for files waiting to be
    sent and files already stored alike. The native input is hidden and driven
    by the button, because the unstyled one is close to invisible and was the
    whole complaint.

60. **The client rejects what it can before sending.** Oversized files are named
    individually rather than failing the batch, the same file chosen twice is
    ignored, and the limit is enforced before upload. The API enforces all of it
    again regardless (§8).

61. **A rejected upload is a 400, not a 500.** `MulterError` is now mapped in
    the error handler — too large, too many, or an unexpected field name each
    return a readable message. Before this, a wrong field name crashed the
    request with a stack trace.

---

## (j) Project by code or name, and a compulsory item description — 28 Sep 2026

Asked for: a project **name** dropdown beside the project code one, listing the
same projects; and an **item description** that, unlike remarks, must be filled
in before the request can be submitted.

62. **Two dropdowns, one project.** "Project code" and "Project name" are both
    bound to the same `projectId`, so picking either selects the same project
    and the other follows. The code list is sorted by code and the name list by
    name, because that is how each is scanned. A line underneath spells out what
    was chosen — "Raising for PRJ-0114 · Demo project 0114" — so the pair can
    never be read as two separate answers.

63. **`description` is a field of its own, not a rename of `remarks`.** Remarks
    stay what they were: an optional aside ("Area, drawing ref, spec"). The
    description is what is actually wanted, in the engineer's words, and it is
    what the approvers, the buyer and the vendor read.

64. **Compulsory on submit, not on save.** A draft may still be a sketch, so the
    rule sits beside the quantity and required-date rules in `validateMrInput`,
    which only run when `submit` is true. Anything else would stop an engineer
    jotting down a request and finishing it later.

65. **The rule is enforced twice and named once.** The form checks it for an
    instant answer and names the offending item (`mrDescriptionRequiredFor`);
    the API refuses it regardless with `mrDescriptionRequired` (§8). A
    whitespace-only description fails both — `.trim()` on each side.

66. **It is visible before it is a problem.** The field sits first on the line
    card, above quantity, with an amber "REQUIRED TO SUBMIT" tag and an amber
    border until it is filled — rather than letting the engineer reach the
    submit button and be refused.

67. **It travels the whole way.** The description shows on the MR detail table,
    in both approval grids (so the PM and QS read it before changing anything),
    under the item name once approved, in the paper form's "Description of
    Materials" column, and in the CSV export.

---

## (k) Suggested vendors and four currencies — change of 28 Sep 2026

Asked for: when creating a PO for a particular request, the system should offer
**two recommendations among all the vendors — one on time, one on money** — which
the buyer may take or ignore in favour of choosing a vendor; and the buyer
should be able to pick one of **four currencies: INR, USD, AED, SAR**.

68. **The suggestions are read out of evidence, never typed in.** Money comes
    from rates each vendor has quoted (`Quote`) or actually charged on an
    approved PO (`PoLine` → `Po`), most recent winning per vendor per item.
    Time comes from what a vendor *did* — days from approval to the first GRN —
    falling back to the lead time it *promised* on a quote when it has not
    delivered yet. Nothing in the recommendation is a setting somebody entered.

69. **Delivery is measured from the receipts, not the PO status.** The first
    version filtered POs by `PARTIAL`/`RECEIVED`; a GRN existing *is* what "the
    goods arrived" means, and a status can move on afterwards. Driving it off
    the GRNs removed a condition that silently lost data — caught by a test
    where the timing evidence existed but the status did not say so.

70. **Full coverage beats a cheap partial.** A vendor that can price every item
    on the order is preferred; only when nobody covers the lot does a partial
    vendor get suggested, and the card says "3 of 5 items" so the gap is
    visible rather than hidden in an average.

71. **Each card shows its own reasoning.** "Cheapest known rates for all the
    items — 1,000 less than Vendor B", "Delivered in 4 day(s) on average". A
    recommendation a buyer cannot check is a recommendation they should not
    trust, and the quantities are this order's, so the estimate is about this
    order rather than about vendors in general.

72. **One vendor can be both.** When the cheapest is also the quickest the panel
    says "Best on price and time" once instead of showing the same vendor twice.

73. **Neither is binding, and neither is required.** The vendor search box is
    unchanged and sits directly underneath; with no history at all the panel
    says so plainly and gets out of the way. `POST /pos/recommendations` is a
    read that takes a body, and is restricted to buyers — a site engineer has no
    business seeing rate comparisons.

74. **Currency belongs to the order, not only to the company.** `Po.currency`
    is its own field, defaulting to the billing entity's, chosen per PO from the
    four, and enforced by the Zod enum — the PO page, the printed document and
    the emailed PDF all now read the order's currency rather than the company's.
    The Company & PO print screen offers the same four rather than free text.

---

## (l) Four more units of measure — change of 1 Oct 2026

Asked for: **Pkt (packets), Sqft, Cft and running metre** on MR lines.

75. **Added as first-class units**, not free text: `Pkt`, `Sqft`, `Cft` and
    `Rmt`, so stock, purchase orders and the pool all keep counting in a closed
    list. Anything outside it is still refused with a 400.

76. **Each is placed beside its metric twin** — Sqft after Sqm, Cft after Cum,
    Rmt after Lm — so the list reads as pairs rather than as an append.

77. **Every abbreviation is now spelled out in the dropdowns** (`UNIT_NAMES`):
    "Cft — cubic foot", "Cum — cubic metre". Those two are one letter apart on
    screen and a factor of 35 apart on site, and the same list is used on the MR
    form, the PM and QS review grids and the item master.
