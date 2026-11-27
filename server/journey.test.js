// End-to-end member journey, one continuous story with email verification ON
// and a MOCKED Paymob (see payments.test.js for the honesty note):
//   register -> verify email -> log in -> complete profile -> join community
//   -> post/comment/react -> register for event + ticket + admin check-in
//   -> receive notification (+email) -> subscribe -> pay (signed webhook)
//   -> entitlement unlocked -> apply for a perk -> cancel at period end
//   -> export data -> delete account.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
process.env.NODE_ENV = "test";
process.env.DB_DIALECT = process.env.TEST_DB_DIALECT || "sqlite";
const { prepareTestDatabase, signupLogin } = await import("./test-support.js");
const dropTestDb = await prepareTestDatabase();
process.env.REQUIRE_EMAIL_VERIFICATION = "true";
process.env.WORKER_ENABLED = "false";
process.env.RATE_LIMIT_DISABLED = "true";
process.env.PAYMOB_ENABLED = "true";
process.env.PAYMOB_API_KEY = "k";
process.env.PAYMOB_SECRET_KEY = "s";
process.env.PAYMOB_PUBLIC_KEY = "p";
process.env.PAYMOB_INTEGRATION_ID_CARD = "1";
process.env.PAYMOB_IFRAME_ID = "2";
process.env.PAYMOB_HMAC_SECRET = "journey-secret";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "usam-journey-"));
process.env.SQLITE_PATH = path.join(temp, "db.sqlite");

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (!u.startsWith("https://accept.paymob.com")) return realFetch(url, init);
  const body = init?.body ? JSON.parse(init.body) : {};
  const ok = (o) => new Response(JSON.stringify(o), { status: 200, headers: { "Content-Type": "application/json" } });
  if (u.endsWith("/auth/tokens")) return ok({ token: "t" });
  if (u.endsWith("/ecommerce/orders")) return ok({ id: 4242 });
  if (u.endsWith("/acceptance/payment_keys")) return ok({ token: "pk" + body.order_id });
  return new Response("{}", { status: 404 });
};

const { initDb, sequelize, User, OutboxMessage, PaymentAttempt } = await import("./db.js");
const { default: app } = await import("./index.js");

