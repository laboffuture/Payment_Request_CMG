# What changed in this round of work

Everything below was built on top of the first delivery of the Chandramari
Material Management system. It is written in the order the changes were asked
for. The app runs at **http://localhost:8080**; every demo login uses the
password `demo123`.

---

## 1. The pipeline as it now stands

### Material request — three people, two review gates

```
  SITE ENGINEER            PROJECT MANAGER              QS
  raises the MR     ──▶    reviews it          ──▶     reviews it again    ──▶  APPROVED
  qty · unit ·             may change qty,             may change the same       split into
  measurement ·            unit, measurement,          three, plus split          from-store
  description ·            or drop a line              store / PO                 and for-PO
  optional BOQ
                           may send back  ──┐          may send back  ──┐
                           may reject       │          may reject       │
                                            ▼                           ▼
                                      SITE ENGINEER sees the reason, who gave it,
                                      and exactly what was changed
```

Statuses: `DRAFT → PM_PENDING → QS_PENDING → APPROVED → CLOSED`,
with `SENT_BACK` and `REJECTED` off to the side. A sent-back MR returns to the
**PM**, not to QS — the PM asked for the change, so the PM checks it was made.

### Purchase order — three approval gates before a vendor sees anything

```
  PROCUREMENT        PROC MANAGER        QS                    MANAGEMENT
  raises the PO ──▶  approves      ──▶   validates       ──▶   approves      ──▶  VENDOR
  from the pool      or rejects          "is everything        or rejects         is told
                                         you specified
                                         on this PO?"
                                         Yes / No + reason
```

Statuses: `DRAFT → PENDING_APPROVAL → QS_VALIDATION → MGMT_APPROVAL → APPROVED
→ PARTIAL → RECEIVED`.

Nothing is committed until the **last** gate: the item master only learns the
rate, and the vendor is only told, on management's approval. A PO that dies at
gate one or two leaves no trace and the vendor never knew it existed.

**ADMIN** watches the whole chain read-only and cannot act in it.

---

## 2. Change by change

### 2.1 Project Manager review of every MR

**Asked for:** the site engineer enters quantity, measurements and units; the MR
goes to the PM, who can approve, reject or change all three; then to QS, who can
do the same; everything visible to the site engineer; a QS rejection visible to
the PM as well.

**What was built**

| Area | Change |
|---|---|
| New role | `PM` — Project Manager, with its own sidebar and **MR approvals** queue at `/pm`, sorted by required date, with a badge |
| New status | `PM_PENDING` ("With PM"), its own chip and list tab |
| MR line | gained `unit` and `measurement` (free text: "2400 × 1200 × 12.5 mm", "M20", "6 m lengths") |
| PM panel | editable Qty / Unit / Measurement per line, a reason box per line, a "Not needed" tick to drop a line, then **Approve & send to QS**, **Send back** or **Reject MR** |
| QS panel | the same three editable fields added beside the existing store/PO split |
| Visibility | the original request is frozen on first submit, so every later edit shows as a change |

**How it comes out**

The site engineer's MR page now shows, per line:

```
Gypsum board 12.5 mm   [CHANGED]
Measurement: 2400 × 1200 × 15 mm        Qty: 18
             asked 2400 × 1200 × 12.5 mm      asked 30
Reason: Galvanised only, and 18 covers the grid

Project Manager (Project Manager 1): Cut to what the grid needs
```

Notifications follow the chain: submit → PM; PM approval → QS **and** the
requester; **QS rejection or send-back → requester and PM**.

**Demo logins:** `pm1` is now the Project Manager; `site2` was added so
PRJ-0105 keeps a site engineer.

---

### 2.2 Bill of quantities on an MR

**Asked for:** optional BOQ upload when raising an MR, visible to the PM and QS
after submission. Later: multiple files, removable files, and a control people
can actually find.

**What was built**

- Up to **10 files** per MR, 5 MB each — PDF, photo or spreadsheet
  (CSV / XLS / XLSX), checked by magic bytes not by file extension.
