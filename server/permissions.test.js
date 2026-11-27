// T-01: permission tests on every admin, money and export route.
// For each marked route: no sign-in -> 401, wrong role -> 403.
// Table-driven. The full route list is in .usam-ops/reports/route-roles.md.
// A route that does NOT deny correctly is marked { todo: "hole: file:line" }
// (the app is not changed in this PR).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
process.env.NODE_ENV = "test";
process.env.DB_DIALECT = process.env.TEST_DB_DIALECT || "sqlite";
const { prepareTestDatabase, signupLogin } = await import("./test-support.js");
const dropTestDb = await prepareTestDatabase();
process.env.REQUIRE_EMAIL_VERIFICATION = "false";
process.env.WORKER_ENABLED = "false";
process.env.RATE_LIMIT_DISABLED = "true";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "usam-perm-"));
process.env.SQLITE_PATH = path.join(temp, "db.sqlite");

const { initDb, sequelize, User, Plan, Subscription, PaymentAttempt, ApprovalRequest } = await import("./db.js");
const { config } = await import("./config.js");
const { default: app } = await import("./index.js");

let server, base;
const cookies = {};
// The app answers 404 (before any sign-in check) when an :id is not a UUID
// (server/index.js:160), so the "/1" id segments in the tables below are
// swapped for a well-formed UUID that matches no row.
const NO_ROW = "00000000-0000-4000-8000-000000000000";
async function req(route, method = "GET", body, cookie) {
  route = route.replace(/\/1(?=\/|$)/g, "/" + NO_ROW);
  const r = await fetch(base + "/api/v1" + route, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    body: method === "GET" ? undefined : JSON.stringify(body || {}),
  });
  return {
    status: r.status,
    body: await r.json().catch(() => ({})),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
async function signup(email, role) {
  const r = await signupLogin(req, {
    name: "User " + email,
    email,
    password: "abcdef1234",
    persona: "launchpad",
  });
  if (role) await User.update({ role }, { where: { email } });
  return r.cookie;
}

before(async () => {
  await initDb();
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  cookies.member = await signup("member@perm.test");
  cookies.member2 = await signup("member2@perm.test");
  cookies.moderator = await signup("moderator@perm.test", "moderator");
  cookies.admin = await signup("admin@perm.test", "admin");
  cookies.admin2 = await signup("admin2@perm.test", "admin");
  cookies.super = await signup("super@perm.test", "super_admin");
});
after(async () => {
  server.close();
  await sequelize.close();
  await dropTestDb();
  fs.rmSync(temp, { recursive: true, force: true });
});

// ---- Route tables ---------------------------------------------------------
// [method, path (after /api/v1), source file:line]
// Admin-only: member 403, moderator 403, no sign-in 401.
const ADMIN = [
  ["GET", "/admin/plans", "server/account.js:79"],
  ["POST", "/admin/plans", "server/account.js:114"],
  ["PATCH", "/admin/plans/1", "server/account.js:132"],
  ["GET", "/admin/users", "server/account.js:149"],
  ["PATCH", "/admin/users/1", "server/account.js:193"],
  ["GET", "/admin/outbox", "server/account.js:242"],
  ["POST", "/admin/outbox/1/retry", "server/account.js:272"],
  ["GET", "/admin/audit", "server/account.js:297"],
  ["GET", "/admin/analytics", "server/analytics.js:21"],
  ["GET", "/admin/coupons", "server/coupons.js:252"],
  ["POST", "/admin/coupons", "server/coupons.js:262"],
  ["PATCH", "/admin/coupons/1", "server/coupons.js:275"],
  ["GET", "/admin/coupons/1/redemptions", "server/coupons.js:305"],
  ["GET", "/admin/payments", "server/payments.js:131"],
  ["POST", "/admin/payments/1/refund", "server/payments.js:391"],
  ["POST", "/admin/payments/1/reconcile", "server/payments.js:502"],
  ["GET", "/admin/mentors", "server/index.js:2502"],
  ["PATCH", "/admin/mentors/1", "server/index.js:2514"],
  ["POST", "/admin/challenges", "server/index.js:2532"],
  ["GET", "/admin/challenges/1/submissions", "server/index.js:2560"],
  ["PATCH", "/admin/submissions/1", "server/index.js:2577"],
  ["GET", "/admin/groups", "server/index.js:3416"],
  ["POST", "/admin/groups", "server/index.js:3434"],
  ["PATCH", "/admin/group-memberships/1", "server/index.js:3471"],
  ["GET", "/admin/curated-rooms", "server/index.js:3502"],
  ["POST", "/admin/curated-rooms", "server/index.js:3520"],
  ["PATCH", "/admin/room-applications/1", "server/index.js:3543"],
  ["GET", "/admin/partnerships", "server/index.js:3590"],
  ["PATCH", "/admin/partnerships/1", "server/index.js:3604"],
  ["GET", "/admin/feature-flags", "server/index.js:3651"],
  ["PUT", "/admin/feature-flags/some_flag", "server/index.js:3658"],
  ["GET", "/admin/cms", "server/index.js:3691"],
  ["PUT", "/admin/cms/some_key/en", "server/index.js:3705"],
  ["GET", "/admin/events", "server/index.js:3741"],
  ["PATCH", "/admin/events/1", "server/index.js:3772"],
  ["POST", "/admin/events/check-in", "server/index.js:3838"],
  ["GET", "/admin/overview", "server/index.js:3869"],
  ["GET", "/admin/perks", "server/index.js:3917"],
  ["PATCH", "/admin/perks/1", "server/index.js:3927"],
  ["GET", "/admin/perk-applications", "server/index.js:3954"],
  ["PATCH", "/admin/perk-applications/1", "server/index.js:3970"],
  ["GET", "/admin/subscriptions", "server/index.js:4007"],
  ["PATCH", "/admin/subscriptions/1/activate", "server/index.js:4033"], // manual activation (files a request)
  ["GET", "/admin/approvals", "server/approvals.js:43"],
  ["POST", "/admin/approvals/1/approve", "server/approvals.js:116"],
  ["POST", "/admin/approvals/1/reject", "server/approvals.js:101"],
  ["GET", "/admin/contact", "server/index.js:4096"],
  ["PATCH", "/admin/contact/1", "server/index.js:4109"],
  ["GET", "/admin/organizations", "server/index.js:4147"],
  ["PATCH", "/admin/organizations/1", "server/index.js:4156"],
  ["POST", "/admin/events", "server/index.js:4186"],
  ["POST", "/admin/offers", "server/index.js:4223"],
];
// Moderator-or-higher: member 403, no sign-in 401.
const MODERATOR = [
  ["GET", "/admin/reports", "server/index.js:4121"],
  ["PATCH", "/admin/reports/1", "server/index.js:4133"],
];
// Money + export routes that need only a signed-in member: no sign-in 401.
const SIGNED_IN = [
  ["GET", "/billing", "server/index.js:789"],
  ["POST", "/subscriptions", "server/index.js:820"],
  ["DELETE", "/subscriptions/current", "server/index.js:1019"],
  ["POST", "/events/1/register", "server/index.js:1784"], // paid event registration
  ["DELETE", "/events/1/register", "server/index.js:1831"],
  ["GET", "/events/1/ticket", "server/index.js:3355"],
  ["GET", "/payments/mine", "server/payments.js:89"],
  ["POST", "/payments/checkout/1", "server/payments.js:187"],
  ["POST", "/coupons/quote", "server/coupons.js:161"],
  ["GET", "/users/me/export", "server/account.js:38"], // the only export route
];

// Marks a known hole: the test is reported as TODO and does not fail the run.
// Add an entry as "METHOD path" -> "hole: file:line" when a route fails.
const HOLES = {};
const opts = (m, p) => (HOLES[`${m} ${p}`] ? { todo: HOLES[`${m} ${p}`] } : {});

for (const [m, p, src] of [...ADMIN, ...MODERATOR, ...SIGNED_IN]) {
  test(`${m} ${p} (${src}): no sign-in -> 401`, opts(m, p), async () => {
    const r = await req(p, m, {});
    assert.equal(r.status, 401);
  });
}
for (const [m, p, src] of ADMIN) {
  for (const who of ["member", "moderator"]) {
    test(`${m} ${p} (${src}): ${who} -> 403`, opts(m, p), async () => {
      const r = await req(p, m, {}, cookies[who]);
      assert.equal(r.status, 403);
      assert.equal(r.body.error, "forbidden");
    });
  }
}
for (const [m, p, src] of MODERATOR) {
  test(`${m} ${p} (${src}): member -> 403`, opts(m, p), async () => {
    const r = await req(p, m, {}, cookies.member);
    assert.equal(r.status, 403);
  });
}

// ---- Public money routes ----------------------------------------------------
test("POST /payments/webhook/paymob with no signature -> 400 invalid_signature", async () => {
  const r = await req("/payments/webhook/paymob", "POST", { obj: {} });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "invalid_signature");
});