let server, base;
const jar = {};
async function req(route, method = "GET", body, who) {
  const r = await realFetch(base + "/api/v1" + route, {
    method,
    headers: { "Content-Type": "application/json", ...(who?.cookie ? { Cookie: who.cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})), cookie: r.headers.get("set-cookie")?.split(";")[0] };
}
const mailTo = async (addr, template) =>
  (await OutboxMessage.findAll({ where: { kind: "email" }, order: [["createdAt", "DESC"]] }))
    .map((r) => JSON.parse(r.payload))
    .filter((p) => p.to === addr && (!template || p.template === template));

const FIELDS = ["amount_cents","created_at","currency","error_occured","has_parent_transaction","id","integration_id","is_3d_secure","is_auth","is_capture","is_refunded","is_standalone_payment","is_voided","order","owner","pending","source_data_pan","source_data_sub_type","source_data_type","success"];
function signed(txn) {
  const pick = (f) => f === "order" ? txn.order.id : f === "source_data_pan" ? txn.source_data.pan : f === "source_data_sub_type" ? txn.source_data.sub_type : f === "source_data_type" ? txn.source_data.type : txn[f];
  const s = FIELDS.map((f) => { const v = pick(f); return typeof v === "boolean" ? String(v) : v == null ? "" : String(v); }).join("");
  return `/payments/webhook/paymob?hmac=${crypto.createHmac("sha512", "journey-secret").update(s).digest("hex")}`;
}

before(async () => {
  await initDb();
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  globalThis.fetch = realFetch;
  server.close();
  await sequelize.close();
  await dropTestDb();
  fs.rmSync(temp, { recursive: true, force: true });
});

test("JOURNEY: a new member goes from sign-up to a paid, entitled, then departed account", async () => {
  // ---- 1. Register (unverified) --------------------------------------
  const reg = await signupLogin(req, { name: "Journey Member", email: "journey@example.test", password: "abcdef1234", persona: "launchpad" });
  assert.equal(reg.status, 200);
  assert.equal(reg.body.user.emailVerified, false);
  jar.me = { cookie: reg.cookie, id: reg.body.user.id, username: reg.body.user.username };

  // Unverified: can browse, cannot take verified-only actions.
  assert.equal((await req("/communities", "GET", null, jar.me)).status, 200);
  assert.equal((await req("/communities/launchpad/join", "POST", null, jar.me)).body.error, "email_verification_required");

  // ---- 2. Verify email via the link from the (queued) email ---------
  const link = (await mailTo("journey@example.test", "verifyEmail"))[0].args.link;
  const token = new URL(link).searchParams.get("token");
  assert.equal((await req("/auth/verify-email", "POST", { token })).status, 200);
  assert.equal((await req("/auth/verify-email", "POST", { token })).status, 400, "token is single-use");

  // ---- 3. Log in fresh, complete profile ----------------------------
  const login = await req("/auth/login", "POST", { email: "journey@example.test", password: "abcdef1234" });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.emailVerified, true);
  jar.me.cookie = login.cookie;
  const prof = await req("/me", "PATCH", { name: "Journey Member", bio: "Building a logistics startup in Cairo.", location: "Cairo", skills: ["ops", "sales"], discoverable: true, messagesEnabled: true, persona: "launchpad", language: "en" }, jar.me);
  assert.equal(prof.status, 200);
  assert.equal(prof.body.user.discoverable, true);

  // ---- 4. Community, post, comment, reaction ------------------------
  assert.equal((await req("/communities/launchpad/join", "POST", null, jar.me)).status, 200);
  const post = await req("/posts", "POST", { body: "What was your first paying customer's biggest objection?", community: "launchpad" }, jar.me);
  assert.equal(post.status, 201);
  const postId = post.body.id || post.body.item?.id;
  assert.equal((await req(`/posts/${postId}/comments`, "POST", { body: "Price, every single time." }, jar.me)).status, 201);
  assert.equal((await req(`/posts/${postId}/reaction`, "PUT", null, jar.me)).status, 200);
  const feed = await req("/posts?community=launchpad", "GET", null, jar.me);
  const mine = feed.body.items.find((p) => p.id === postId);
  assert.equal(mine.commentsCount, 1);
  assert.equal(mine.reactionsCount, 1);

  // ---- 5. Event: admin publishes, member registers, ticket, check-in -
  const adminReg = await signupLogin(req, { name: "Admin", email: "jadmin@example.test", password: "abcdef1234", persona: "launchpad" });
  await User.update({ role: "admin", emailVerified: true }, { where: { email: "jadmin@example.test" } });
  jar.admin = { cookie: adminReg.cookie };
  const ev = await req("/admin/events", "POST", { title: "Founders Meetup", startsAt: new Date(Date.now() + 5 * 86400000).toISOString(), capacity: 20, community: "launchpad", description: "Monthly meetup" }, jar.admin);
  assert.equal(ev.status, 201);
  assert.ok([200, 201].includes((await req(`/events/${ev.body.id}/register`, "POST", null, jar.me)).status));
  const ticket = await req(`/events/${ev.body.id}/ticket`, "GET", null, jar.me);
  assert.ok(ticket.body.ticket.code);
  assert.equal((await req("/admin/events/check-in", "POST", { ticketCode: ticket.body.ticket.code }, jar.admin)).status, 200);
  assert.equal((await req("/my-events", "GET", null, jar.me)).body.items.length, 1);

  // ---- 6. Notification + email from another member's follow ---------
  await req("/notification-preferences", "PUT", { inApp: true, email: true, digest: "off", kinds: [] }, jar.me);
  await User.update({ emailVerified: true }, { where: { email: "jadmin@example.test" } });
  assert.equal((await req(`/members/${jar.me.id}/follow`, "PUT", null, jar.admin)).status, 200);
  const notes = await req("/notifications", "GET", null, jar.me);
  assert.ok(notes.body.items.length >= 1);
  assert.ok((await mailTo("journey@example.test", "notification")).length >= 1, "immediate email queued");
  assert.equal((await req("/notifications/read-all", "PATCH", null, jar.me)).status, 200);

  // ---- 7. Subscribe: not entitled until PAYMENT is verified ---------
  assert.equal((await req("/perks", "GET", null, jar.me)).body.access.eligible, false);
  const sub = await realFetch(base + "/api/v1/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: jar.me.cookie, "Idempotency-Key": "journey-sub-key-0001" },
    body: JSON.stringify({ planCode: "pro", billingCycle: "monthly" }),
  });
  const subBody = await sub.json();
  assert.equal(sub.status, 202);
  assert.equal(subBody.amountEgp, 349, "price is taken from the Plan table, never the client");
  assert.ok(subBody.checkout.checkoutUrl);
  assert.equal((await req("/perks", "GET", null, jar.me)).body.access.eligible, false, "still locked while pending");
  // The browser cannot self-activate: only admin/webhook can, and a member is refused.
  assert.equal((await req(`/admin/subscriptions/${subBody.subscriptionId}/activate`, "PATCH", { confirmed: true }, jar.me)).status, 403);

  // ---- 8. Provider confirms payment via signed webhook --------------
  const attempt = await PaymentAttempt.findByPk(subBody.paymentAttemptId);
  const txn = { id: 777001, amount_cents: 34900, currency: "EGP", created_at: "2026-11-03T10:00:00", error_occured: false, has_parent_transaction: false, integration_id: 1, is_3d_secure: true, is_auth: false, is_capture: false, is_refunded: false, is_standalone_payment: true, is_voided: false, owner: 1, pending: false, success: true, order: { id: 4242, merchant_order_id: attempt.merchantOrderId }, source_data: { pan: "2346", sub_type: "Visa", type: "card" } };
  assert.equal((await req(signed(txn), "POST", { type: "TRANSACTION", obj: txn })).status, 200);

  // ---- 9. Entitlement unlocked: billing, perks, email ---------------
  const billing = await req("/billing", "GET", null, jar.me);
  assert.equal(billing.body.subscription.status, "active");
  assert.equal(billing.body.subscription.plan.code, "pro");
  assert.equal((await req("/perks", "GET", null, jar.me)).body.access.eligible, true);
  assert.ok((await mailTo("journey@example.test", "subscriptionActive")).length >= 1);

  const perks = await req("/perks", "GET", null, jar.me);
  const perk = perks.body.items[0];
  const apply = await req(`/perks/${perk.id}/apply`, "POST", { startupName: "Cairo Freight", stage: "mvp", website: "https://example.test", useCase: "We need workflow automation credits for our dispatch operations." }, jar.me);
  assert.equal(apply.status, 201);

  // ---- 10. Cancel keeps access until the paid term ends -------------
  const cancel = await req("/subscriptions/current", "DELETE", null, jar.me);
  assert.equal(cancel.body.status, "active");
  assert.ok(cancel.body.cancelsAt);
  assert.equal((await req("/perks", "GET", null, jar.me)).body.access.eligible, true);

  // ---- 11. Export own data, then delete the account -----------------
  const exp = await req("/users/me/export", "GET", null, jar.me);
  assert.equal(exp.status, 200);
  assert.equal(exp.body.email, "journey@example.test");
  assert.ok(exp.body.payments.length >= 1);
  assert.equal(exp.body.profile.passwordHash, undefined, "no secrets in the export");
  assert.equal((await req("/users/me", "DELETE", { confirm: "nope", password: "abcdef1234" }, jar.me)).status, 400);
  // A session alone cannot erase the account: the password is re-checked.
  assert.equal((await req("/users/me", "DELETE", { confirm: "DELETE" }, jar.me)).status, 401);
  assert.equal((await req("/users/me", "DELETE", { confirm: "DELETE", password: "wrong-pass-1" }, jar.me)).status, 401);
  assert.equal((await req("/users/me", "DELETE", { confirm: "DELETE", password: "abcdef1234" }, jar.me)).status, 200);
  assert.equal((await req("/me", "GET", null, jar.me)).body.user, null, "session is dead after deletion");
  assert.equal((await req("/auth/login", "POST", { email: "journey@example.test", password: "abcdef1234" })).status, 401);
  // Deleted member vanishes from the directory.
  const dir = await req("/members");
  assert.ok(!dir.body.items.some((u) => u.username === jar.me.username));
});