- Uploading **adds** to what is there rather than replacing it.
- **Remove** on every file, both before saving and after it is stored.
- A dashed drop area with a primary **Choose files** button, a file-count badge,
  drag-and-drop, and each row showing name, size and status.
- Optional throughout: an MR is raised perfectly well without one.
- Served through short-lived signed links to the requester, the PM and QS.

**How it comes out**

```
Bill of quantities (optional)  [3 FILES]
┌────────────────────────────────────────────┐
│            ┌──────────────┐                │
│            │ Choose files │                │
│            └──────────────┘                │
│  or drag them here — you can pick several  │
│  PDF, photo or spreadsheet · 5 MB · 10 max │
└────────────────────────────────────────────┘
  level-2.pdf   1 KB · will be attached when you save   [Remove]
  level-3.pdf   1 KB · will be attached when you save   [Remove]
```

---

### 2.3 Purchase-order approval chain

**Asked for:** after QS approves the MR, procurement creates and submits the PO;
the Procurement Manager approves or rejects; on approval it returns to QS, who
sees everything they specified and presses **Validate**, which asks whether it
is all there — yes validates it, no takes a remark saying what is missing; once
validated it goes to management (admin watches only), who approve or reject; the
status is visible everywhere.

**What was built**

Two new statuses and three new endpoints. QS's validation screen shows the PO
against QS's own numbers:

```
QS validation
PROJECT   MR               ITEM                 YOU APPROVED   ON THIS PO
PRJ-0105  MR-0105-26-0001  Ceiling tile 600×600     250           250     [MATCHES]
PRJ-0114  MR-0114-26-0002  Gypsum board 12.5 mm      80            60     [SHORT BY 20]

                                                        [ Validate ]
```

Pressing **Validate** asks one question:

> Is everything you specified on this purchase order?
> **Yes — everything is there**   ·   **No — something is missing**

A **no** requires a remark and sends the PO back to procurement carrying it. A
**yes** sends it to management.

Every PO page opens with a four-step strip naming who did what and when:

```
Raised by procurement   Procurement Manager    QS validated    Management approved
Procurement User        Procurement Manager    QS User         Management User
22 Sept, 18:49          22 Sept, 18:50         22 Sept, 18:50  22 Sept, 18:51
```

---

### 2.4 Transparency for the requesting side

**Asked for:** procurement, Procurement Manager and management actions were not
visible to the site engineer or the Project Manager; everything should be
transparent and visible in the status.

**What was built**

- SITE and PM gained a read-only **Purchase orders** entry (PM also
  **Enquiries**); the RFQ read endpoints were opened to the internal side.
- The MR page's bare "Linked documents" chips were replaced with a
  **Procurement** section: the enquiries that went out, then a card per PO with
  the vendor, the quantity from *this* MR, the value, and the same four-step
  chain — with the reason shown when somebody stopped it.
- Opening the PO itself, a site engineer gets the full internal view — trail,
  MR/project split, value check — exactly as procurement does. Only the
  *actions* differ: every approve/validate/edit flag is false.
- They are now notified at **every** gate, not only the final approval.

---

### 2.5 Chandramari Group logo on every document

**Asked for:** the CMG logo as a header on literally every MR and PO.

**What was built**

| Surface | Result |
|---|---|
| MR detail page header | logo beside the MR number and status |
| Printed MR form | logo left of "MATERIAL REQUISITION FORM" |
| PO document | logo left of the company block — on screen and on paper |
| PO PDF emailed to the vendor | logo embedded in the attachment |

The file is a static asset, not an upload, so a document can never come out
unbranded because nobody configured one. The emailed PDF carries the image bytes
inline, because Puppeteer renders with no network and a path would have reached
the vendor as a broken image. A billing entity that sets its own logo still
overrides it — that is what the Company & PO print setting is for.

---

### 2.6 New MR form: project by code or name, compulsory description

**Asked for:** a project *name* dropdown beside the project code one; and an
item description that, unlike remarks, must be filled in to submit.

**What was built**

```
Project code *              Project name *
[ PRJ-0114        ▾ ]       [ Demo project 0114        ▾ ]
Raising for PRJ-0114 · Demo project 0114
```

