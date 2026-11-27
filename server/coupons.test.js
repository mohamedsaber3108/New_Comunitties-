// Coupons / promo codes, end to end through the API, against a MOCKED Paymob
// (same stub shape as payments.test.js). Covers admin validation, quoting,
// every refusal reason, discounted checkout + signed webhook, 100%-off
// activation without a provider, limits (total, per member, concurrent),
// release of abandoned uses, event tickets, reporting and locked terms.
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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "usam-coupon-"));
process.env.SQLITE_PATH = path.join(temp, "db.sqlite");

const realFetch = globalThis.fetch;
const paymobCalls = [];
let nextTxnId = 50000;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (!u.startsWith("https://accept.paymob.com")) return realFetch(url, init);
  const body = init?.body ? JSON.parse(init.body) : {};
  paymobCalls.push({ url: u, body });
  const json = (obj) => new Response(JSON.stringify(obj), { headers: { "Content-Type": "application/json" } });
  if (u.endsWith("/auth/tokens")) return json({ token: "auth-token" });
  if (u.endsWith("/ecommerce/orders")) return json({ id: 7000 + paymobCalls.length });
  if (u.endsWith("/acceptance/payment_keys")) return json({ token: "pay-key-" + body.order_id });
  return json({});
};

const { initDb, sequelize, User, PaymentAttempt, Subscription, Coupon, CouponRedemption, Registration } = await import("./db.js");
const { default: app } = await import("./index.js");

let server, base, adminCookie;
async function req(route, method = "GET", body, cookie, headers = {}) {
  const r = await realFetch(base + "/api/v1" + route, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})), cookie: r.headers.get("set-cookie")?.split(";")[0] };
}
let n = 0;
async function member() {
  const email = `coupon-${++n}-${Date.now()}@example.test`;
  return (await signupLogin(req, { name: `Member ${n}`, email, password: "abcdef1234", persona: "launchpad" })).cookie;
}
const subscribe = (cookie, body) =>
  req("/subscriptions", "POST", { planCode: "plus", billingCycle: "monthly", ...body }, cookie, { "Idempotency-Key": crypto.randomUUID() });
const createCoupon = (body) => req("/admin/coupons", "POST", body, adminCookie);

const HMAC_FIELDS = ["amount_cents","created_at","currency","error_occured","has_parent_transaction","id","integration_id","is_3d_secure","is_auth","is_capture","is_refunded","is_standalone_payment","is_voided","order","owner","pending","source_data_pan","source_data_sub_type","source_data_type","success"];
function signedWebhook(attemptId, amountEgp) {
  const txn = {
    id: ++nextTxnId, amount_cents: amountEgp * 100, currency: "EGP", created_at: "2026-11-18T10:00:00",
    error_occured: false, has_parent_transaction: false, integration_id: 12345, is_3d_secure: true, is_auth: false,
    is_capture: false, is_refunded: false, is_standalone_payment: true, is_voided: false, owner: 1, pending: false,
    success: true, order: { id: 1, merchant_order_id: `usam-${attemptId}` }, source_data: { pan: "1111", sub_type: "Visa", type: "card" },
  };
  const pick = (f) => f === "order" ? txn.order.id : f.startsWith("source_data_") ? txn.source_data[f.slice(12)] : txn[f];
  const concat = HMAC_FIELDS.map((f) => { const v = pick(f); return typeof v === "boolean" ? String(v) : v == null ? "" : String(v); }).join("");
  const hmac = crypto.createHmac("sha512", process.env.PAYMOB_HMAC_SECRET).update(concat).digest("hex");
  return req(`/payments/webhook/paymob?hmac=${hmac}`, "POST", { type: "TRANSACTION", obj: txn });
}

before(async () => {
  await initDb();
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  adminCookie = (await signupLogin(req, { name: "Coupon Admin", email: "coupon-admin@example.test", password: "abcdef1234", persona: "launchpad" })).cookie;
  await User.update({ role: "admin" }, { where: { email: "coupon-admin@example.test" } });
});
after(async () => {
  globalThis.fetch = realFetch;
  server.close();
  await sequelize.close();
  await dropTestDb();
  fs.rmSync(temp, { recursive: true, force: true });
});

