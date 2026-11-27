// Integration tests for the admin/platform-management endpoints added in
// Phase 1/2: plan CRUD (dynamic pricing), user management (suspend/role),
// feature flags, CMS, outbox inspection, audit log, event check-in, and the
// RBAC rules (member denied, admin allowed, super_admin-only role grants).
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
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "usam-admin-"));
process.env.SQLITE_PATH = path.join(temp, "db.sqlite");

const { initDb, sequelize, User, Session, ContactRequest, Report, Post, Subscription, Plan, Perk, PerkApplication } =
  await import("./db.js");
const { default: app } = await import("./index.js");

let server, base, adminCookie, memberCookie, superCookie;
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
async function signup(email) {
  const r = await signupLogin(req, {
    name: "User " + email,
    email,
    password: "abcdef1234",
    persona: "launchpad",
  });
  return r.cookie;
}

before(async () => {
  await initDb();
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  memberCookie = await signup("member@example.test");
  adminCookie = await signup("admin@example.test");
  superCookie = await signup("super@example.test");
  await User.update(
    { role: "admin" },
    { where: { email: "admin@example.test" } },
  );
  await User.update(
    { role: "super_admin" },
    { where: { email: "super@example.test" } },
  );
});
after(async () => {
  server.close();
  await sequelize.close();
  await dropTestDb();
  fs.rmSync(temp, { recursive: true, force: true });
});

test("RBAC: member is denied admin endpoints, admin is allowed", async () => {
  const denied = await req("/admin/overview", "GET", null, memberCookie);
  assert.equal(denied.status, 403);
  const ok = await req("/admin/overview", "GET", null, adminCookie);
  assert.equal(ok.status, 200);
  assert.equal(typeof ok.body.members, "number");
});

test("plans are dynamic: admin can create and update a plan", async () => {
  const list0 = await req("/admin/plans", "GET", null, adminCookie);
  assert.equal(list0.status, 200);
  const before = list0.body.items.length;

  const created = await req("/admin/plans", "POST", {
    code: "elite",
    nameAr: "إيليت",
    nameEn: "Elite",
    monthlyEgp: 999,
    yearlyEgp: 9990,
    featuresEn: ["All Pro features", "Dedicated manager"],
  }, adminCookie);
  assert.equal(created.status, 201);

  const list1 = await req("/admin/plans", "GET", null, adminCookie);
  assert.equal(list1.body.items.length, before + 1);
  const elite = list1.body.items.find((p) => p.code === "elite");
  assert.equal(elite.monthlyEgp, 999);

  // Update price — proves pricing is data-driven, not hardcoded.
  const upd = await req(`/admin/plans/${elite.id}`, "PATCH", {
    monthlyEgp: 1299,
  }, adminCookie);
  assert.equal(upd.status, 200);
  const list2 = await req("/plans");
  const eliteLive = list2.body.items.find((p) => p.code === "elite");
  assert.equal(eliteLive.monthlyEgp, 1299);
});

test("user management: admin suspends and reinstates; role grant is super-admin only", async () => {
  const users = await req("/admin/users?q=member", "GET", null, adminCookie);
  assert.equal(users.status, 200);
  const target = users.body.items.find((u) => u.email === "member@example.test");
  assert.ok(target);

  const suspend = await req(`/admin/users/${target.id}`, "PATCH", {
    action: "suspend",
    reason: "test",
  }, adminCookie);
  assert.equal(suspend.status, 200);

  // Suspended member cannot log in.
  const login = await req("/auth/login", "POST", {
    email: "member@example.test",
    password: "abcdef1234",
  });
  assert.equal(login.status, 403);

  await req(`/admin/users/${target.id}`, "PATCH", { action: "reinstate" }, adminCookie);

  // Admin cannot grant admin role (super-admin only).
  const grantByAdmin = await req(`/admin/users/${target.id}`, "PATCH", {
    action: "set_role",
    role: "admin",
  }, adminCookie);
  assert.equal(grantByAdmin.status, 403);

  // Super admin can.
  const grantBySuper = await req(`/admin/users/${target.id}`, "PATCH", {
    action: "set_role",
    role: "moderator",
  }, superCookie);
  assert.equal(grantBySuper.status, 200);
});

