// Payment lifecycle tests against a MOCKED Paymob API.
//
// HONESTY NOTE: Paymob's HTTP API is replaced by an in-test stub shaped after
// Paymob's public documentation. These tests prove OUR logic (signature
// checks, amount validation, idempotency, state machine, refunds, expiry).
// They do NOT prove the live Paymob sandbox accepts our requests; that needs
// real credentials and is tracked as an open item in TESTING_AND_RELEASE_REPORT.md.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";

process.env.NODE_ENV = "test";
process.env.DB_DIALECT = process.env.TEST_DB_DIALECT || "sqlite";
const { prepareTestDatabase } = await import("./test-support.js");
const dropTestDb = await prepareTestDatabase();
process.env.REQUIRE_EMAIL_VERIFICATION = "false";
process.env.WORKER_ENABLED = "false";
process.env.RATE_LIMIT_DISABLED = "true";
process.env.PAYMOB_ENABLED = "true";
process.env.PAYMOB_API_KEY = "test-api-key";
process.env.PAYMOB_SECRET_KEY = "test-secret";
process.env.PAYMOB_PUBLIC_KEY = "test-public";
process.env.PAYMOB_INTEGRATION_ID_CARD = "12345";
process.env.PAYMOB_IFRAME_ID = "999";
process.env.PAYMOB_HMAC_SECRET = "test-hmac-secret";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "usam-pay-"));
process.env.SQLITE_PATH = path.join(temp, "db.sqlite");

// ---- Paymob API stub -----------------------------------------------------
const realFetch = globalThis.fetch;
const paymobCalls = [];
let nextTxnId = 9000;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (!u.startsWith("https://accept.paymob.com")) return realFetch(url, init);
  const body = init?.body ? JSON.parse(init.body) : {};
  paymobCalls.push({ url: u, body });
  const json = (obj, status = 200) =>
    new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });
  if (u.endsWith("/auth/tokens")) return json({ token: "auth-token" });
  if (u.endsWith("/ecommerce/orders")) return json({ id: 5000 + paymobCalls.length });
  if (u.endsWith("/acceptance/payment_keys")) return json({ token: "pay-key-" + body.order_id });
  if (u.endsWith("/acceptance/void_refund/refund"))
    return json({ id: ++nextTxnId, success: true, is_refunded: true, amount_cents: body.amount_cents });
  return json({ message: "not_found" }, 404);
};

const { initDb, sequelize, User, Subscription, PaymentAttempt, WebhookEvent, OutboxMessage } =
  await import("./db.js");
const { runPaymentMaintenance } = await import("./payments.js");
const { default: app } = await import("./index.js");

let server, base, memberCookie, adminCookie, routeDepsForMaintenance;

async function req(route, method = "GET", body, cookie, headers = {}) {
  const r = await realFetch(base + "/api/v1" + route, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})), cookie: r.headers.get("set-cookie")?.split(";")[0] };
}
async function signup(email) {
  return (await req("/auth/signup", "POST", { name: "Pay " + email, email, password: "abcdef1234", persona: "launchpad" })).cookie;
}

// Build a Paymob-style signed webhook for a transaction.
const HMAC_FIELDS = ["amount_cents","created_at","currency","error_occured","has_parent_transaction","id","integration_id","is_3d_secure","is_auth","is_capture","is_refunded","is_standalone_payment","is_voided","order","owner","pending","source_data_pan","source_data_sub_type","source_data_type","success"];
function signedWebhook(txn, secret = process.env.PAYMOB_HMAC_SECRET) {
  const pick = (f) => {
    if (f === "order") return txn.order.id;
    if (f === "source_data_pan") return txn.source_data.pan;
    if (f === "source_data_sub_type") return txn.source_data.sub_type;
    if (f === "source_data_type") return txn.source_data.type;
    return txn[f];
  };
  const concat = HMAC_FIELDS.map((f) => { const v = pick(f); return typeof v === "boolean" ? String(v) : v == null ? "" : String(v); }).join("");
  const hmac = crypto.createHmac("sha512", secret).update(concat).digest("hex");
  return { path: `/payments/webhook/paymob?hmac=${hmac}`, body: { type: "TRANSACTION", obj: txn } };
}
function txnFor(attemptId, amountEgp, overrides = {}) {
  return {
    id: ++nextTxnId, amount_cents: amountEgp * 100, currency: "EGP", created_at: "2026-11-03T10:00:00.000000",
    error_occured: false, has_parent_transaction: false, integration_id: 12345, is_3d_secure: true, is_auth: false,
    is_capture: false, is_refunded: false, is_standalone_payment: true, is_voided: false, owner: 1, pending: false,
    success: true, order: { id: 777, merchant_order_id: `usam-${attemptId}` },
    source_data: { pan: "2346", sub_type: "MasterCard", type: "card" }, ...overrides,
  };
}
async function startPaidSubscription(cookie, key, planCode = "plus", billingCycle = "monthly") {
  const r = await realFetch(base + "/api/v1/subscriptions", {
    method: "POST", headers: { "Content-Type": "application/json", Cookie: cookie, "Idempotency-Key": key },
    body: JSON.stringify({ planCode, billingCycle }),
  });
  return { status: r.status, body: await r.json() };
}

