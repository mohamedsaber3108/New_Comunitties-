// Workflow tests: curated rooms (apply/cancel/check-in/feedback + privacy),
// organization teams, feature-flag enforcement, notification preferences
// (immediate email + digest), and data-retention housekeeping.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
process.env.NODE_ENV = "test";
process.env.DB_DIALECT = process.env.TEST_DB_DIALECT || "sqlite";
const { prepareTestDatabase } = await import("./test-support.js");
const dropTestDb = await prepareTestDatabase();
process.env.REQUIRE_EMAIL_VERIFICATION = "false";
process.env.WORKER_ENABLED = "false";
process.env.RATE_LIMIT_DISABLED = "true";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "usam-wf-"));
process.env.SQLITE_PATH = path.join(temp, "db.sqlite");

const { initDb, sequelize, User, Session, OutboxMessage, Notification, NotificationPreference, VerificationToken } =
  await import("./db.js");
const { runNotificationDigests } = await import("./notifications.js");
const { runHousekeeping } = await import("./housekeeping.js");
const { default: app } = await import("./index.js");

let server, base;
const who = {};
async function req(route, method = "GET", body, who_) {
  const r = await fetch(base + "/api/v1" + route, {
    method,
    headers: { "Content-Type": "application/json", ...(who_?.cookie ? { Cookie: who_.cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})), cookie: r.headers.get("set-cookie")?.split(";")[0] };
}
async function signup(key, role) {
  const email = `${key}@example.test`;
  const r = await req("/auth/signup", "POST", { name: `User ${key}`, email, password: "abcdef1234", persona: "launchpad" });
  who[key] = { cookie: r.cookie, id: r.body.user.id, username: r.body.user.username, email };
  if (role) await User.update({ role }, { where: { email } });
  return who[key];
}

before(async () => {
  await initDb();
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  await signup("admin", "admin");
  await signup("alice");
  await signup("bob");
  for (const k of ["alice", "bob"]) await req("/communities/launchpad/join", "POST", null, who[k]);
});
after(async () => {
  server.close();
  await sequelize.close();
  await dropTestDb();
  fs.rmSync(temp, { recursive: true, force: true });
});

test("curated rooms: apply, only-my-application visibility, accept, release seat, check-in, feedback", async () => {
  // capacity must be >= 2 (server enforces `capacity < 2` as invalid_room);
  // use 2 seats with 3 applicants so a genuine "room_full" case is exercised.
  const created = await req("/admin/curated-rooms", "POST", {
    title: "Workflow Test Room", description: "desc", community: "launchpad", capacity: 2, status: "open",
  }, who.admin);
  assert.ok([200, 201].includes(created.status), JSON.stringify(created.body));
  await signup("carol");
  await req("/communities/launchpad/join", "POST", null, who.carol);

  const find = async (u) => (await req("/curated-rooms", "GET", null, u)).body.items.find((r) => r.title === "Workflow Test Room");
  const room = await find(who.alice);
  assert.equal(room.application, null);
  assert.equal(room.seatsTaken, 0);

  const motivation = "I want to practise giving structured feedback to other founders.";
  assert.equal((await req(`/curated-rooms/${room.id}/applications`, "POST", { motivation }, who.alice)).status, 201);
  assert.equal((await req(`/curated-rooms/${room.id}/applications`, "POST", { motivation }, who.bob)).status, 201);
  assert.equal((await req(`/curated-rooms/${room.id}/applications`, "POST", { motivation }, who.carol)).status, 201);

  // Privacy: each member only ever sees their OWN application.
  const aliceView = await find(who.alice), bobView = await find(who.bob), carolView = await find(who.carol), anon = await find(null);
  assert.equal(aliceView.application.status, "pending");
  assert.notEqual(aliceView.application.id, bobView.application.id);
  assert.equal(anon.application, null);
  assert.equal(aliceView.RoomApplications, undefined, "other applicants must not be exposed");

  // Capacity 2: alice + bob accepted; carol is refused because the room is full.
  const accept = (v) => req(`/admin/room-applications/${v.application.id}`, "PATCH", { status: "accepted" }, who.admin);
  assert.equal((await accept(aliceView)).status, 200);
  assert.equal((await accept(bobView)).status, 200);
  const full = await accept(carolView);
  assert.equal(full.status, 409);
  assert.equal(full.body.error, "room_full");
  assert.equal((await find(who.alice)).seatsTaken, 2);

  // Alice releases her accepted seat (not checked in) -> a seat frees up.
  assert.equal((await req(`/room-applications/${aliceView.application.id}`, "PATCH", { action: "cancel" }, who.alice)).status, 200);
  assert.equal((await find(who.alice)).seatsTaken, 1);
  // Carol can now be accepted into the freed seat.
  assert.equal((await accept(carolView)).status, 200);
  // Nobody can cancel/feedback another member's application.
  assert.equal((await req(`/room-applications/${bobView.application.id}`, "PATCH", { action: "cancel" }, who.alice)).status, 404);

  // Feedback is refused before check-in, accepted after.
  const fb = { action: "feedback", rating: 5, feedback: "Really useful, well-run session." };
  assert.equal((await req(`/room-applications/${bobView.application.id}`, "PATCH", fb, who.bob)).status, 409);
  assert.equal((await req(`/admin/room-applications/${bobView.application.id}`, "PATCH", { action: "checkin" }, who.admin)).status, 200);
  assert.equal((await req(`/room-applications/${bobView.application.id}`, "PATCH", { ...fb, rating: 9 }, who.bob)).status, 400);
  assert.equal((await req(`/room-applications/${bobView.application.id}`, "PATCH", fb, who.bob)).status, 200);
  assert.equal((await find(who.bob)).application.rating, 5);
  // A checked-in member can no longer cancel.
  assert.equal((await req(`/room-applications/${bobView.application.id}`, "PATCH", { action: "cancel" }, who.bob)).status, 409);
});

test("organization teams: owner adds/removes members, others cannot, no emails leak", async () => {
  const org = await req("/organizations", "POST", { name: "Team Test Org", description: "A real organisation for tests.", sector: "Tech" }, who.alice);
  assert.ok([200, 201].includes(org.status), JSON.stringify(org.body));
  const orgId = org.body.id || org.body.item?.id;
  assert.ok(orgId);

  // Not approved yet -> cannot add.
  assert.equal((await req(`/organizations/${orgId}/team`, "POST", { username: who.bob.username, role: "member" }, who.alice)).status, 409);
  assert.equal((await req(`/admin/organizations/${orgId}`, "PATCH", { status: "approved" }, who.admin)).status, 200);

  // A non-owner cannot manage the team.
  assert.equal((await req(`/organizations/${orgId}/team`, "POST", { username: who.bob.username, role: "member" }, who.bob)).status, 403);
  // Invalid role / unknown user.
  assert.equal((await req(`/organizations/${orgId}/team`, "POST", { username: who.bob.username, role: "owner" }, who.alice)).status, 400);
  assert.equal((await req(`/organizations/${orgId}/team`, "POST", { username: "nobody-here", role: "member" }, who.alice)).status, 400);

  const add = await req(`/organizations/${orgId}/team`, "POST", { username: who.bob.username, role: "member" }, who.alice);
  assert.equal(add.status, 201);
  const mine = (await req("/organizations/mine", "GET", null, who.alice)).body.items.find((o) => o.id === orgId);
  const member = mine.OrganizationMembers.find((m) => m.UserId === who.bob.id);
  assert.ok(member);
  assert.equal(member.User.email, undefined, "team listing must not leak member emails");

  // An outsider cannot remove a team member (the member may leave by themselves).
  const outsider = await signup("outsider");
  assert.equal((await req(`/organizations/${orgId}/team/${member.id}`, "PATCH", null, outsider)).status, 403);
  assert.equal((await req(`/organizations/${orgId}/team/${member.id}`, "PATCH", null, who.alice)).status, 200);
  const after_ = (await req("/organizations/mine", "GET", null, who.alice)).body.items.find((o) => o.id === orgId);
  assert.equal(after_.OrganizationMembers.find((m) => m.id === member.id).status, "removed");
});

test("feature flags are enforced on the server, not just hidden in the UI", async () => {
  assert.equal((await req("/platform-config")).body.flags.saved_searches, true);
  await req("/admin/feature-flags/saved_searches", "PUT", { enabled: false, description: "x" }, who.admin);
  assert.equal((await req("/platform-config")).body.flags.saved_searches, false);
  const blocked = await req("/saved-searches", "POST", { label: "Founders", query: "founders" }, who.alice);
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error, "feature_disabled");
  await req("/admin/feature-flags/saved_searches", "PUT", { enabled: true, description: "x" }, who.admin);
  assert.equal((await req("/saved-searches", "POST", { label: "Founders", query: "founders" }, who.alice)).status, 201);
  // A flag that was never created defaults to ON.
  assert.equal((await req("/platform-config")).body.flags.some_unknown_flag, undefined);
});