test("an admin cannot suspend or reinstate an admin or super_admin; a super_admin can", async () => {
  const superUser = await User.findOne({ where: { email: "super@example.test" } });
  const adminUser = await User.findOne({ where: { email: "admin@example.test" } });
  await signup("peeradmin@example.test");
  await User.update({ role: "admin" }, { where: { email: "peeradmin@example.test" } });
  const peer = await User.findOne({ where: { email: "peeradmin@example.test" } });
  for (const target of [superUser, peer]) {
    for (const action of ["suspend", "reinstate"]) {
      const r = await req(`/admin/users/${target.id}`, "PATCH", { action, reason: "test" }, adminCookie);
      assert.equal(r.status, 403, `${action} ${target.email}`);
      assert.equal(r.body.error, "super_admin_required");
    }
  }
  assert.equal((await User.findByPk(superUser.id)).status, "active");
  assert.equal((await User.findByPk(peer.id)).status, "active");
  // A super_admin can suspend and reinstate an admin.
  assert.equal((await req(`/admin/users/${peer.id}`, "PATCH", { action: "suspend", reason: "test" }, superCookie)).status, 200);
  assert.equal((await User.findByPk(peer.id)).status, "suspended");
  assert.equal((await req(`/admin/users/${peer.id}`, "PATCH", { action: "reinstate" }, superCookie)).status, 200);
  assert.equal((await User.findByPk(peer.id)).status, "active");
  void adminUser;
});

test("feature flags: admin can toggle a flag", async () => {
  const put = await req("/admin/feature-flags/test_flag", "PUT", {
    enabled: true,
    description: "A test flag",
  }, adminCookie);
  assert.equal(put.status, 200);
  const list = await req("/admin/feature-flags", "GET", null, adminCookie);
  assert.ok(list.body.items.some((f) => f.key === "test_flag" && f.enabled));
});

test("CMS: admin can create a localized entry", async () => {
  const put = await req("/admin/cms/home_hero/en", "PUT", {
    value: "Welcome to USAM",
    status: "published",
  }, adminCookie);
  assert.equal(put.status, 200);
  const list = await req("/admin/cms", "GET", null, adminCookie);
  assert.ok(list.body.items.some((c) => c.key === "home_hero"));
});

test("audit log records admin actions", async () => {
  const audit = await req("/admin/audit", "GET", null, adminCookie);
  assert.equal(audit.status, 200);
  assert.ok(audit.body.items.length > 0);
  assert.ok(audit.body.items.some((a) => a.action === "create_plan"));
});

test("outbox inspection is available to admin", async () => {
  const r = await req("/admin/outbox", "GET", null, adminCookie);
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.items));
});

test("event check-in: creating an event and checking in a ticket", async () => {
  // Admin creates a free event.
  const ev = await req("/admin/events", "POST", {
    title: "Admin Test Event",
    startsAt: new Date(Date.now() + 86400000).toISOString(),
    capacity: 10,
    community: "launchpad",
    description: "Test",
  }, adminCookie);
  assert.equal(ev.status, 201);
  // A member registers to get a ticket code.
  const reg = await req(`/events/${ev.body.id}/register`, "POST", null, adminCookie);
  assert.ok([200, 201].includes(reg.status));
  const ticket = await req(`/events/${ev.body.id}/ticket`, "GET", null, adminCookie);
  assert.equal(ticket.status, 200);
  const code = ticket.body.ticket?.code;
  assert.ok(code);
  // Check in with the ticket code.
  const checkin = await req("/admin/events/check-in", "POST", {
    ticketCode: code,
  }, adminCookie);
  assert.equal(checkin.status, 200);
  assert.equal(checkin.body.ok, true);
  // Re-check-in is idempotent.
  const again = await req("/admin/events/check-in", "POST", {
    ticketCode: code,
  }, adminCookie);
  assert.equal(again.status, 200);
  assert.equal(again.body.alreadyCheckedIn, true);
});

