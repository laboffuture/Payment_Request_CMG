import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

/* The Accounts Receivable stage model. These rules decide who may move an entry and
   what must be filled in first, and both the API route and the screen read them from
   here - so a mistake would show up as a button a role cannot actually press, or a
   stage that lets an entry through without the number it is supposed to carry. */
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let dir, flow;

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "recv-test-"));
  const out = path.join(dir, "receivable-stages.mjs");
  execFileSync(path.join(root, "node_modules/.bin/esbuild"),
    [path.join(root, "lib/receivable-stages.ts"), "--bundle", "--format=esm", "--platform=node",
     `--outfile=${out}`, "--log-level=error"], { cwd: root });
  flow = await import(`file://${out}`);
});
after(() => { if (dir) rmSync(dir, { recursive: true, force: true }) });

test("the flow runs job notification to verified, in order", () => {
  assert.deepEqual(flow.STAGES, ["Job Notification", "CRM JOB Creation", "Sales Order",
    "Audit Verification", "Verified"]);
  assert.equal(flow.stageIndex("Sales Order"), 2);
});

test("an unknown stage reads as the first one rather than as progress", () => {
  assert.equal(flow.stageIndex("Something else"), 0);
  assert.equal(flow.stageIndex(""), 0);
});

test("accounts carry an entry to audit, and audit decides", () => {
  for (const stage of ["Job Notification", "CRM JOB Creation", "Sales Order"]) {
    assert.equal(flow.mayAct(stage, ["Accountant"]), true, `accounts act at ${stage}`);
    assert.equal(flow.mayAct(stage, ["Auditor"]), false, `audit does not act at ${stage}`);
  }
  assert.equal(flow.mayAct("Audit Verification", ["Auditor"]), true);
  assert.equal(flow.mayAct("Audit Verification", ["Audit Head"]), true);
  assert.equal(flow.mayAct("Audit Verification", ["Accountant"]), false);
});

test("an administrator can act at every stage, so a flow never sticks", () => {
  for (const stage of flow.STAGES.slice(0, 4))
    assert.equal(flow.mayAct(stage, ["Administrator"]), true, stage);
});

test("a verified entry is finished: nobody acts on it again", () => {
  assert.equal(flow.isVerified("Verified"), true);
  assert.equal(flow.isVerified("Audit Verification"), false);
  for (const role of ["Accountant", "Auditor", "Audit Head", "Administrator"])
    assert.equal(flow.mayAct("Verified", [role]), false, role);
});

test("a role with no part in this flow cannot act anywhere", () => {
  for (const stage of flow.STAGES)
    assert.equal(flow.mayAct(stage, ["Requestor"]), false, stage);
  assert.equal(flow.mayAct("Job Notification", []), false);
});

test("each stage owes the next one its numbers", () => {
  assert.deepEqual(flow.REQUIRED_TO_LEAVE["Job Notification"], ["crmJobNo"]);
  assert.deepEqual(flow.REQUIRED_TO_LEAVE["CRM JOB Creation"], ["soNo", "amount"]);
  // Sending to audit adds nothing of its own; verification needs no field either.
  assert.deepEqual(flow.REQUIRED_TO_LEAVE["Sales Order"], []);
  assert.deepEqual(flow.REQUIRED_TO_LEAVE["Audit Verification"], []);
});

test("audit sends an entry back to any stage before verification, never forward", () => {
  assert.deepEqual([...flow.RETURNABLE_TO],
    ["Job Notification", "CRM JOB Creation", "Sales Order"]);
  assert.equal(flow.RETURNABLE_TO.includes("Audit Verification"), false);
  assert.equal(flow.RETURNABLE_TO.includes("Verified"), false);
});

test("every stage that can be acted on names its action", () => {
  for (const stage of flow.STAGES.slice(0, 4))
    assert.ok(flow.ACTION_LABEL[stage].length > 0, stage);
  assert.equal(flow.ACTION_LABEL["Verified"], "");
});