test("admin creates coupons with validation; members cannot; codes are unique and case-insensitive", async () => {
  const m = await member();
  assert.equal((await req("/admin/coupons", "POST", { code: "X-MEMBER", discountType: "percent", value: 10 }, m)).status, 403);
  for (const bad of [
    { code: "ab", discountType: "percent", value: 10 },
    { code: "BAD CODE", discountType: "percent", value: 10 },
    { code: "PCT0", discountType: "percent", value: 0 },
    { code: "PCT101", discountType: "percent", value: 101 },
    { code: "FIX", discountType: "fixed", value: 2.5 },
    { code: "TYPE", discountType: "bogus", value: 5 },
    { code: "DATES", discountType: "fixed", value: 5, startsAt: "2027-01-02", expiresAt: "2027-01-01" },
    { code: "PERUSER", discountType: "fixed", value: 5, perUserLimit: 0 },
  ]) assert.equal((await createCoupon(bad)).status, 400, JSON.stringify(bad));
  const ok = await createCoupon({ code: "welcome20", discountType: "percent", value: 20, description: "Launch offer" });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.item.code, "WELCOME20", "stored upper-case");
  assert.equal((await createCoupon({ code: "WELCOME20", discountType: "fixed", value: 5 })).status, 409);
});

test("quote: percent and fixed discounts are computed on the server", async () => {
  const m = await member();
  const pct = await req("/coupons/quote", "POST", { code: "Welcome20", planCode: "plus", billingCycle: "monthly" }, m);
  assert.equal(pct.status, 200);
  assert.deepEqual([pct.body.originalEgp, pct.body.discountEgp, pct.body.finalEgp], [149, 29, 120]);
  await createCoupon({ code: "MINUS50", discountType: "fixed", value: 50 });
  const fix = await req("/coupons/quote", "POST", { code: "minus50", planCode: "pro", billingCycle: "yearly" }, m);
  const plans = (await req("/plans")).body.items;
  const proYear = plans.find((p) => p.code === "pro").yearlyEgp;
  assert.equal(fix.body.finalEgp, proYear - 50);
  // A fixed discount never goes below zero.
  await createCoupon({ code: "HUGE", discountType: "fixed", value: 99999 });
  assert.equal((await req("/coupons/quote", "POST", { code: "HUGE", planCode: "plus", billingCycle: "monthly" }, m)).body.finalEgp, 0);
  assert.equal((await req("/coupons/quote", "POST", { code: "WELCOME20", planCode: "plus", billingCycle: "monthly" })).status, 401);
});

test("every refusal reason is explicit", async () => {
  const m = await member();
  const quote = (code, plan = "plus", cycle = "monthly") => req("/coupons/quote", "POST", { code, planCode: plan, billingCycle: cycle }, m);
  await createCoupon({ code: "PROONLY", discountType: "percent", value: 10, planCodes: ["pro"] });
  await createCoupon({ code: "YEARLY", discountType: "percent", value: 10, billingCycle: "yearly" });
  await createCoupon({ code: "EVENTSONLY", discountType: "percent", value: 10, appliesTo: "event" });
  await createCoupon({ code: "OLD", discountType: "percent", value: 10, expiresAt: new Date(Date.now() - 1000).toISOString() });
  await createCoupon({ code: "SOON", discountType: "percent", value: 10, startsAt: new Date(Date.now() + 86400_000).toISOString() });
  const off = await createCoupon({ code: "PAUSED", discountType: "percent", value: 10 });
  await req(`/admin/coupons/${off.body.item.id}`, "PATCH", { active: false }, adminCookie);
  assert.equal((await quote("NOPE-NOT-REAL")).body.error, "coupon_invalid");
  assert.equal((await quote("x")).body.error, "coupon_invalid");
  assert.equal((await quote("PROONLY")).body.error, "coupon_not_applicable");
  assert.equal((await quote("PROONLY", "pro")).status, 200);
  assert.equal((await quote("YEARLY")).body.error, "coupon_not_applicable");
  assert.equal((await quote("YEARLY", "plus", "yearly")).status, 200);
  assert.equal((await quote("EVENTSONLY")).body.error, "coupon_not_applicable");
  assert.equal((await quote("OLD")).body.error, "coupon_expired");
  assert.equal((await quote("SOON")).body.error, "coupon_not_started");
  assert.equal((await quote("PAUSED")).body.error, "coupon_invalid");
  // The free plan has nothing to discount.
  assert.equal((await quote("WELCOME20", "free")).body.error, "coupon_not_applicable");
  // Checkout refuses the same way (nothing created).
  const before = await PaymentAttempt.count();
  const r = await subscribe(m, { couponCode: "OLD" });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "coupon_expired");
  assert.equal(await PaymentAttempt.count(), before);
});