Both dropdowns list every project and are bound to the same selection — pick
either and the other follows. The code list sorts by code, the name list by
name.

Each item now carries a **Description**, first on the card above the quantity,
with an amber *REQUIRED TO SUBMIT* tag and border until filled:

> *What exactly is needed — grade, finish, make, where it goes*

Submitting without it is refused and the toast names the item. **Drafts can
still be saved without one**, so a request can be jotted down and finished
later. The description then travels to the MR table, both review grids, the
printed form's "Description of Materials" column, and the CSV export.

---

### 2.7 Suggested vendors and four currencies

**Asked for:** two recommendations among all vendors — one by time, one by money
— which the buyer may take or ignore; and four currencies: INR, USD, AED, SAR.

**What was built**

Two cards above the vendor box on PO step 2, worked out for *these* items at
*these* quantities:

```
┌─ BEST ON PRICE ──────────────┐  ┌─ FASTEST DELIVERY ───────────┐
│ Vendor B (demo)              │  │ Vendor A (demo)              │
│ Cheapest known rates for all │  │ Delivered in 4 day(s) on     │
│ the items — 1,000 less than  │  │ average, and prices all the  │
│ Vendor A                     │  │ items                        │
│ At past rates   2,000.00 AED │  │ At past rates   3,000.00 AED │
│ Delivery        not known    │  │ Delivery        4 day(s)     │
│ [ Use Vendor B (demo) ]      │  │ [ Use Vendor A (demo) ]      │
└──────────────────────────────┘  └──────────────────────────────┘
```

- **Money** comes from rates each vendor has quoted or actually charged on an
  approved PO, most recent winning per vendor per item.
- **Time** comes from what the vendor *did* — days from approval to the first
  goods receipt — falling back to the lead time it *promised* on a quote.
- Nothing in a recommendation is a setting somebody typed.
- A vendor that can price every item is preferred; a partial one says "3 of 5
  items" rather than hiding the gap in an average.
- When one vendor is both, the panel says "Best on price and time" once.
- Neither is binding — the vendor search box is unchanged, directly underneath.
  With no history the panel says so and gets out of the way.

**Currency** is now a field on the purchase order itself, chosen from
**INR · USD · AED · SAR**, defaulting to the billing entity's. The PO page, the
printed document and the emailed PDF all read the order's currency.

---

### 2.8 More units of measure

**Asked for:** Pkt (packets), Sqft, Cft and running metre.

Added as first-class units — `Pkt`, `Sqft`, `Cft`, `Rmt` — each placed beside
its metric twin (Sqft after Sqm, Cft after Cum, Rmt after Lm). Every
abbreviation is now spelled out in the dropdown ("Cft — cubic foot", "Cum —
cubic metre"), because those two are one letter apart on screen and a factor of
35 apart on site. Anything outside the list is still refused.

---

## 3. Where it stands

**Tests: 182 passing** — 18 shared rules, 34 calculation, 130 API
(7 suites, run against a real MongoDB replica set in memory).

Every change above was also driven in a real browser before being called done,
watching for console errors and failed API calls.

**Three bugs that only the browser found, not the tests:**

1. The BOQ link was missing its `/api` prefix — it worked under test and 404'd
   in the browser.
2. Removing a stored BOQ file 404'd: the file's storage id is a path
   (`boq/<hex>.pdf`) and the unescaped slash split the URL across route
   segments.
3. Vendor delivery time was measured only on POs marked `PARTIAL`/`RECEIVED`.
   A goods receipt existing *is* what "the goods arrived" means, so it now reads
   the receipts directly.

**Design decisions** are recorded as numbered entries (d)(1)–(l)(77) in
`docs/00-PLAN.md`, each saying what was ambiguous and which way it was settled.

**Still on the dev-only footing described in the original plan:** this machine
has no Docker or WSL, so Redis is an in-process stand-in (background jobs and
emails disabled) and uploaded files go to disk under `.local/uploads` instead of
Cloudinary. `env.ts` refuses to start production without either.
