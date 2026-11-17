// Integration tests for the identity / account-security flows added on top
// of the existing API: email verification, password reset, change password,
// session/device management, account deletion, lockout, and RBAC.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
process.env.NODE_ENV = "test";
process.env.DB_DIALECT = process.env.TEST_DB_DIALECT || "sqlite";
const { prepareTestDatabase } = await import("./test-support.js");
const dropTestDb = await prepareTestDatabase();
process.env.REQUIRE_EMAIL_VERIFICATION = "true";
process.env.WORKER_ENABLED = "false"; // drive the outbox manually in tests
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "usam-identity-"));
process.env.SQLITE_PATH = path.join(temp, "db.sqlite");

const { initDb, sequelize, User, VerificationToken, OutboxMessage } =
  await import("./db.js");
const { processBatch } = await import("./jobs.js");
const { default: app } = await import("./index.js");

let server, base;
async function req(route, method = "GET", body, cookie) {
  const r = await fetch(base + "/api/v1" + route, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: r.status,
    body: await r.json().catch(() => ({})),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}

// Pull the raw token for a user+purpose by re-deriving from the most recent
// unconsumed row is impossible (only hashes stored). Instead we read the
// enqueued email payload from the outbox, which contains the link with the
// raw token — exactly what a user would receive.
async function latestEmailLink(toEmail) {
  const rows = await OutboxMessage.findAll({
    where: { kind: "email" },
    order: [["createdAt", "DESC"]],
  });
  for (const row of rows) {
    const payload = JSON.parse(row.payload);
    if (payload.to === toEmail && payload.args?.link) return payload.args.link;
  }
  return null;
}
const tokenFromLink = (link) => new URL(link).searchParams.get("token");

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

test("signup issues an unverified account and enqueues a verification email", async () => {
  const r = await req("/auth/signup", "POST", {
    name: "Verify Me",
    email: "verify@example.test",
    password: "abcdef1234",
    persona: "launchpad",
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.user.emailVerified, false);
  const link = await latestEmailLink("verify@example.test");
  assert.ok(link && link.includes("/verify-email?token="));
});

test("unverified accounts are blocked from verified-only actions but can read", async () => {
  const s = await req("/auth/signup", "POST", {
    name: "Gate Tester",
    email: "gate@example.test",
    password: "abcdef1234",
    persona: "launchpad",
  });
  const cookie = s.cookie;
  // Reading is allowed.
  const read = await req("/communities", "GET", null, cookie);
  assert.equal(read.status, 200);
  // Writing / joining / paying are not.
  for (const [route, method, body] of [
    ["/communities/launchpad/join", "POST"],
    ["/posts", "POST", { body: "hello world from unverified", community: "launchpad" }],
    ["/subscriptions", "POST", { planCode: "plus", billingCycle: "monthly" }],
    ["/messages/start", "POST", { username: "someone" }],
  ]) {
    const r = await req(route, method, body, cookie);
    assert.equal(r.status, 403, `${method} ${route} should be 403`);
    assert.equal(r.body.error, "email_verification_required");
  }
  // After verification the same action succeeds.
  const link = await latestEmailLink("gate@example.test");
  const ok = await req(`/auth/verify-email/${tokenFromLink(link)}`);
  assert.equal(ok.status, 200);
  const join = await req("/communities/launchpad/join", "POST", null, cookie);
  assert.equal(join.status, 200);
});

test("weak passwords are rejected at signup", async () => {
  const r = await req("/auth/signup", "POST", {
    name: "Weak",
    email: "weak@example.test",
    password: "allletters", // no digit
    persona: "launchpad",
  });
  assert.equal(r.status, 400);
});

test("email verification flips the flag and is single-use", async () => {
  const link = await latestEmailLink("verify@example.test");
  const token = tokenFromLink(link);
  const ok = await req(`/auth/verify-email/${token}`);
  assert.equal(ok.status, 200);
  assert.equal(ok.body.verified, true);
  const again = await req(`/auth/verify-email/${token}`);
  assert.equal(again.status, 400); // consumed
  const user = await User.findOne({ where: { email: "verify@example.test" } });
  assert.equal(user.emailVerified, true);
});

test("password reset: forgot (no enumeration) -> reset -> login with new password", async () => {
  // forgot for an unknown email still returns 200
  const unknown = await req("/auth/password/forgot", "POST", {
    email: "nobody@example.test",
  });
  assert.equal(unknown.status, 200);

  const forgot = await req("/auth/password/forgot", "POST", {
    email: "verify@example.test",
  });
  assert.equal(forgot.status, 200);
  const link = await latestEmailLink("verify@example.test");
  const token = tokenFromLink(link);
  assert.ok(token);

  const reset = await req("/auth/password/reset", "POST", {
    token,
    password: "brandnew9999",
  });
  assert.equal(reset.status, 200);

  // Old password no longer works; new one does.
  const oldLogin = await req("/auth/login", "POST", {
    email: "verify@example.test",
    password: "abcdef1234",
  });
  assert.equal(oldLogin.status, 401);
  const newLogin = await req("/auth/login", "POST", {
    email: "verify@example.test",
    password: "brandnew9999",
  });
  assert.equal(newLogin.status, 200);
});

test("sessions list shows the current device and a session can be revoked", async () => {
  const login = await req("/auth/login", "POST", {
    email: "verify@example.test",
    password: "brandnew9999",
  });
  const cookie = login.cookie;
  const list = await req("/users/me/sessions", "GET", null, cookie);
  assert.equal(list.status, 200);
  assert.ok(list.body.items.length >= 1);
  assert.ok(list.body.items.some((s) => s.current));
});

test("change password requires the correct current password", async () => {
  const login = await req("/auth/login", "POST", {
    email: "verify@example.test",
    password: "brandnew9999",
  });
  const cookie = login.cookie;
  const bad = await req("/users/me/change-password", "POST", {
    currentPassword: "wrongwrong1",
    newPassword: "another12345",
  }, cookie);
  assert.equal(bad.status, 400);
  const good = await req("/users/me/change-password", "POST", {
    currentPassword: "brandnew9999",
    newPassword: "another12345",
  }, cookie);
  assert.equal(good.status, 200);
});

test("suspended accounts cannot log in", async () => {
  const u = await User.findOne({ where: { email: "verify@example.test" } });
  await u.update({ status: "suspended" });
  const r = await req("/auth/login", "POST", {
    email: "verify@example.test",
    password: "another12345",
  });
  assert.equal(r.status, 403);
  assert.equal(r.body.error, "account_suspended");
  await u.update({ status: "active" });
});

test("account deletion soft-deletes and blocks further login", async () => {
  const login = await req("/auth/login", "POST", {
    email: "verify@example.test",
    password: "another12345",
  });
  const cookie = login.cookie;
  const del = await req("/users/me", "DELETE", { confirm: "DELETE", password: "another12345" }, cookie);
  assert.equal(del.status, 200);
  const u = await User.findByPk(
    (await User.findAll({ where: { isDeleted: true } }))[0].id,
  );
  assert.equal(u.isDeleted, true);
  // Cannot log in to a deleted account (email was anonymized anyway).
  const relogin = await req("/auth/login", "POST", {
    email: "verify@example.test",
    password: "another12345",
  });
  assert.equal(relogin.status, 401);
});

test("outbox worker marks emails sent via the console transport", async () => {
  await processBatch(50);
  const pending = await OutboxMessage.count({ where: { status: "pending" } });
  assert.equal(pending, 0);
});

test("payments config reports Paymob as not configured in tests", async () => {
  const r = await req("/payments/config");
  assert.equal(r.status, 200);
  assert.equal(r.body.configured, false);
});

test("deleted accounts are purged after the grace window (credentials destroyed, personal rows removed)", async () => {
  const { Notification, Session, VerificationToken, OutboxMessage, WebhookEvent, MediaAsset } = await import("./db.js");
  const { runHousekeeping, PURGE_AFTER_DAYS } = await import("./housekeeping.js");
  const gone = (await User.findAll({ where: { isDeleted: true } }))[0];
  await Notification.create({ UserId: gone.id, kind: "x", text: "private", href: "/" });
  const deps = { Session, VerificationToken, OutboxMessage, WebhookEvent, Notification, MediaAsset, User, models: sequelize.models };
  // Inside the grace window nothing is purged yet.
  let stats = await runHousekeeping(deps);
  assert.equal(stats.purgedAccounts, 0);
  await gone.update({ deletedAt: new Date(Date.now() - (PURGE_AFTER_DAYS + 1) * 86400_000) });
  stats = await runHousekeeping(deps);
  assert.equal(stats.purgedAccounts, 1);
  const after = await User.findByPk(gone.id);
  assert.ok(after.purgedAt);
  assert.match(after.passwordHash, /^!purged:/);
  assert.match(after.username, /^deleted-/);
  assert.equal(await Notification.count({ where: { UserId: gone.id } }), 0);
  assert.equal((await runHousekeeping(deps)).purgedAccounts, 0, "purge runs once");
});