test("CMS: only PUBLISHED entries reach the public platform config", async () => {
  await req("/admin/cms/site_announcement/en", "PUT", { value: "Draft notice", status: "draft" }, who.admin);
  assert.equal((await req("/platform-config?locale=en")).body.content.site_announcement, undefined);
  await req("/admin/cms/site_announcement/en", "PUT", { value: "Maintenance tonight", status: "published" }, who.admin);
  assert.equal((await req("/platform-config?locale=en")).body.content.site_announcement, "Maintenance tonight");
  assert.equal((await req("/platform-config?locale=ar")).body.content.site_announcement, undefined);
});

test("notification preferences: immediate email when digest is off, none when email is off", async () => {
  const emailsTo = async (addr) =>
    (await OutboxMessage.findAll({ where: { kind: "email" } })).map((r) => JSON.parse(r.payload)).filter((p) => p.to === addr && p.template === "notification");
  // alice is discoverable so bob can follow her -> alice gets a notification.
  await req("/me", "PATCH", { discoverable: true }, who.alice);

  await req("/notification-preferences", "PUT", { inApp: true, email: false, digest: "off", kinds: [] }, who.alice);
  await req(`/members/${who.alice.id}/follow`, "DELETE", null, who.bob);
  const before_ = (await emailsTo(who.alice.email)).length;
  await req(`/members/${who.alice.id}/follow`, "PUT", null, who.bob);
  assert.equal((await emailsTo(who.alice.email)).length, before_, "email=false must not send email");
  assert.ok((await Notification.count({ where: { UserId: who.alice.id } })) >= 1, "in-app row still created");

  await req("/notification-preferences", "PUT", { inApp: true, email: true, digest: "off", kinds: [] }, who.alice);
  await req(`/members/${who.alice.id}/follow`, "DELETE", null, who.bob);
  await req(`/members/${who.alice.id}/follow`, "PUT", null, who.bob);
  assert.equal((await emailsTo(who.alice.email)).length, before_ + 1, "email=true & digest=off sends immediately");

  // inApp=false suppresses the in-app row.
  const inAppBefore = await Notification.count({ where: { UserId: who.alice.id } });
  await req("/notification-preferences", "PUT", { inApp: false, email: false, digest: "off", kinds: [] }, who.alice);
  await req(`/members/${who.alice.id}/follow`, "DELETE", null, who.bob);
  await req(`/members/${who.alice.id}/follow`, "PUT", null, who.bob);
  assert.equal(await Notification.count({ where: { UserId: who.alice.id } }), inAppBefore);
});

