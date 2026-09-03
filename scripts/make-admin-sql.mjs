/* Emits the SQL that creates (or resets) one administrator login.

   The password is hashed here with exactly the scheme lib/credentials.ts uses —
   PBKDF2-SHA256, 120,000 iterations, a random 16-byte salt — so the clear text never
   travels to the database or into wrangler's command history.

   Usage: node scripts/make-admin-sql.mjs <email> <password> ["Full Name"]           */

const [, , email, password, name = "Administrator"] = process.argv;
if (!email || !password) {
  console.error('usage: node scripts/make-admin-sql.mjs <email> <password> ["Full Name"]');
  process.exit(64);
}

const enc = new TextEncoder();
const toHex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
const fromHex = (hex) => { const o = new Uint8Array(hex.length / 2); for (let i = 0; i < o.length; i++) o[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16); return o };

const ITERATIONS = 120000;
const salt = toHex(crypto.getRandomValues(new Uint8Array(16)).buffer);
const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
const hash = toHex(await crypto.subtle.deriveBits(
  { name: "PBKDF2", salt: fromHex(salt), iterations: ITERATIONS, hash: "SHA-256" }, key, 256));

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;
const now = new Date().toISOString();
// every role, so the role switcher in the header can reach every screen
const roles = JSON.stringify(["Administrator", "Audit Head", "Management", "Accountant", "Auditor", "Finance", "Requestor"]);

process.stdout.write(`DELETE FROM wf_sessions WHERE email = ${q(email.toLowerCase())};
DELETE FROM wf_users WHERE email = ${q(email.toLowerCase())};
INSERT INTO wf_users (id, email, name, employee_id, roles, salt, hash, iterations, must_change, active, created_at, password_set_at, last_login_at)
VALUES ('u-admin', ${q(email.toLowerCase())}, ${q(name)}, '', ${q(roles)}, ${q(salt)}, ${q(hash)}, ${ITERATIONS}, 0, 1, ${q(now)}, ${q(now)}, '');
`);