test("admin can create a group and a curated room", async () => {
  const g = await req("/admin/groups", "POST", {
    slug: "test-chapter",
    nameAr: "اختبار",
    nameEn: "Test Chapter",
    type: "chapter",
    visibility: "public",
    community: "launchpad",
    status: "published",
  }, adminCookie);
  assert.ok([200, 201].includes(g.status));
  const r = await req("/admin/curated-rooms", "POST", {
    title: "Test Room",
    description: "desc",
    community: "launchpad",
    capacity: 8,
    status: "open",
  }, adminCookie);
  assert.ok([200, 201].includes(r.status));
});

test("super_admin passes every admin gate that admin passes", async () => {
  for (const route of ["/admin/overview", "/admin/plans", "/admin/users", "/admin/audit"]) {
    const r = await req(route, "GET", null, superCookie);
    assert.equal(r.status, 200, `super_admin should access ${route}`);
  }
});

test("moderator can work the reports queue and remove others' posts but not use admin tools", async () => {
  const modCookie = await signup("mod@example.test");
  const authorCookie = await signup("author@example.test");
  const bystanderCookie = await signup("bystander@example.test");
  await User.update({ role: "moderator" }, { where: { email: "mod@example.test" } });

  // Author joins a community and posts.
  assert.equal((await req("/communities/launchpad/join", "POST", null, authorCookie)).status, 200);
  const post = await req("/posts", "POST", {
    body: "A post that a moderator may need to remove.",
    community: "launchpad",
  }, authorCookie);
  assert.equal(post.status, 201, JSON.stringify(post.body));
  const postId = post.body.id || post.body.item?.id;
  assert.ok(postId);

  // A regular member who is not the author cannot remove it.
  const denied = await req(`/posts/${postId}`, "DELETE", null, bystanderCookie);
  assert.equal(denied.status, 403);

  // Moderator can.
  const removed = await req(`/posts/${postId}`, "DELETE", null, modCookie);
  assert.equal(removed.status, 200);

  // Reports queue: allowed. Admin-only tools: denied.
  assert.equal((await req("/admin/reports", "GET", null, modCookie)).status, 200);
  assert.equal((await req("/admin/overview", "GET", null, modCookie)).status, 403);
  assert.equal((await req("/admin/users", "GET", null, modCookie)).status, 403);
  assert.equal((await req("/admin/plans", "POST", { code: "x1", nameAr: "اختبار", nameEn: "Test" }, modCookie)).status, 403);
});

test("anonymous callers get 401, not 403, on protected admin routes", async () => {
  const r = await req("/admin/overview", "GET");
  assert.equal(r.status, 401);
});

test("search is case-insensitive on every dialect (Postgres LIKE is case-sensitive)", async () => {
  // Names/emails were created lower-case; query in different cases.
  for (const q of ["MEMBER", "Member@Example", "mEmBeR"]) {
    const r = await req(`/admin/users?q=${encodeURIComponent(q)}`, "GET", null, adminCookie);
    assert.equal(r.status, 200);
    assert.ok(
      r.body.items.some((u) => u.email === "member@example.test"),
      `admin user search for "${q}" should match member@example.test`,
    );
  }
});

