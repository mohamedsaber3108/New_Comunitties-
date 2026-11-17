// Two-factor auth (TOTP) tests: RFC 6238 vector, encryption at rest,
// enrolment, login challenge, replay protection, recovery codes, step-up,
// and the REQUIRE_ADMIN_MFA gate on privileged routes.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
process.env.NODE_ENV = "test";
process.env.DB_DIALECT = process.env.TEST_DB_DIALECT || "sqlite";
const { prepareTestDatabase } = await import("./test-support.js");
const dropTestDb = await prepareTestDatabase();
process.env.WORKER_ENABLED = "false";
process.env.RATE_LIMIT_DISABLED = "true";
process.env.MFA_ENCRYPTION_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
process.env.REQUIRE_ADMIN_MFA = "true";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "usam-mfa-"));
process.env.SQLITE_PATH = path.join(temp, "db.sqlite");

const { initDb, sequelize, User } = await import("./db.js");
const { totpAt, verifyTotp, currentStep, base32Encode, decryptSecret } = await import("./mfa.js");
const { default: app } = await import("./index.js");

let server, base;
async function req(route, method = "GET", body, cookie) {
  const r = await fetch(base + "/api/v1" + route, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})), cookie: r.headers.get("set-cookie")?.split(";")[0] };
}
const PW = "abcdef1234";
async function signup(email) {
  const r = await req("/auth/signup", "POST", { name: "Mfa User", email, password: PW, persona: "launchpad" });
  assert.equal(r.status, 201);
  await User.update({ emailVerified: true }, { where: { email } });
  return r.cookie;
}

before(async () => {
  await initDb();
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  server.close();
  await sequelize.close();
  await dropTestDb();
  fs.rmSync(temp, { recursive: true, force: true });
});

test("TOTP implementation matches the RFC 6238 SHA-1 test vector", () => {
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  // RFC 6238 Appendix B: T=59s -> 94287082 (8 digits), i.e. 287082 in 6 digits.
  assert.equal(totpAt(secret, Math.floor(59 / 30)), "287082");
  assert.equal(totpAt(secret, Math.floor(1111111109 / 30)), "081804");
  assert.equal(totpAt(secret, Math.floor(20000000000 / 30)), "353130");
});

test("verifyTotp tolerates one step of drift, rejects others, and blocks replay", () => {
  const secret = base32Encode(Buffer.from("12345678901234567890"));
  const now = 1111111109 * 1000;
  const step = Math.floor(now / 30000);
  assert.equal(verifyTotp(secret, "081804", { now }), step);
  assert.equal(verifyTotp(secret, totpAt(secret, step - 1), { now }), step - 1);
  assert.equal(verifyTotp(secret, totpAt(secret, step + 5), { now }), null);
  assert.equal(verifyTotp(secret, "081804", { now, lastStep: step }), null, "same step cannot be reused");
  assert.equal(verifyTotp(secret, "abc", { now }), null);
});

let secret, recovery, cookie;
test("enrolment: setup -> wrong code refused -> enable returns recovery codes once", async () => {
  cookie = await signup("mfa@example.test");
  assert.equal((await req("/auth/mfa/status", "GET", null, cookie)).body.enabled, false);
  const s = await req("/auth/mfa/setup", "POST", {}, cookie);
  assert.equal(s.status, 200);
  secret = s.body.secret;
  assert.match(s.body.otpauthUrl, /^otpauth:\/\/totp\/.+secret=/);
  // Secret is encrypted at rest, never stored in plaintext.
  const row = await User.findOne({ where: { email: "mfa@example.test" } });
  assert.ok(row.mfaSecretEnc && !row.mfaSecretEnc.includes(secret));
  assert.equal(decryptSecret(row.mfaSecretEnc), secret);

  assert.equal((await req("/auth/mfa/enable", "POST", { code: "000000" }, cookie)).status, 400);
  const en = await req("/auth/mfa/enable", "POST", { code: totpAt(secret, currentStep()) }, cookie);
  assert.equal(en.status, 200);
  assert.equal(en.body.recoveryCodes.length, 10);
  recovery = en.body.recoveryCodes;
  assert.equal((await req("/me", "GET", null, cookie)).body.user.mfaEnabled, true);
  // Codes are stored hashed only.
  const after = await User.findOne({ where: { email: "mfa@example.test" } });
  assert.ok(!after.mfaRecoveryHashes.includes(recovery[0]));
  // Cannot enrol twice.
  assert.equal((await req("/auth/mfa/setup", "POST", {}, cookie)).status, 409);
});