before(async () => {
  await initDb();
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  memberCookie = await signup("payer@example.test");
  adminCookie = await signup("payadmin@example.test");
  await User.update({ role: "admin" }, { where: { email: "payadmin@example.test" } });
});
after(async () => {
  globalThis.fetch = realFetch;
  server.close();
  await sequelize.close();
  await dropTestDb();
  fs.rmSync(temp, { recursive: true, force: true });
});

test("paid checkout opens a real hosted checkout and does NOT activate the subscription", async () => {
  const cfg = await req("/payments/config");
  assert.equal(cfg.body.configured, true);
  const r = await startPaidSubscription(memberCookie, "pay-key-000000001");
  assert.equal(r.status, 202);
  assert.equal(r.body.status, "pending_payment");
  assert.equal(r.body.checkout.configured, true);
  assert.match(r.body.checkout.checkoutUrl, /acceptance\/iframes\/999\?payment_token=pay-key-/);
  // The price came from the Plan row (149), not the client.
  assert.equal(r.body.amountEgp, 149);
  const billing = await req("/billing", "GET", null, memberCookie);
  assert.equal(billing.body.subscription.status, "pending_payment");
  const perks = await req("/perks", "GET", null, memberCookie);
  assert.equal(perks.body.access.eligible, false);
});

test("replaying the same idempotency key reuses the Paymob order (no duplicate order)", async () => {
  const before = paymobCalls.filter((c) => c.url.endsWith("/ecommerce/orders")).length;
  const again = await startPaidSubscription(memberCookie, "pay-key-000000001");
  assert.equal(again.status, 202);
  assert.ok(again.body.checkout.checkoutUrl);
  const after = paymobCalls.filter((c) => c.url.endsWith("/ecommerce/orders")).length;
  assert.equal(after, before, "a retry must not create a second Paymob order");
});

test("with the provider live, manual activation is super_admin only", async () => {
  const attempt = await PaymentAttempt.findOne({ order: [["createdAt", "DESC"]] });
  const url = `/admin/subscriptions/${attempt.SubscriptionId}/activate`;
  const denied = await req(url, "PATCH", { confirmed: true }, adminCookie);
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error, "super_admin_required");
  assert.equal((await Subscription.findByPk(attempt.SubscriptionId)).status, "pending_payment");
  // A super_admin passes the gate (a different fresh pending sub would be needed to
  // activate; an unknown id proves the gate is open without touching state).
  await User.update({ role: "super_admin" }, { where: { email: "payadmin@example.test" } });
  const open = await req(`/admin/subscriptions/00000000-0000-4000-8000-000000000000/activate`, "PATCH", { confirmed: true }, adminCookie);
  assert.equal(open.status, 404);
  await User.update({ role: "admin" }, { where: { email: "payadmin@example.test" } });
});

test("webhook with a forged signature is rejected and changes nothing", async () => {
  const attempt = await PaymentAttempt.findOne({ order: [["createdAt", "DESC"]] });
  const w = signedWebhook(txnFor(attempt.id, 149), "attacker-guessed-secret");
  const r = await req(w.path, "POST", w.body);
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "invalid_signature");
  assert.equal((await Subscription.findByPk(attempt.SubscriptionId)).status, "pending_payment");
  // Missing signature entirely.
  const none = await req("/payments/webhook/paymob", "POST", { type: "TRANSACTION", obj: txnFor(attempt.id, 149) });
  assert.equal(none.status, 400);
});