test("perk catalog: admin can pause/archive/feature a perk and the public catalog reflects it", async () => {
  const list = await req("/admin/perks", "GET", null, adminCookie);
  assert.equal(list.status, 200);
  const perk = list.body.items[0];
  const publicHas = async () => (await req("/perks")).body.items.some((p) => p.id === perk.id);
  assert.equal(await publicHas(), true);

  // Members cannot manage the catalog; bad input is rejected. (Fresh member:
  // `memberCookie`'s sessions were revoked by the earlier suspend test.)
  const plainMember = await signup("perk-member@example.test");
  assert.equal((await req(`/admin/perks/${perk.id}`, "PATCH", { availability: "paused" }, plainMember)).status, 403);
  assert.equal((await req(`/admin/perks/${perk.id}`, "PATCH", { availability: "nonsense" }, adminCookie)).status, 400);
  assert.equal((await req(`/admin/perks/${perk.id}`, "PATCH", { status: "deleted" }, adminCookie)).status, 400);
  assert.equal((await req(`/admin/perks/${perk.id}`, "PATCH", {}, adminCookie)).status, 400);
  assert.equal((await req(`/admin/perks/00000000-0000-0000-0000-000000000000`, "PATCH", { featured: true }, adminCookie)).status, 404);

  // Pause -> disappears publicly; unpause -> back. Archive -> gone.
  assert.equal((await req(`/admin/perks/${perk.id}`, "PATCH", { availability: "paused" }, adminCookie)).status, 200);
  assert.equal(await publicHas(), false);
  assert.equal((await req(`/admin/perks/${perk.id}`, "PATCH", { availability: "available", featured: true }, adminCookie)).status, 200);
  assert.equal(await publicHas(), true);
  assert.equal((await req(`/admin/perks/${perk.id}`, "PATCH", { status: "archived" }, adminCookie)).status, 200);
  assert.equal(await publicHas(), false);
  await req(`/admin/perks/${perk.id}`, "PATCH", { status: "published" }, adminCookie);

  const audit = await req("/admin/audit?pageSize=100", "GET", null, adminCookie);
  assert.ok(audit.body.items.some((a) => a.action === "update_perk"));
});

test("/me/network, /me/groups and /me/room-applications return only the caller's own data", async () => {
  for (const route of ["/me/network", "/me/groups", "/me/room-applications"]) {
    const mine = await req(route, "GET", null, adminCookie);
    assert.equal(mine.status, 200, route);
    assert.ok(Array.isArray(mine.body.items), route);
    assert.equal((await req(route)).status, 401, `${route} must require sign-in`);
  }
});

const login = async (email) =>
  (await req("/auth/login", "POST", { email, password: "abcdef1234" })).cookie;