test("login: password alone is not enough once MFA is on", async () => {
  const noCode = await req("/auth/login", "POST", { email: "mfa@example.test", password: PW });
  assert.equal(noCode.status, 401);
  assert.equal(noCode.body.error, "mfa_required");
  assert.equal(noCode.cookie, undefined, "no session may be issued");

  const bad = await req("/auth/login", "POST", { email: "mfa@example.test", password: PW, mfaCode: "123456" });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.error, "invalid_mfa_code");
  assert.equal(bad.cookie, undefined);

  const wrongPw = await req("/auth/login", "POST", { email: "mfa@example.test", password: "nope-nope-1", mfaCode: totpAt(secret, currentStep() + 1) });
  assert.equal(wrongPw.status, 401);
  assert.equal(wrongPw.body.error, "invalid_credentials", "MFA state must not leak to wrong-password callers");
});

test("login with a valid code works once; the same code cannot be replayed", async () => {
  const code = totpAt(secret, currentStep() + 1);
  const ok = await req("/auth/login", "POST", { email: "mfa@example.test", password: PW, mfaCode: code });
  assert.equal(ok.status, 200);
  assert.ok(ok.cookie);
  assert.equal(ok.body.user.mfaEnabled, true);
  const replay = await req("/auth/login", "POST", { email: "mfa@example.test", password: PW, mfaCode: code });
  assert.equal(replay.status, 401);
  assert.equal(replay.body.error, "invalid_mfa_code");
});

test("a recovery code logs in exactly once", async () => {
  const code = recovery[0];
  const ok = await req("/auth/login", "POST", { email: "mfa@example.test", password: PW, mfaCode: code });
  assert.equal(ok.status, 200);
  const again = await req("/auth/login", "POST", { email: "mfa@example.test", password: PW, mfaCode: code });
  assert.equal(again.status, 401);
  assert.equal((await req("/auth/mfa/status", "GET", null, ok.cookie)).body.recoveryCodesLeft, 9);
});

test("disable and recovery regeneration need password AND a valid factor", async () => {
  const pwOnly = await req("/auth/mfa/disable", "POST", { password: PW }, cookie);
  assert.equal(pwOnly.status, 401);
  const wrongPw = await req("/auth/mfa/disable", "POST", { password: "nope-nope-1", code: recovery[1] }, cookie);
  assert.equal(wrongPw.status, 401);

  const regen = await req("/auth/mfa/recovery-codes", "POST", { password: PW, code: recovery[1] }, cookie);
  assert.equal(regen.status, 200);
  assert.equal(regen.body.recoveryCodes.length, 10);
  // Old codes are dead.
  const old = await req("/auth/login", "POST", { email: "mfa@example.test", password: PW, mfaCode: recovery[2] });
  assert.equal(old.status, 401);

  const dis = await req("/auth/mfa/disable", "POST", { password: PW, code: regen.body.recoveryCodes[0] }, cookie);
  assert.equal(dis.status, 200);
  const plain = await req("/auth/login", "POST", { email: "mfa@example.test", password: PW });
  assert.equal(plain.status, 200, "back to password-only");
});

test("REQUIRE_ADMIN_MFA: staff without MFA are blocked from privileged routes until they enrol", async () => {
  const c = await signup("staff@example.test");
  await User.update({ role: "admin" }, { where: { email: "staff@example.test" } });
  const blocked = await req("/admin/users", "GET", null, c);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error, "mfa_setup_required");
  // Members are unaffected by the policy.
  const m = await signup("plain@example.test");
  assert.equal((await req("/me", "GET", null, m)).status, 200);

  const s = await req("/auth/mfa/setup", "POST", {}, c);
  const en = await req("/auth/mfa/enable", "POST", { code: totpAt(s.body.secret, currentStep()) }, c);
  assert.equal(en.status, 200);
  assert.equal((await req("/admin/users", "GET", null, c)).status, 200);
  // Required roles cannot switch it back off.
  const dis = await req("/auth/mfa/disable", "POST", { password: PW, code: en.body.recoveryCodes[0] }, c);
  assert.equal(dis.status, 403);
  assert.equal(dis.body.error, "mfa_required_for_role");
});