// ---- Own-data rule on money routes ---------------------------------------------
test("POST /payments/checkout/:id for an attempt the member does not own -> 404", async () => {
  const r = await req("/payments/checkout/00000000-0000-4000-8000-000000000000", "POST", {}, cookies.member);
  assert.equal(r.status, 404);
});

// ---- super_admin-only rules ------------------------------------------------------
test("admin cannot grant admin or super_admin (super_admin only)", async () => {
  const target = await User.findOne({ where: { email: "member2@perm.test" } });
  for (const role of ["admin", "super_admin"]) {
    const r = await req(`/admin/users/${target.id}`, "PATCH", { action: "set_role", role }, cookies.admin);
    assert.equal(r.status, 403);
    assert.equal(r.body.error, "super_admin_required");
  }
  const unchanged = await User.findByPk(target.id);
  assert.equal(unchanged.role, "member");
});

test("admin cannot demote another admin (super_admin only)", async () => {
  const target = await User.findOne({ where: { email: "admin2@perm.test" } });
  const r = await req(`/admin/users/${target.id}`, "PATCH", { action: "set_role", role: "member" }, cookies.admin);
  assert.equal(r.status, 403);
  assert.equal(r.body.error, "super_admin_required");
  const unchanged = await User.findByPk(target.id);
  assert.equal(unchanged.role, "admin");
});