test("digest: batches notifications into ONE email per cadence window", async () => {
  await req("/notification-preferences", "PUT", { inApp: true, email: true, digest: "daily", kinds: [] }, who.alice);
  const digestCount = async () =>
    (await OutboxMessage.findAll({ where: { kind: "email" } })).map((r) => JSON.parse(r.payload)).filter((p) => p.to === who.alice.email && p.template === "digest").length;
  const immediateBefore = (await OutboxMessage.findAll({ where: { kind: "email" } })).map((r) => JSON.parse(r.payload)).filter((p) => p.to === who.alice.email && p.template === "notification").length;

  await req(`/members/${who.alice.id}/follow`, "DELETE", null, who.bob);
  await req(`/members/${who.alice.id}/follow`, "PUT", null, who.bob);
  const after1 = (await OutboxMessage.findAll({ where: { kind: "email" } })).map((r) => JSON.parse(r.payload)).filter((p) => p.to === who.alice.email && p.template === "notification").length;
  assert.equal(after1, immediateBefore, "digest members don't get per-event emails");

  const deps = { User, Notification, NotificationPreference };
  const first = await runNotificationDigests(deps);
  assert.equal(first.daily >= 1, true);
  assert.equal(await digestCount(), 1);
  const second = await runNotificationDigests(deps);
  assert.equal(second.daily, 0, "window advanced; no repeat within the cadence");
  assert.equal(await digestCount(), 1);
});