test("T-21: admin queues page through 120+ rows with no duplicates, even on equal timestamps", async () => {
  // 120 contact requests, 20 of them sharing one timestamp.
  const same = new Date(Date.now() - 3600_000);
  const rows = Array.from({ length: 120 }, (_, i) => ({
    name: `Pager ${i}`,
    email: `pager${i}@example.test`,
    topic: "general",
    message: "paging test",
    createdAt: i < 20 ? same : new Date(Date.now() - (i + 2) * 60_000),
  }));
  await ContactRequest.bulkCreate(rows);
  const seen = new Set();
  let cursor = null, pages = 0;
  do {
    const r = await req(`/admin/contact?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, "GET", null, adminCookie);
    assert.equal(r.status, 200);
    for (const it of r.body.items) {
      assert.ok(!seen.has(it.id), "no duplicate across pages");
      seen.add(it.id);
    }
    cursor = r.body.nextCursor;
    assert.equal(r.body.hasMore, !!cursor);
    pages++;
  } while (cursor && pages < 20);
  const open = await ContactRequest.count({ where: { status: "open" } });
  assert.equal(seen.size, open, "every open request is reachable");
  assert.ok(pages >= 5);
  // A malformed cursor is a 400, not a 500.
  assert.equal((await req("/admin/contact?cursor=not-a-cursor", "GET", null, adminCookie)).status, 400);
  // The reports queue uses the same paging (moderator route).
  const post = await Post.findOne();
  assert.ok(post, "an earlier test created a post to report");
  await Report.bulkCreate(Array.from({ length: 60 }, (_, i) => ({ PostId: post.id, reason: `r${i}`, createdAt: same })));
  const first = await req("/admin/reports?limit=50", "GET", null, adminCookie);
  assert.equal(first.status, 200);
  assert.equal(first.body.items.length, 50);
  assert.ok(first.body.nextCursor);
  const second = await req(`/admin/reports?limit=50&cursor=${encodeURIComponent(first.body.nextCursor)}`, "GET", null, adminCookie);
  const ids = new Set([...first.body.items, ...second.body.items].map((x) => x.id));
  assert.equal(ids.size, first.body.items.length + second.body.items.length);
});

// Walks every page of a keyset-paged admin route; returns the ids in order.
async function walk(route) {
  const order = [];
  let cursor = null, pages = 0;
  do {
    const r = await req(`${route}?limit=25${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`, "GET", null, adminCookie);
    assert.equal(r.status, 200);
    order.push(...r.body.items.map((x) => x.id));
    cursor = r.body.nextCursor;
    assert.equal(r.body.hasMore, !!cursor);
    pages++;
  } while (cursor && pages < 20);
  return order;
}

test("T-21 slice 2: pending subscriptions and perk applications page oldest first past the old caps", async () => {
  const same = new Date(Date.now() - 7200_000);
  const stamp = (i) => (i < 20 ? same : new Date(Date.now() - 7200_000 + (i + 1) * 60_000));
  const plan = await Plan.create({ code: "pager", nameAr: "صفحات", nameEn: "Pager", monthlyEgp: 100, yearlyEgp: 1000 });
  const users = await User.bulkCreate(
    Array.from({ length: 120 }, (_, i) => ({ name: `Sub ${i}`, username: `subpager${i}`, email: `subpager${i}@example.test`, passwordHash: "x" })),
  );
  // 120 pending subscriptions (old cap was 100), 20 on one timestamp.
  await Subscription.bulkCreate(
    users.map((u, i) => ({ UserId: u.id, PlanId: plan.id, billingCycle: "monthly", status: "pending_payment", amountEgp: 100, createdAt: stamp(i) })),
  );
  const subs = await walk("/admin/subscriptions");
  assert.equal(new Set(subs).size, subs.length, "no duplicate across pages");
  assert.equal(subs.length, await Subscription.count({ where: { status: "pending_payment" } }));
  const subRows = await Subscription.findAll({ where: { id: subs } });
  const at = new Map(subRows.map((s) => [s.id, s.createdAt.getTime()]));
  for (let i = 1; i < subs.length; i++) assert.ok(at.get(subs[i - 1]) <= at.get(subs[i]), "oldest first");
  // The API shape the admin page reads is kept.
  const one = await req("/admin/subscriptions?limit=1", "GET", null, adminCookie);
  assert.ok(one.body.items[0].user && one.body.items[0].plan && one.body.items[0].amountEgp === 100);
  assert.equal((await req("/admin/subscriptions?cursor=bad", "GET", null, adminCookie)).status, 400);

  // 210 perk applications (old cap was 200): one perk per 10 users, unique per pair.
  const perks = await Perk.bulkCreate(
    Array.from({ length: 2 }, (_, i) => ({
      slug: `pager-perk-${i}`, provider: "P", providerGroup: "usam", product: "p", category: "c",
      titleAr: "t", titleEn: "t", summaryAr: "s", summaryEn: "s",
    })),
  );
  await PerkApplication.bulkCreate(
    users.slice(0, 105).flatMap((u, i) =>
      perks.map((p) => ({ PerkId: p.id, UserId: u.id, startupName: "S", stage: "idea", useCase: "u", createdAt: stamp(i) })),
    ),
  );
  const apps = await walk("/admin/perk-applications");
  assert.equal(new Set(apps).size, apps.length, "no duplicate across pages");
  assert.equal(apps.length, await PerkApplication.count());
  assert.ok(apps.length > 200, "past the old cap of 200");
  const page1 = await req("/admin/perk-applications?limit=1", "GET", null, adminCookie);
  assert.ok(page1.body.items[0].Perk && page1.body.items[0].User, "perk and member still included");
  assert.equal((await req("/admin/perk-applications?cursor=bad", "GET", null, adminCookie)).status, 400);
});

test("A-03: role change signs the target out of every session", async () => {
  await signup("rolechg@example.test");
  const second = await login("rolechg@example.test");
  const first = await login("rolechg@example.test");
  assert.equal((await req("/users/me/sessions", "GET", null, first)).status, 200);
  assert.equal((await req("/users/me/sessions", "GET", null, second)).status, 200);
  const target = await User.findOne({ where: { email: "rolechg@example.test" } });
  const r = await req(`/admin/users/${target.id}`, "PATCH", { action: "set_role", role: "moderator" }, superCookie);
  assert.equal(r.status, 200);
  // The old cookie now gets "session_ended" (so the UI can say so) and is cleared.
  const ended = await req("/users/me/sessions", "GET", null, first);
  assert.equal(ended.status, 401);
  assert.equal(ended.body.error, "session_ended");
  assert.equal(ended.cookie, "usam_session=");
  assert.equal((await req("/users/me/sessions", "GET", null, second)).status, 401);
  // No cookie at all is still the plain "sign_in_required".
  assert.equal((await req("/users/me/sessions", "GET")).body.error, "sign_in_required");
  assert.equal(await Session.count({ where: { UserId: target.id } }), 0);
  // The audit trail records the revoke with the session count; the acting admin stays signed in.
  const audit = await req("/admin/audit?pageSize=100", "GET", null, superCookie);
  assert.equal(audit.status, 200);
  const row = audit.body.items.find((a) => a.action === "user_sessions_revoked" && /role:moderator/.test(JSON.stringify(a)));
  assert.ok(row, "user_sessions_revoked audit row");
  // 3 = the signup session plus the two logins above.
  assert.match(row.details, /sessions:3/);
  assert.equal((await req("/users/me/sessions", "GET", null, superCookie)).status, 200);
});

test("A-03: suspend revokes every session of a user with two logins", async () => {
  await signup("susp2@example.test");
  const a = await login("susp2@example.test");
  const b = await login("susp2@example.test");
  assert.equal((await req("/users/me/sessions", "GET", null, a)).status, 200);
  assert.equal((await req("/users/me/sessions", "GET", null, b)).status, 200);
  const target = await User.findOne({ where: { email: "susp2@example.test" } });
  const r = await req(`/admin/users/${target.id}`, "PATCH", { action: "suspend", reason: "test" }, adminCookie);
  assert.equal(r.status, 200);
  assert.equal((await req("/users/me/sessions", "GET", null, a)).status, 401);
  assert.equal((await req("/users/me/sessions", "GET", null, b)).status, 401);
  assert.equal(await Session.count({ where: { UserId: target.id } }), 0);
});

test("A-03: staff idle and absolute limits apply; members are unaffected", async () => {
  await signup("staffs@example.test");
  await signup("memberlong@example.test");
  await User.update({ role: "moderator" }, { where: { email: "staffs@example.test" } });
  const idle = await login("staffs@example.test");
  const old = await login("staffs@example.test");
  const member = await login("memberlong@example.test");
  assert.equal((await req("/users/me/sessions", "GET", null, idle)).status, 200);
  const uid = (await User.findOne({ where: { email: "staffs@example.test" } })).id;
  const rows = await Session.findAll({ where: { UserId: uid }, order: [["createdAt", "ASC"]] });
  const hoursAgo = (h) => new Date(Date.now() - h * 3600_000);
  // rows[1] = `idle` session, rows[2] = `old` session (login order).
  const idleRow = rows[rows.length - 2];
  const oldRow = rows[rows.length - 1];
  await Session.update({ lastSeenAt: hoursAgo(1) }, { where: { id: idleRow.id }, silent: true });
  await Session.update({ createdAt: hoursAgo(9), lastSeenAt: new Date() }, { where: { id: oldRow.id }, silent: true });
  assert.equal((await req("/users/me/sessions", "GET", null, idle)).status, 401, "idle > 30 min");
  assert.equal((await req("/users/me/sessions", "GET", null, old)).status, 401, "age > 8 h");
  const mid = (await User.findOne({ where: { email: "memberlong@example.test" } })).id;
  await Session.update({ createdAt: hoursAgo(48), lastSeenAt: hoursAgo(5) }, { where: { UserId: mid }, silent: true });
  assert.equal((await req("/users/me/sessions", "GET", null, member)).status, 200);
});