test("discounted checkout charges the discounted amount; the signed webhook activates and redeems", async () => {
  const m = await member();
  const r = await subscribe(m, { couponCode: "welcome20" });
  assert.equal(r.status, 202);
  assert.equal(r.body.amountEgp, 120);
  assert.equal(r.body.originalEgp, 149);
  const attempt = await PaymentAttempt.findByPk(r.body.paymentAttemptId);
  assert.equal(attempt.amountEgp, 120);
  const order = paymobCalls.filter((c) => c.url.endsWith("/ecommerce/orders")).at(-1);
  assert.equal(order.body.amount_cents, 12000, "Paymob is asked for the discounted amount");
  let red = await CouponRedemption.findOne({ where: { PaymentAttemptId: attempt.id } });
  assert.equal(red.status, "reserved");
  // A webhook for the full price is refused (amount must match what we asked).
  await signedWebhook(attempt.id, 149);
  assert.equal((await Subscription.findByPk(attempt.SubscriptionId)).status, "pending_payment");
  assert.equal((await signedWebhook(attempt.id, 120)).status, 200);
  assert.equal((await Subscription.findByPk(attempt.SubscriptionId)).status, "active");
  red = await CouponRedemption.findByPk(red.id);
  assert.equal(red.status, "redeemed");
  const mine = await req("/payments/mine", "GET", null, m);
  assert.deepEqual(mine.body.items[0].coupon, { code: "WELCOME20", originalEgp: 149, discountEgp: 29 });
  // Per-member limit (default 1): the same member cannot use it again.
  assert.equal((await subscribe(m, { couponCode: "WELCOME20" })).body.error, "coupon_already_used");
});

test("a 100% code activates the plan with no payment provider involved", async () => {
  await createCoupon({ code: "FOUNDERFREE", discountType: "percent", value: 100, planCodes: ["plus"] });
  const m = await member();
  const ordersBefore = paymobCalls.filter((c) => c.url.endsWith("/ecommerce/orders")).length;
  const r = await subscribe(m, { couponCode: "FOUNDERFREE" });
  assert.equal(r.status, 201);
  assert.equal(r.body.status, "active");
  assert.equal(r.body.amountEgp, 0);
  assert.equal(paymobCalls.filter((c) => c.url.endsWith("/ecommerce/orders")).length, ordersBefore);
  const sub = await Subscription.findByPk(r.body.subscriptionId);
  assert.equal(sub.provider, "coupon");
  assert.ok(sub.endsAt > new Date(Date.now() + 27 * 86400_000));
  assert.equal((await req("/perks", "GET", null, m)).body.access.eligible, true, "paid entitlement granted");
  assert.equal(await CouponRedemption.count({ where: { SubscriptionId: sub.id, status: "redeemed" } }), 1);
});

test("total limit counts open checkouts; an abandoned checkout frees its use", async () => {
  await createCoupon({ code: "ONLYONE", discountType: "percent", value: 10, maxRedemptions: 1 });
  const a = await member(), b = await member();
  const first = await subscribe(a, { couponCode: "ONLYONE" });
  assert.equal(first.status, 202);
  assert.equal((await subscribe(b, { couponCode: "ONLYONE" })).body.error, "coupon_exhausted", "an open checkout holds the use");
  // A's checkout is abandoned (payment maintenance / failure closes the attempt).
  await PaymentAttempt.update({ status: "canceled" }, { where: { id: first.body.paymentAttemptId } });
  assert.equal((await subscribe(b, { couponCode: "ONLYONE" })).status, 202, "the use was released");
});

test("parallel checkouts never exceed the total limit", async () => {
  await createCoupon({ code: "RACE2", discountType: "percent", value: 10, maxRedemptions: 2 });
  const members = await Promise.all(Array.from({ length: 6 }, () => member()));
  const results = await Promise.all(members.map((m) => subscribe(m, { couponCode: "RACE2" })));
  assert.equal(results.filter((r) => r.status === 202).length, 2, JSON.stringify(results.map((r) => r.status)));
  assert.ok(results.filter((r) => r.status !== 202).every((r) => r.body.error === "coupon_exhausted"));
});