test("a validly signed success for the WRONG amount is refused (no activation)", async () => {
  const attempt = await PaymentAttempt.findOne({ order: [["createdAt", "DESC"]] });
  const w = signedWebhook(txnFor(attempt.id, 1)); // paid EGP 1 instead of 149
  const r = await req(w.path, "POST", w.body);
  assert.equal(r.status, 200);
  assert.equal(r.body.flagged, "amount_mismatch");
  assert.equal((await Subscription.findByPk(attempt.SubscriptionId)).status, "pending_payment");
  assert.equal((await PaymentAttempt.findByPk(attempt.id)).failureCode, "amount_mismatch");
});

test("a validly signed success in the wrong currency is refused", async () => {
  const attempt = await PaymentAttempt.findOne({ order: [["createdAt", "DESC"]] });
  const w = signedWebhook(txnFor(attempt.id, 149, { currency: "USD" }));
  const r = await req(w.path, "POST", w.body);
  assert.equal(r.body.flagged, "amount_mismatch");
  assert.equal((await Subscription.findByPk(attempt.SubscriptionId)).status, "pending_payment");
});

test("a pending (non-final) callback changes nothing", async () => {
  const attempt = await PaymentAttempt.findOne({ order: [["createdAt", "DESC"]] });
  const w = signedWebhook(txnFor(attempt.id, 149, { pending: true, success: false }));
  const r = await req(w.path, "POST", w.body);
  assert.equal(r.body.pending, true);
  assert.equal((await Subscription.findByPk(attempt.SubscriptionId)).status, "pending_payment");
});

test("a correct signed success activates, grants entitlement, and a duplicate is a no-op", async () => {
  const attempt = await PaymentAttempt.findOne({ order: [["createdAt", "DESC"]] });
  const txn = txnFor(attempt.id, 149);
  const w = signedWebhook(txn);
  const first = await req(w.path, "POST", w.body);
  assert.equal(first.status, 200);
  const sub = await Subscription.findByPk(attempt.SubscriptionId);
  assert.equal(sub.status, "active");
  assert.ok(sub.endsAt > new Date());
  assert.equal((await PaymentAttempt.findByPk(attempt.id)).status, "paid");
  assert.equal((await req("/perks", "GET", null, memberCookie)).body.access.eligible, true);

  const emailsBefore = await OutboxMessage.count({ where: { kind: "email" } });
  const dup = await req(w.path, "POST", w.body);
  assert.equal(dup.body.deduped, true);
  assert.equal(await OutboxMessage.count({ where: { kind: "email" } }), emailsBefore, "duplicate must not re-send email");
  assert.equal(await WebhookEvent.count({ where: { eventId: String(txn.id) } }), 1);
});

test("a late failure callback cannot downgrade an already-paid attempt", async () => {
  const attempt = await PaymentAttempt.findOne({ order: [["createdAt", "DESC"]] });
  const w = signedWebhook(txnFor(attempt.id, 149, { success: false }));
  await req(w.path, "POST", w.body);
  assert.equal((await PaymentAttempt.findByPk(attempt.id)).status, "paid");
  assert.equal((await Subscription.findByPk(attempt.SubscriptionId)).status, "active");
});

test("partial refund keeps the membership; full refund revokes it; provider is really called", async () => {
  const attempt = await PaymentAttempt.findOne({ order: [["createdAt", "DESC"]] });
  const callsBefore = paymobCalls.filter((c) => c.url.endsWith("/void_refund/refund")).length;

  // Member cannot refund.
  assert.equal((await req(`/admin/payments/${attempt.id}/refund`, "POST", { amountEgp: 10 }, memberCookie)).status, 403);

  const partial = await req(`/admin/payments/${attempt.id}/refund`, "POST", { amountEgp: 49 }, adminCookie);
  assert.equal(partial.status, 200);
  assert.equal(partial.body.providerConfirmed, true);
  assert.equal((await Subscription.findByPk(attempt.SubscriptionId)).status, "active");
  assert.equal((await PaymentAttempt.findByPk(attempt.id)).refundedAmountEgp, 49);

  // Over-refunding is rejected.
  assert.equal((await req(`/admin/payments/${attempt.id}/refund`, "POST", { amountEgp: 500 }, adminCookie)).status, 400);

  const full = await req(`/admin/payments/${attempt.id}/refund`, "POST", { amountEgp: 100 }, adminCookie);
  assert.equal(full.status, 200);
  assert.equal((await PaymentAttempt.findByPk(attempt.id)).status, "refunded");
  assert.equal((await Subscription.findByPk(attempt.SubscriptionId)).status, "canceled");
  assert.equal(paymobCalls.filter((c) => c.url.endsWith("/void_refund/refund")).length, callsBefore + 2);
  assert.equal((await req("/perks", "GET", null, memberCookie)).body.access.eligible, false);
});