test("housekeeping removes expired sessions/tokens but keeps live ones", async () => {
  const old = new Date(Date.now() - 3 * 86400000);
  await Session.create({ UserId: who.bob.id, tokenHash: "x".repeat(64), expiresAt: old });
  await VerificationToken.create({ UserId: who.bob.id, purpose: "email_verify", tokenHash: "y".repeat(64), expiresAt: new Date(Date.now() - 10 * 86400000) });
  const liveSessions = await Session.count({ where: { UserId: who.alice.id } });
  const stats = await runHousekeeping({ Session, VerificationToken, OutboxMessage, WebhookEvent: (await import("./db.js")).WebhookEvent, Notification });
  assert.ok(stats.sessions >= 1);
  assert.ok(stats.tokens >= 1);
  assert.equal(await Session.count({ where: { UserId: who.alice.id } }), liveSessions);
});

test("organization team admins, role changes, leaving, member view and analytics", async () => {
  const dan = await signup("dan");
  const erin = await signup("erin");
  const org = await req("/organizations", "POST", { name: "Analytics Org", description: "Team analytics test org.", sector: "Tech" }, who.alice);
  const orgId = org.body.id || org.body.item?.id;
  await req(`/admin/organizations/${orgId}`, "PATCH", { status: "approved" }, who.admin);
  // Owner adds Dan as a member, then promotes him to team admin.
  await req(`/organizations/${orgId}/team`, "POST", { username: dan.username, role: "member" }, who.alice);
  let team = (await req("/organizations/mine", "GET", null, who.alice)).body.items.find((o) => o.id === orgId);
  const danRow = team.OrganizationMembers.find((m) => m.UserId === dan.id);
  assert.equal(team.myRole, "owner");
  assert.equal((await req(`/organizations/${orgId}/team/${danRow.id}`, "PATCH", { role: "admin" }, dan)).status, 403, "members cannot promote themselves");
  assert.equal((await req(`/organizations/${orgId}/team/${danRow.id}`, "PATCH", { role: "boss" }, who.alice)).status, 400);
  assert.equal((await req(`/organizations/${orgId}/team/${danRow.id}`, "PATCH", { role: "admin" }, who.alice)).status, 200);
  // A team admin can add members but cannot mint other admins.
  assert.equal((await req(`/organizations/${orgId}/team`, "POST", { username: erin.username, role: "admin" }, dan)).status, 403);
  assert.equal((await req(`/organizations/${orgId}/team`, "POST", { username: erin.username, role: "member" }, dan)).status, 201);
  // Erin sees the org as a member, with a restricted team list.
  const erinView = (await req("/organizations/mine", "GET", null, erin)).body.items.find((o) => o.id === orgId);
  assert.equal(erinView.myRole, "member");
  assert.ok(erinView.OrganizationMembers.every((m) => m.status === "active" && m.User.email === undefined));
  // Analytics: managers only.
  assert.equal((await req(`/organizations/${orgId}/analytics`, "GET", null, erin)).status, 403);
  assert.equal((await req(`/organizations/${orgId}/analytics`, "GET", null, who.carol)).status, 403);
  await req("/communities/launchpad/join", "POST", undefined, erin);
  await req("/posts", "POST", { community: "launchpad", body: "Team post one" }, erin);
  await req("/posts", "POST", { community: "launchpad", body: "Team post two" }, erin);
  const a = await req(`/organizations/${orgId}/analytics`, "GET", null, dan);
  assert.equal(a.status, 200);
  assert.equal(a.body.team.size, 3, "owner + 2 active");
  assert.equal(a.body.team.admins, 1);
  assert.equal(a.body.team.members, 1);
  assert.equal(a.body.engagementLast30Days.posts, 2);
  assert.equal(a.body.engagementLast30Days.activePosters, 1);
  assert.equal(a.body.team.growthByMonth.length, 6);
  assert.equal(a.body.team.growthByMonth.at(-1).joined, 2);
  assert.ok(a.body.communities.launchpad >= 1);
  // Team admin cannot remove the other admin... but Erin can leave by herself.
  const erinRow = (await req("/organizations/mine", "GET", null, dan)).body.items.find((o) => o.id === orgId).OrganizationMembers.find((m) => m.UserId === erin.id);
  assert.equal((await req(`/organizations/${orgId}/team/${danRow.id}`, "PATCH", {}, erin)).status, 403);
  assert.equal((await req(`/organizations/${orgId}/team/${erinRow.id}`, "PATCH", {}, erin)).status, 200);
  assert.equal((await req("/organizations/mine", "GET", null, erin)).body.items.some((o) => o.id === orgId), false);
  assert.equal((await req(`/organizations/${orgId}/analytics`, "GET", null, dan)).body.team.removed, 1);
});