test("event tickets: partial code discounts the Paymob amount; 100% code issues the ticket, within capacity", async () => {
  const startsAt = new Date(Date.now() + 10 * 86400_000).toISOString();
  const ev = await req("/admin/events", "POST", { title: "Promo Dinner", startsAt, capacity: 2, community: "launchpad", priceType: "paid", priceEgp: 400 }, adminCookie);
  // 40% is the cap (P-05); the name stays for history.
  await createCoupon({ code: "HALFEVENT", discountType: "percent", value: 40, appliesTo: "event" });
  await createCoupon({ code: "COMPTICKET", discountType: "percent", value: 100, appliesTo: "event", perUserLimit: 1 });
  const a = await member(), b = await member(), c = await member();
  assert.equal((await req("/coupons/quote", "POST", { code: "HALFEVENT", eventId: ev.body.id }, a)).body.finalEgp, 240);
  assert.equal((await req("/coupons/quote", "POST", { code: "HALFEVENT", planCode: "plus", billingCycle: "monthly" }, a)).body.error, "coupon_not_applicable");
  const half = await req(`/events/${ev.body.id}/register`, "POST", { couponCode: "HALFEVENT" }, a);
  assert.equal(half.status, 202);
  assert.equal(half.body.amountEgp, 240);
  assert.equal((await PaymentAttempt.findByPk(half.body.paymentAttemptId)).amountEgp, 240);
  await signedWebhook(half.body.paymentAttemptId, 240);
  assert.equal((await req(`/events/${ev.body.id}/ticket`, "GET", undefined, a)).status, 200);
  assert.equal((await CouponRedemption.findOne({ where: { PaymentAttemptId: half.body.paymentAttemptId } })).status, "redeemed");

  const comp = await req(`/events/${ev.body.id}/register`, "POST", { couponCode: "COMPTICKET" }, b);
  assert.equal(comp.status, 200);
  assert.equal(comp.body.status, "registered");
  assert.match((await req(`/events/${ev.body.id}/ticket`, "GET", undefined, b)).body.ticket.code, /^[0-9A-F]{20}$/);
  // Capacity (2) is full: even a 100% code cannot oversell.
  const full = await req(`/events/${ev.body.id}/register`, "POST", { couponCode: "COMPTICKET" }, c);
  assert.equal(full.status, 409);
  assert.equal(full.body.error, "event_full");
  assert.equal(await Registration.count({ where: { EventId: ev.body.id, status: "registered" } }), 2);
});

test("admin reporting: live uses, redemptions, discount given; terms lock once used", async () => {
  const list = (await req("/admin/coupons", "GET", null, adminCookie)).body.items;
  const w = list.find((c) => c.code === "WELCOME20");
  assert.equal(w.redeemed, 1);
  assert.equal(w.discountGivenEgp, 29);
  const one = list.find((c) => c.code === "ONLYONE");
  assert.equal(one.uses, 1, "the abandoned checkout no longer counts");
  const reds = (await req(`/admin/coupons/${one.id}/redemptions`, "GET", null, adminCookie)).body.items;
  assert.deepEqual(reds.map((r) => r.status).sort(), ["released", "reserved"]);
  assert.ok(reds[0].member.email.endsWith("@example.test"));
  // Used coupons: value/code frozen; limits, dates and on/off stay editable.
  assert.equal((await req(`/admin/coupons/${w.id}`, "PATCH", { value: 90 }, adminCookie)).body.error, "coupon_in_use_terms_locked");
  const ext = await req(`/admin/coupons/${w.id}`, "PATCH", { maxRedemptions: 500, expiresAt: new Date(Date.now() + 30 * 86400_000).toISOString() }, adminCookie);
  assert.equal(ext.status, 200);
  assert.equal(ext.body.item.maxRedemptions, 500);
  const unused = list.find((c) => c.code === "YEARLY");
  assert.equal((await req(`/admin/coupons/${unused.id}`, "PATCH", { value: 15 }, adminCookie)).status, 200, "unused coupons stay fully editable");
  assert.equal((await req(`/admin/coupons/${w.id}`, "PATCH", { value: 10 }, await member())).status, 403);
  const audit = (await sequelize.query(`SELECT action FROM "AuditLogs" WHERE action LIKE '%coupon%'`, { type: "SELECT" })).map((r) => r.action);
  assert.ok(audit.includes("create_coupon") && audit.includes("update_coupon") && audit.includes("activate_subscription_with_coupon"));
});

