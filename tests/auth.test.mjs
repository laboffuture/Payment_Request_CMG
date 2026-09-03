import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { fileURLToPath } from "node:url";

/* Exercises the password and session primitives directly. The route-level checks
   (401 for anonymous, 403 for the wrong role) are verified against a live D1
   instance; see the auth section of WORKFORCE_MODULE.md. */
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let dir, auth;

before(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "auth-test-"));
  const out = path.join(dir, "auth.mjs");
  execFileSync(path.join(root, "node_modules/.bin/esbuild"),
    [path.join(root, "lib/credentials.ts"), "--bundle", "--format=esm", "--platform=node",
     `--outfile=${out}`, "--log-level=error"], { cwd: root });
  auth = await import(`file://${out}`);
});
after(() => { if (dir) rmSync(dir, { recursive: true, force: true }) });

test("the same password with different salts produces different hashes", async () => {
  const a = await auth.newPasswordFields("Sample@Pass123");
  const b = await auth.newPasswordFields("Sample@Pass123");
  assert.notEqual(a.salt, b.salt, "each account gets its own salt");
  assert.notEqual(a.hash, b.hash, "so identical passwords do not share a hash");
  assert.equal(a.hash.length, 64, "256 bits of derived key");
});

test("a hash verifies against its own password and nothing else", async () => {
  const { salt, hash, iterations } = await auth.newPasswordFields("Sample@Pass123");
  assert.equal(auth.safeEqual(await auth.hashPassword("Sample@Pass123", salt, iterations), hash), true);
  assert.equal(auth.safeEqual(await auth.hashPassword("Samle@Pass123", salt, iterations), hash), false);
  assert.equal(auth.safeEqual(await auth.hashPassword("sample@pass123", salt, iterations), hash), false);
  assert.equal(auth.safeEqual(await auth.hashPassword("", salt, iterations), hash), false);
});

test("the clear-text password is never part of what is stored", async () => {
  const fields = await auth.newPasswordFields("Sample@Pass123");
  const stored = JSON.stringify(fields);
  assert.equal(stored.includes("Sample@Pass123"), false);
  assert.equal(stored.includes("Toprock"), false);
});

test("comparison is length-safe and value-safe", () => {
  assert.equal(auth.safeEqual("abc", "abc"), true);
  assert.equal(auth.safeEqual("abc", "abd"), false);
  assert.equal(auth.safeEqual("abc", "abcd"), false);
  assert.equal(auth.safeEqual("", ""), true);
});

test("password rules reject the weak shapes", () => {
  assert.match(auth.passwordProblem("short1"), /at least/);
  assert.match(auth.passwordProblem("nodigitsatall"), /number/);
  assert.match(auth.passwordProblem("1234567890"), /letter/);
  assert.equal(auth.passwordProblem("Sample@Pass123"), "");
});

test("session tokens are long and never repeat", () => {
  const seen = new Set();
  for (let i = 0; i < 500; i++) {
    const t = auth.randomHex(32);
    assert.equal(t.length, 64, "256 bits of entropy");
    assert.equal(seen.has(t), false, "no collision");
    seen.add(t);
  }
});

test("the session cookie is locked down", () => {
  const c = auth.sessionCookie("abc123", 3600);
  assert.ok(c.includes("HttpOnly"), "not readable from JavaScript");
  assert.ok(c.includes("Secure"), "HTTPS only");
  assert.ok(c.includes("SameSite=Lax"), "not sent on cross-site posts");
  assert.ok(c.includes("Max-Age=3600"));
  const cleared = auth.clearCookie();
  assert.ok(cleared.includes("Max-Age=0"), "sign-out expires it immediately");
});

test("cookies are parsed without picking up a lookalike name", () => {
  const req = (v) => new Request("https://x.test", { headers: { cookie: v } });
  assert.equal(auth.readCookie(req("cot_session=abc"), "cot_session"), "abc");
  assert.equal(auth.readCookie(req("other=1; cot_session=abc; more=2"), "cot_session"), "abc");
  assert.equal(auth.readCookie(req("not_cot_session=abc"), "cot_session"), "");
  assert.equal(auth.readCookie(req(""), "cot_session"), "");
});