test("a success callback for a refunded payment cannot resurrect the subscription", async () => {
  const attempt = await PaymentAttempt.findOne({ order: [["createdAt", "DESC"]] });
  const w = signedWebhook(txnFor(attempt.id, 149));
  await req(w.path, "POST", w.body);
  assert.equal((await Subscription.findByPk(attempt.SubscriptionId)).status, "canceled");
});

test("billing history lists the member's own payments only", async () => {
  const mine = await req("/payments/mine", "GET", null, memberCookie);
  assert.equal(mine.status, 200);
  assert.ok(mine.body.items.length >= 1);
  const other = await req("/payments/mine", "GET", null, adminCookie);
  assert.equal(other.body.items.length, 0);
  assert.equal((await req("/payments/mine")).status, 401);
});

test("maintenance expires abandoned pending payments, ended terms, and sends one renewal reminder", async () => {
  const cookie = await signup("maint@example.test");
  const user = await User.findOne({ where: { email: "maint@example.test" } });
  const { Plan } = await import("./db.js");
  const plus = await Plan.findOne({ where: { code: "plus" } });

  // (a) abandoned pending > 24h
  const stale = await Subscription.create({ UserId: user.id, PlanId: plus.id, billingCycle: "monthly", status: "pending_payment", amountEgp: 149 });
  await Subscription.update({ createdAt: new Date(Date.now() - 25 * 3600_000) }, { where: { id: stale.id }, silent: true });
  // (b) ended active term
  const ended = await Subscription.create({ UserId: user.id, PlanId: plus.id, billingCycle: "monthly", status: "active", amountEgp: 149, startsAt: new Date(Date.now() - 40 * 86400_000), endsAt: new Date(Date.now() - 1000) });
  // (c) ends in 3 days
  const soonUser = await User.findOne({ where: { email: "payer@example.test" } });
  const soon = await Subscription.create({ UserId: soonUser.id, PlanId: plus.id, billingCycle: "monthly", status: "active", amountEgp: 149, startsAt: new Date(), endsAt: new Date(Date.now() + 3 * 86400_000) });

  const deps = { sequelize, Op: (await import("sequelize")).Op, User, Plan, Subscription, PaymentAttempt, notify: async () => {} };
  const stats = await runPaymentMaintenance(deps);
  assert.ok(stats.expiredPending >= 1);
  assert.ok(stats.expiredActive >= 1);
  assert.ok(stats.reminders >= 1);
  assert.equal((await Subscription.findByPk(stale.id)).status, "expired");
  assert.equal((await Subscription.findByPk(ended.id)).status, "expired");
  assert.ok((await Subscription.findByPk(soon.id)).renewalReminderSentAt);

  const again = await runPaymentMaintenance(deps);
  assert.equal(again.reminders, 0, "reminder must be sent only once per term");
  void cookie;
});