test("manual subscription activation: with Paymob live, admin -> 403, super_admin passes the role gate", async () => {
  const before = { configured: config.paymob.configured, enabled: config.paymob.enabled };
  config.paymob.configured = true;
  config.paymob.enabled = true;
  try {
    const a = await req("/admin/subscriptions/00000000-0000-4000-8000-000000000000/activate", "PATCH", { confirmed: true }, cookies.admin);
    assert.equal(a.status, 403);
    assert.equal(a.body.error, "super_admin_required");
    const s = await req("/admin/subscriptions/00000000-0000-4000-8000-000000000000/activate", "PATCH", { confirmed: true }, cookies.super);
    assert.equal(s.status, 404); // past the role gate, subscription does not exist
  } finally {
    config.paymob.configured = before.configured;
    config.paymob.enabled = before.enabled;
  }
});

// ---- Two-person rule (A-02 part 1) -------------------------------------------------
const REASON = "customer asked, checked with the bank";
async function paidAttempt(n) {
  const member = await User.findOne({ where: { email: "member@perm.test" } });
  return PaymentAttempt.create({
    idempotencyKey: `perm-key-${n}-0000000000`,
    amountEgp: 100,
    status: "paid",
    UserId: member.id,
  });
}
async function pendingSub(n) {
  const member = await User.findOne({ where: { email: "member2@perm.test" } });
  const plan = await Plan.findOne({ where: { code: "plus" } });
  return Subscription.create({
    UserId: member.id,
    PlanId: plan.id,
    billingCycle: "monthly",
    status: "pending_payment",
    amountEgp: 149 + n,
  });
}
const askRefund = (a, cookie = cookies.admin, body = {}) =>
  req(`/admin/payments/${a.id}/refund`, "POST", { reason: REASON, ...body }, cookie);
const askActivate = (s, cookie = cookies.super) =>
  req(`/admin/subscriptions/${s.id}/activate`, "PATCH", { confirmed: true, reason: REASON }, cookie);

