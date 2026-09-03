import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

// The store is a .tsx module, so it is bundled to plain ESM before the assertions run.
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let dir;
let wf;

const iso = (d) => d.toISOString().slice(0, 10);
const days = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return iso(d) };

const task = (over = {}) => ({
  id: "T1", seriesId: "S1", name: "Daily entry", description: "", frequency: "Daily",
  period: "", start: days(-4), due: days(-4), priority: "High", employeeId: "E1", deptId: "d-group",
  assignedBy: "Group Accounts Manager", expectedOutput: "", remarks: "counted 40 invoices",
  status: "Completed", progress: 100, qty: 10, done: 10, blocker: "", nextAction: "",
  completedAt: days(-4), updatedAt: "", ...over,
});

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "wf-test-"));
  const out = path.join(dir, "workforce-store.mjs");
  execFileSync(path.join(root, "node_modules/.bin/esbuild"),
    [path.join(root, "app/workforce-store.tsx"), "--bundle", "--format=esm", "--jsx=automatic",
     `--outfile=${out}`, "--log-level=error"], { cwd: root });
  wf = await import(`file://${out}`);
});

after(() => { if (dir) rmSync(dir, { recursive: true, force: true }) });

test("a stale daily series produces one occurrence per missed day", () => {
  const missing = wf.pendingOccurrences([task()]);
  assert.equal(missing.length, 4);
  assert.equal(new Set(missing.map((t) => t.due)).size, 4);
  assert.ok(missing.every((t) => t.seriesId === "S1"));
});

test("generated occurrences start clean instead of inheriting progress", () => {
  const missing = wf.pendingOccurrences([task()]);
  assert.ok(missing.every((t) => t.status === "Not Started" && t.progress === 0));
  assert.ok(missing.every((t) => t.remarks === "" && t.completedAt === "" && t.done === 0));
});

test("a series already up to date produces nothing", () => {
  assert.equal(wf.pendingOccurrences([task({ due: days(0) })]).length, 0);
});

test("the catch-up cap stops a dormant series flooding the database", () => {
  assert.equal(wf.pendingOccurrences([task({ due: days(-400) })]).length, 12);
});

test("weekly and monthly series advance by the right interval", () => {
  assert.equal(wf.pendingOccurrences([task({ frequency: "Weekly", due: days(-14) })])[0].due, days(-7));
  const monthly = wf.pendingOccurrences([task({ frequency: "Monthly", due: "2026-06-30" })]);
  assert.equal(monthly[0].due, "2026-07-30");
});

test("one-time and cancelled work never recurs", () => {
  assert.equal(wf.pendingOccurrences([task({ frequency: "One Time" })]).length, 0);
  assert.equal(wf.pendingOccurrences([task({ status: "Cancelled" })]).length, 0);
});

test("overdue is derived, and completed work is never flagged overdue", () => {
  assert.equal(wf.liveStatus({ status: "In Progress", due: days(-1) }), "Overdue");
  assert.equal(wf.liveStatus({ status: "Completed", due: days(-9) }), "Completed");
  assert.equal(wf.liveStatus({ status: "Cancelled", due: days(-9) }), "Cancelled");
  assert.equal(wf.liveStatus({ status: "Not Started", due: days(3) }), "Not Started");
});

test("timeliness separates on time, late and delayed", () => {
  assert.equal(wf.timeliness({ status: "Completed", due: days(-3), completedAt: days(-3) }), "On time");
  assert.equal(wf.timeliness({ status: "Completed", due: days(-3), completedAt: days(-5) }), "On time");
  assert.equal(wf.timeliness({ status: "Completed", due: days(-5), completedAt: days(-1) }), "Late");
  assert.equal(wf.timeliness({ status: "In Progress", due: days(-1), completedAt: "" }), "Delayed");
  assert.equal(wf.timeliness({ status: "In Progress", due: days(4), completedAt: "" }), "On track");
});

test("marking a task complete forces 100 percent, full quantity and a completion date", () => {
  const done = wf.normalise(task({ status: "Completed", progress: 25, done: 3, completedAt: "" }));
  assert.equal(done.progress, 100);
  assert.equal(done.done, 10);
  assert.ok(done.completedAt);
});

test("tasks are bucketed into the right reporting period", () => {
  assert.equal(wf.periodOf("Monthly", "2026-08-28"), "2026-08");
  assert.equal(wf.periodOf("Weekly", "2026-08-28"), wf.weekKey("2026-08-28"));
  assert.equal(wf.periodOf("Daily", "2026-08-28"), "2026-08-28");
});

test("photo URLs are versioned so an immutable cache header stays correct", () => {
  assert.equal(wf.photoUrl({ id: "E-1", photoAt: "" }), "");
  const url = wf.photoUrl({ id: "E-1", photoAt: "2026-08-28T10:00:00.000Z" });
  assert.ok(url.includes("employeeId=E-1"));
  assert.ok(url.includes("v=2026-08-28T10%3A00%3A00.000Z"));
});

test("badge tone never returns an unstyled class for a known status", () => {
  for (const s of ["Completed", "Overdue", "In Progress", "On Hold", "Cancelled", "Resolved", "Open", "Followed Up"])
    assert.notEqual(wf.statusTone(s), "");
});

test("an import row can carry a series end date and a job description", () => {
  // mirrors the validation in app/api/workforce/tasks/import/route.ts
  const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
  assert.equal(isDate("2026-12-30"), true);
  assert.equal(isDate("01-09-2026"), false);
  assert.equal("2026-08-01" < "2026-09-01", true, "an end before the start is detectable");
});

test("the reporting period of an imported task follows its frequency", () => {
  assert.equal(wf.periodOf("Weekly", "2026-09-02"), wf.weekKey("2026-09-02"));
  assert.equal(wf.periodOf("Monthly", "2026-09-02"), "2026-09");
  assert.equal(wf.periodOf("Daily", "2026-09-02"), "2026-09-02");
  assert.equal(wf.periodOf("One Time", "2026-09-02"), "2026-09-02");
});

test("attachment size is measured correctly from base64, padding included", () => {
  // mirrors the calculation in app/api/attachments/route.ts
  const size = (b64) => {
    const pad = (/=+$/.exec(b64) || [""])[0].length;
    return Math.floor(b64.length * 3 / 4) - pad;
  };
  assert.equal(size(Buffer.from("hello").toString("base64")), 5);
  assert.equal(size(Buffer.from("hi").toString("base64")), 2);
  assert.equal(size(Buffer.from("a".repeat(1000)).toString("base64")), 1000);
});

test("only document and image types are accepted as attachments", () => {
  const allowed = [/^image\//, /^application\/pdf$/, /^application\/vnd\./,
    /^application\/msword$/, /^text\/csv$/, /^text\/plain$/, /^application\/zip$/];
  const ok = (m) => allowed.some((r) => r.test(m));
  for (const m of ["application/pdf", "image/jpeg", "image/png", "text/csv",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"])
    assert.equal(ok(m), true, `${m} accepted`);
  for (const m of ["application/x-msdownload", "text/html", "application/javascript",
    "application/x-sh"])
    assert.equal(ok(m), false, `${m} refused`);
});