// ---- Paid events (tickets) -------------------------------------------------
test("paid event tickets: seat hold, capacity, webhook confirmation, refund releases the seat", async () => {
  const { Registration, Event, Community, Plan } = await import("./db.js");
  const { Op } = await import("sequelize");
  const community = await Community.findOne({ where: { slug: "launchpad" } });
  const startsAt = new Date(Date.now() + 7 * 86400_000).toISOString();
  // Admin validation: a paid event needs a whole positive price.
  for (const bad of [{ priceEgp: 0 }, { priceEgp: -5 }, { priceEgp: 9.5 }, { priceEgp: "abc" }]) {
    const r = await req("/admin/events", "POST", { title: "Bad paid", startsAt, capacity: 1, community: "launchpad", priceType: "paid", ...bad }, adminCookie);
    assert.equal(r.status, 400, JSON.stringify(bad));
  }
  assert.equal((await req("/admin/events", "POST", { title: "Paid by member", startsAt, capacity: 1, community: "launchpad", priceType: "paid", priceEgp: 250 }, memberCookie)).status, 403);
  const created = await req("/admin/events", "POST", { title: "Founders Dinner", startsAt, capacity: 1, community: "launchpad", priceType: "paid", priceEgp: 250 }, adminCookie);
  assert.equal(created.status, 201);
  const eventId = created.body.id;

  const buyer = await signup("ticket-a@example.test");
  const rival = await signup("ticket-b@example.test");
  const attemptsBefore = await PaymentAttempt.count();
  const hold = await req(`/events/${eventId}/register`, "POST", undefined, buyer);
  assert.equal(hold.status, 202);
  assert.equal(hold.body.status, "pending_payment");
  assert.equal(hold.body.amountEgp, 250, "price comes from the event, not the client");
  assert.match(hold.body.checkoutUrl, /^https:\/\/accept\.paymob\.com\/api\/acceptance\/iframes\/999\?payment_token=/);
  assert.equal(await PaymentAttempt.count(), attemptsBefore + 1);
  // Retrying reuses the open hold + attempt.
  const again = await req(`/events/${eventId}/register`, "POST", undefined, buyer);
  assert.equal(again.body.paymentAttemptId, hold.body.paymentAttemptId);
  assert.equal(await PaymentAttempt.count(), attemptsBefore + 1);

  const view = (await req(`/events/${eventId}`, "GET", undefined, buyer)).body.item;
  assert.equal(view.myRegistration.status, "pending_payment");
  assert.equal(view.seatsLeft, 0, "the held seat is not sold twice");
  assert.equal((await req(`/events/${eventId}/ticket`, "GET", undefined, buyer)).status, 404, "no ticket before payment");
  const full = await req(`/events/${eventId}/register`, "POST", undefined, rival);
  assert.equal(full.status, 409);
  assert.equal(full.body.error, "event_full");

  // Wrong amount is refused; the correct signed success issues the ticket.
  const bad = signedWebhook(txnFor(hold.body.paymentAttemptId, 25));
  await req(bad.path, "POST", bad.body);
  assert.equal((await Registration.findOne({ where: { EventId: eventId, status: "registered" } })), null);
  const good = signedWebhook(txnFor(hold.body.paymentAttemptId, 250));
  assert.equal((await req(good.path, "POST", good.body)).status, 200);
  const ticket = await req(`/events/${eventId}/ticket`, "GET", undefined, buyer);
  assert.equal(ticket.status, 200);
  assert.match(ticket.body.ticket.code, /^[0-9A-F]{20}$/);
  const buyerUser = await User.findOne({ where: { email: "ticket-a@example.test" } });
  const mails = (await OutboxMessage.findAll({ where: { kind: "email" } })).map((m) => JSON.parse(m.payload)).filter((p) => p.to === buyerUser.email);
  assert.ok(mails.some((m) => m.template === "eventTicket" && m.args.ticketCode === ticket.body.ticket.code));
  assert.ok(!mails.some((m) => m.template === "subscriptionActive"), "a ticket is not a membership");
  // Duplicate webhook is a no-op (same ticket).
  await req(good.path, "POST", good.body);
  assert.equal((await req(`/events/${eventId}/ticket`, "GET", undefined, buyer)).body.ticket.code, ticket.body.ticket.code);
  // Billing history labels the payment with the event.
  const mine = await req("/payments/mine", "GET", null, buyer);
  assert.equal(mine.body.items[0].event.title, "Founders Dinner");
  assert.equal(mine.body.items[0].status, "paid");

  // A paid ticket cannot be self-cancelled (refund path instead).
  const cancel = await req(`/events/${eventId}/register`, "DELETE", undefined, buyer);
  assert.equal(cancel.status, 409);
  assert.equal(cancel.body.error, "paid_ticket_refund_required");

  // Full refund releases the seat; the rival can now buy.
  const refund = await req(`/admin/payments/${hold.body.paymentAttemptId}/refund`, "POST", {}, adminCookie);
  assert.equal(refund.status, 200);
  assert.equal((await Registration.findOne({ where: { EventId: eventId, UserId: buyerUser.id } })).status, "cancelled");
  const second = await req(`/events/${eventId}/register`, "POST", undefined, rival);
  assert.equal(second.status, 202);

  // Abandoned hold: maintenance releases it after the window.
  await Registration.update({ paymentExpiresAt: new Date(Date.now() - 1000) }, { where: { EventId: eventId, status: "pending_payment" } });
  const stats = await runPaymentMaintenance({ sequelize, Op, User, Plan, Subscription, PaymentAttempt, Registration, Event, notify: async () => {} });
  assert.ok(stats.releasedHolds >= 1);
  assert.equal((await PaymentAttempt.findByPk(second.body.paymentAttemptId)).status, "canceled");
  assert.equal((await req(`/events/${eventId}`, "GET", undefined, rival)).body.item.seatsLeft, 1);
  // Resuming an expired hold's checkout is refused.
  assert.equal((await req(`/payments/checkout/${second.body.paymentAttemptId}`, "POST", undefined, rival)).status, 409);
});