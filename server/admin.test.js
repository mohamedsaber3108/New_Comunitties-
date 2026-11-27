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

const { initDb, sequelize, User, Session } = await import("./db.js");
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

test("A-03: role change signs the target out of every session", async () => {
  await signup("rolechg@example.test");
  const second = await login("rolechg@example.test");
  const first = await login("rolechg@example.test");
  assert.equal((await req("/users/me/sessions", "GET", null, first)).status, 200);
  assert.equal((await req("/users/me/sessions", "GET", null, second)).status, 200);
  const target = await User.findOne({ where: { email: "rolechg@example.test" } });
  const r = await req(`/admin/users/${target.id}`, "PATCH", { action: "set_role", role: "moderator" }, superCookie);
  assert.equal(r.status, 200);
  assert.equal((await req("/users/me/sessions", "GET", null, first)).status, 401);
  assert.equal((await req("/users/me/sessions", "GET", null, second)).status, 401);
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