test("refund request does nothing until a different admin approves; requester is refused", async () => {
  const a = await paidAttempt(1);
  assert.equal((await askRefund(a, cookies.admin, { reason: "short" })).status, 400);
  const asked = await askRefund(a);
  assert.equal(asked.status, 201);
  assert.equal((await PaymentAttempt.findByPk(a.id)).status, "paid", "request alone must not refund");
  assert.equal((await askRefund(a)).body.error, "request_already_pending");
  const self = await req(`/admin/approvals/${asked.body.id}/approve`, "POST", {}, cookies.admin);
  assert.equal(self.status, 403);
  assert.equal(self.body.error, "self_approval_forbidden");
  assert.equal((await PaymentAttempt.findByPk(a.id)).status, "paid");
  const ok = await req(`/admin/approvals/${asked.body.id}/approve`, "POST", {}, cookies.admin2);
  assert.equal(ok.status, 200);
  assert.equal((await PaymentAttempt.findByPk(a.id)).status, "refunded");
  const again = await req(`/admin/approvals/${asked.body.id}/approve`, "POST", {}, cookies.super);
  assert.equal(again.status, 409);
  assert.equal(again.body.error, "request_not_pending");
  const row = await ApprovalRequest.findByPk(asked.body.id);
  assert.equal(row.status, "approved");
  assert.notEqual(row.decidedById, row.requestedById);
});

test("activation: admin cannot approve (super_admin only); requester cannot approve own; other super_admin can", async () => {
  const s = await pendingSub(1);
  const asked = await askActivate(s);
  assert.equal(asked.status, 201);
  assert.equal((await Subscription.findByPk(s.id)).status, "pending_payment", "request alone must not activate");
  const byAdmin = await req(`/admin/approvals/${asked.body.id}/approve`, "POST", {}, cookies.admin);
  assert.equal(byAdmin.status, 403);
  assert.equal(byAdmin.body.error, "super_admin_required");
  const self = await req(`/admin/approvals/${asked.body.id}/approve`, "POST", {}, cookies.super);
  assert.equal(self.status, 403);
  assert.equal(self.body.error, "self_approval_forbidden");
  await User.update({ role: "super_admin" }, { where: { email: "admin2@perm.test" } });
  try {
    const ok = await req(`/admin/approvals/${asked.body.id}/approve`, "POST", {}, cookies.admin2);
    assert.equal(ok.status, 200);
    assert.equal((await Subscription.findByPk(s.id)).status, "active");
  } finally {
    await User.update({ role: "admin" }, { where: { email: "admin2@perm.test" } });
  }
});

test("an expired request is refused and marked expired", async () => {
  const a = await paidAttempt(2);
  const asked = await askRefund(a);
  await ApprovalRequest.update({ expiresAt: new Date(Date.now() - 1000) }, { where: { id: asked.body.id } });
  const r = await req(`/admin/approvals/${asked.body.id}/approve`, "POST", {}, cookies.admin2);
  assert.equal(r.status, 409);
  assert.equal(r.body.error, "request_expired");
  assert.equal((await ApprovalRequest.findByPk(asked.body.id)).status, "expired");
  assert.equal((await PaymentAttempt.findByPk(a.id)).status, "paid");
});

test("reject needs a note, is audited, and leaves the payment alone; list shows pending only", async () => {
  const a = await paidAttempt(3);
  const asked = await askRefund(a);
  const list = await req("/admin/approvals", "GET", null, cookies.admin2);
  assert.equal(list.status, 200);
  assert.ok(list.body.items.some((x) => x.id === asked.body.id && x.requestedBy.email === "admin@perm.test"));
  assert.equal((await req(`/admin/approvals/${asked.body.id}/reject`, "POST", {}, cookies.admin2)).body.error, "note_required");
  const rej = await req(`/admin/approvals/${asked.body.id}/reject`, "POST", { note: "not justified" }, cookies.admin2);
  assert.equal(rej.status, 200);
  assert.equal((await PaymentAttempt.findByPk(a.id)).status, "paid");
  const after = await req("/admin/approvals", "GET", null, cookies.admin2);
  assert.equal(after.body.items.some((x) => x.id === asked.body.id), false);
});

// ---- Allowed side (proves the 403 tests are not passing because of a broken route) ---
test("moderator is allowed on moderator routes; admin and super_admin on admin routes", async () => {
  assert.equal((await req("/admin/reports", "GET", null, cookies.moderator)).status, 200);
  assert.equal((await req("/admin/overview", "GET", null, cookies.admin)).status, 200);
  assert.equal((await req("/admin/overview", "GET", null, cookies.super)).status, 200);
});