test("P-05 guardrails: 40% cap and price floor on the server; 100% grants still work", async () => {
  // Creation: a percent code above the cap is refused; 40% and 100% are fine.
  const over = await createCoupon({ code: "OVERCAP", discountType: "percent", value: 41 });
  assert.equal(over.status, 400);
  assert.equal(over.body.error, "coupon_above_cap");
  assert.equal((await createCoupon({ code: "ATCAP", discountType: "percent", value: 40 })).status, 201);
  assert.equal((await createCoupon({ code: "SCHOLAR", discountType: "percent", value: 100 })).status, 201);
  // Editing an unused code above the cap is refused too.
  const atcap = (await req("/admin/coupons", "GET", null, adminCookie)).body.items.find((c) => c.code === "ATCAP");
  const edit = await req(`/admin/coupons/${atcap.id}`, "PATCH", { value: 60 }, adminCookie);
  assert.equal(edit.status, 400);
  assert.equal(edit.body.error, "coupon_above_cap");
  // Quote: a fixed code that ends above the cap is refused (100 of 149 = 67%).
  const m = await member();
  await createCoupon({ code: "FIXED100", discountType: "fixed", value: 100 });
  const q = await req("/coupons/quote", "POST", { code: "FIXED100", planCode: "plus", billingCycle: "monthly" }, m);
  assert.equal(q.status, 400);
  assert.equal(q.body.error, "coupon_above_cap");
  // Checkout refuses the same code and creates nothing.
  const before = await PaymentAttempt.count();
  const r = await subscribe(m, { couponCode: "FIXED100" });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "coupon_above_cap");
  assert.equal(await PaymentAttempt.count(), before);
  // Floor: 40% of a 15 EGP ticket leaves 9 EGP, below the 10 EGP floor.
  const startsAt = new Date(Date.now() + 12 * 86400_000).toISOString();
  const cheap = await req("/admin/events", "POST", { title: "Tiny Meetup", startsAt, capacity: 5, community: "launchpad", priceType: "paid", priceEgp: 15 }, adminCookie);
  const floor = await req("/coupons/quote", "POST", { code: "ATCAP", eventId: cheap.body.id }, m);
  assert.equal(floor.status, 400);
  assert.equal(floor.body.error, "coupon_below_floor");
  // A full grant (price 0) is a scholarship: allowed.
  const free = await req("/coupons/quote", "POST", { code: "SCHOLAR", planCode: "plus", billingCycle: "monthly" }, m);
  assert.equal(free.status, 200);
  assert.equal(free.body.finalEgp, 0);
});

test("admin analytics reflect real activity and are admin-only", async () => {
  const m = await member();
  assert.equal((await req("/admin/analytics?days=30", "GET", null, m)).status, 403);
  assert.equal((await req("/admin/analytics?days=13", "GET", null, adminCookie)).status, 400);
  const a = await req("/admin/analytics?days=30", "GET", null, adminCookie);
  assert.equal(a.status, 200);
  const d = a.body;
  assert.equal(d.growth.newMembersByDay.length, 30);
  assert.equal(d.growth.totalMembers, await User.count({ where: { isDeleted: false } }));
  assert.equal(d.growth.newMembersByDay.reduce((s, x) => s + x.value, 0), d.growth.newMembers);
  // Revenue = what the signed webhooks confirmed in this file: 120 (plan) + 240 (event).
  assert.equal(d.revenue.plansEgp, 120);
  assert.equal(d.revenue.eventsEgp, 240);
  assert.equal(d.revenue.netEgp, 360);
  assert.equal(d.revenue.netByDay.reduce((s, x) => s + x.value, 0), 360);
  // Coupon discount given = redeemed rows: 29 + 149 (100% plan) + 160 (40% event) + 400.
  assert.equal(d.revenue.couponDiscountEgp, 29 + 149 + 160 + 400);
  assert.ok(d.segments.byPlan.plus >= 2);
  assert.equal(d.segments.byRole.admin, 1);
  assert.ok(d.funnel.signedUp >= d.funnel.verified && d.funnel.signedUp >= d.funnel.paid);
  assert.equal(d.funnel.paid, 2, "two members completed a real payment");
  const d7 = (await req("/admin/analytics?days=7", "GET", null, adminCookie)).body;
  assert.equal(d7.growth.newMembersByDay.length, 7);
});