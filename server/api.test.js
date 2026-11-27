import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
process.env.NODE_ENV = "test";
process.env.DB_DIALECT = process.env.TEST_DB_DIALECT || "sqlite";
const { prepareTestDatabase, signupLogin } = await import("./test-support.js");
const dropTestDb = await prepareTestDatabase();
// This suite exercises business logic with freshly signed-up users. Email
// verification gating is covered explicitly in identity.test.js (gate ON).
process.env.REQUIRE_EMAIL_VERIFICATION = "false";
process.env.WORKER_ENABLED = "false";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "usam-test-"));
process.env.SQLITE_PATH = path.join(temp, "db.sqlite");
const { initDb, sequelize, User, Community, Event, Offer, Post, Subscription } =
  await import("./db.js");
const { default: app } = await import("./index.js");
let server, base, cookie, cookie2, community, superCookie;
async function request(route, method = "GET", body, authCookie = cookie) {
  const r = await fetch(base + "/api/v1" + route, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(authCookie ? { Cookie: authCookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: r.status,
    body: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
// Two-person manual activation: the admin files a request, a different
// super_admin approves it. Returns the approval response.
async function activateVia(subscriptionId) {
  if (!superCookie) {
    const s = await request(
      "/auth/signup",
      "POST",
      { name: "Second Approver", email: "approver@example.test", password: "StrongPass123!", persona: "launchpad" },
      null,
    );
    await User.update({ role: "super_admin" }, { where: { email: "approver@example.test" } });
    superCookie = s.cookie;
  }
  const asked = await request(`/admin/subscriptions/${subscriptionId}/activate`, "PATCH", {
    confirmed: true,
    reason: "payment confirmed by bank transfer",
  });
  assert.equal(asked.status, 201);
  return request(`/admin/approvals/${asked.body.id}/approve`, "POST", {}, superCookie);
}
before(async () => {
  await initDb();
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  community = await Community.findOne({ where: { slug: "launchpad" } });
});
after(async () => {
  server.close();
  await sequelize.close();
  await dropTestDb();
  fs.rmSync(temp, { recursive: true, force: true });
});
test("account, community membership, feed and authorization persist", async () => {
  // Sign-up is neutral: 202, no session; the member then signs in.
  const first = await request("/auth/signup", "POST", {
    name: "Demo Founder",
    email: "demo@example.test",
    password: "StrongPass123!",
    persona: "launchpad",
  });
  assert.equal(first.status, 202);
  assert.equal(first.cookie, undefined);
  const dup = await request("/auth/signup", "POST", {
    name: "Someone Else",
    email: "demo@example.test",
    password: "StrongPass123!",
    persona: "launchpad",
  });
  assert.equal(dup.status, 202, "an existing address gets the same reply (no 409)");
  assert.deepEqual(dup.body, first.body);
  // The flag is a deployment setting, the same for both callers.
  assert.equal(typeof first.body.emailVerification, "boolean");
  assert.equal(dup.cookie, undefined);
  assert.equal(await User.count({ where: { email: "demo@example.test" } }), 1);
  let signup = await request("/auth/login", "POST", {
    email: "demo@example.test",
    password: "StrongPass123!",
  });
  assert.equal(signup.status, 200);
  cookie = signup.cookie;
  assert.ok(cookie.startsWith("usam_session="));
  const forbidden = await request("/posts", "POST", {
    community: "launchpad",
    body: "A real question for the community",
  });
  assert.equal(forbidden.status, 403);
  let join = await request("/communities/launchpad/join", "POST");
  assert.equal(join.body.joined, true);
  let created = await request("/posts", "POST", {
    community: "launchpad",
    body: "A real question for the community",
  });
  assert.equal(created.status, 201);
  const list = await request("/posts?community=launchpad");
  assert.equal(list.body.items.length, 1);
  assert.equal(list.body.items[0].body, "A real question for the community");
  let signup2 = await signupLogin(request, {
    name: "Other Member",
    email: "other@example.test",
    password: "StrongPass123!",
    persona: "studentzone",
  });
  assert.equal(signup2.status, 200);
  cookie2 = signup2.cookie;
  const denied = await request(
    `/posts/${created.body.id}`,
    "DELETE",
    undefined,
    cookie2,
  );
  assert.equal(denied.status, 403);
  const comment = await request(
    `/posts/${created.body.id}/comments`,
    "POST",
    { body: "Interesting idea!" },
    cookie2,
  );
  assert.equal(comment.status, 201);
  const notif = await request("/notifications");
  assert.equal(notif.body.items.length, 1);
  const post = await request(`/posts/${created.body.id}`);
  assert.equal(post.body.item.comments.length, 1);
  const out = await request("/auth/logout", "POST");
  assert.equal(out.status, 200);
  const anonymous = await request("/me", "GET", undefined, null);
  assert.equal(anonymous.body.user, null);
});
test("free event capacity, offer claim idempotency and admin gates", async () => {
  const relog = await request(
    "/auth/login",
    "POST",
    { email: "demo@example.test", password: "StrongPass123!" },
    null,
  );
  cookie = relog.cookie;
  const event = await Event.create({
    title: "Community Session",
    description: "",
    startsAt: new Date(Date.now() + 86400000),
    capacity: 1,
    status: "published",
    priceType: "free",
    CommunityId: community.id,
  });
  let one = await request(`/events/${event.id}/register`, "POST");
  assert.equal(one.body.status, "registered");
  let two = await request(
    `/events/${event.id}/register`,
    "POST",
    undefined,
    cookie2,
  );
  assert.equal(two.body.status, "waitlisted");
  let cancel = await request(`/events/${event.id}/register`, "DELETE");
  assert.equal(cancel.body.status, "cancelled");
  // The waitlisted member is promoted; they see it as THEIR registration.
  let promoted = await request(`/events/${event.id}`, "GET", undefined, cookie2);
  assert.equal(promoted.body.item.myRegistration.status, "registered");
  assert.equal(promoted.body.item.registeredCount, 1);
  // Public event JSON never exposes other attendees or ticket codes.
  const anon = await fetch(`${base}/api/v1/events/${event.id}`).then((r) => r.text());
  assert.ok(!/ticketCode|Registrations|UserId/.test(anon), "no attendee data in public event JSON");
  const list = await fetch(`${base}/api/v1/events`).then((r) => r.text());
  assert.ok(!/ticketCode|Registrations/.test(list), "no attendee data in the public event list");
  const offer = await Offer.create({
    title: "Development perk",
    quantity: 1,
    status: "published",
  });
  let claim = await request(`/offers/${offer.id}/claim`, "POST");
  assert.equal(claim.status, 200);
  let repeated = await request(`/offers/${offer.id}/claim`, "POST");
  assert.equal(repeated.body.claimId, claim.body.claimId);
  let full = await request(
    `/offers/${offer.id}/claim`,
    "POST",
    undefined,
    cookie2,
  );
  assert.equal(full.status, 409);
  assert.equal((await request("/admin/overview")).status, 403);
});
test("challenge submission and mentor review honor membership and admin roles", async () => {
  const member = await User.findOne({ where: { email: "demo@example.test" } });
  await member.update({ role: "admin" });
  const created = await request("/admin/challenges", "POST", {
    title: "Build a useful idea",
    description: "Describe a solution to a real professional challenge.",
    community: "launchpad",
    deadline: new Date(Date.now() + 86400000),
  });
  assert.equal(created.status, 201);
  const denied = await request(
    `/challenges/${created.body.id}/submissions`,
    "POST",
    { body: "A sufficiently detailed proposal by another member" },
    cookie2,
  );
  assert.equal(denied.status, 403);
  const submission = await request(
    `/challenges/${created.body.id}/submissions`,
    "POST",
    { body: "A proposed collaborative solution with a practical next step" },
  );
  assert.equal(submission.status, 201);
  const reviewed = await request(
    `/admin/submissions/${submission.body.id}`,
    "PATCH",
    { feedback: "Thank you for the contribution." },
  );
  assert.equal(reviewed.status, 200);
  const result = await request(`/challenges/${created.body.id}`);
  assert.equal(result.body.mine.status, "reviewed");
  const mentor = await request(
    "/mentors",
    "POST",
    { expertise: "Startup strategy", availability: "Weekday afternoons" },
    cookie2,
  );
  assert.equal(mentor.status, 200);
  const pending = await request("/admin/mentors");
  assert.ok(pending.body.items.some((m) => m.id === mentor.body.id));
  const approve = await request(`/admin/mentors/${mentor.body.id}`, "PATCH", {
    published: true,
  });
  assert.equal(approve.status, 200);
  const directory = await request("/mentors");
  assert.ok(directory.body.items.some((m) => m.id === mentor.body.id));
});
test("messaging requires consent, shared community and respects blocks", async () => {
  const author = await User.findOne({ where: { email: "demo@example.test" } });
  const peer = await User.findOne({ where: { email: "other@example.test" } });
  const beforeConsent = await request("/messages/start", "POST", {
    username: peer.username,
  });
  assert.equal(beforeConsent.status, 403);
  await request("/me", "PATCH", { messagesEnabled: true, discoverable: true });
  await request(
    "/me",
    "PATCH",
    { messagesEnabled: true, discoverable: true },
    cookie2,
  );
  const noShared = await request("/messages/start", "POST", {
    username: peer.username,
  });
  assert.equal(noShared.status, 403);
  await request("/communities/launchpad/join", "POST", undefined, cookie2);
  const conversation = await request("/messages/start", "POST", {
    username: peer.username,
  });
  assert.equal(conversation.status, 200);
  const sent = await request(`/messages/${conversation.body.id}`, "POST", {
    body: "Hello from the shared community",
  });
  assert.equal(sent.status, 201);
  const inbox = await request(
    `/messages/${conversation.body.id}`,
    "GET",
    undefined,
    cookie2,
  );
  assert.equal(inbox.body.items[0].body, "Hello from the shared community");
  const block = await request(
    `/members/${author.id}/block`,
    "PUT",
    undefined,
    cookie2,
  );
  assert.equal(block.body.blocked, true);
  const blockedSend = await request(
    `/messages/${conversation.body.id}`,
    "POST",
    { body: "Should not be sent" },
  );
  assert.equal(blockedSend.status, 403);
  const unblock = await request(
    `/members/${author.id}/block`,
    "DELETE",
    undefined,
    cookie2,
  );
  assert.equal(unblock.body.blocked, false);
});
test("follow feed is opt-in to a visible member and blocks remove the connection", async () => {
  const peer = await User.findOne({ where: { email: "other@example.test" } });
  const followed = await request(`/members/${peer.id}/follow`, "PUT");
  assert.equal(followed.status, 200);
  const network = await request("/me/network");
  assert.equal(network.body.items.length, 1);
  const peerPost = await request(
    "/posts",
    "POST",
    { community: "launchpad", body: "A new shared-community update" },
    cookie2,
  );
  assert.equal(peerPost.status, 201);
  const following = await request("/posts?mode=following");
  assert.equal(following.body.items.length, 1);
  const block = await request(`/members/${peer.id}/block`, "PUT");
  assert.equal(block.status, 200);
  const hidden = await request("/posts?mode=following");
  assert.equal(hidden.body.items.length, 0);
  const denied = await request(`/members/${peer.username}`);
  assert.equal(denied.status, 404);
});
test("member overview, activity and events are private and reflect actual actions", async () => {
  const anon = await request("/activity", "GET", undefined, null);
  assert.equal(anon.status, 401);
  const user = await User.findOne({ where: { email: "demo@example.test" } });
  const summary = await request("/me/summary");
  assert.equal(summary.body.joinedCount, 1);
  assert.ok(summary.body.postCount >= 1);
  assert.equal(summary.body.profileDone, false);
  const updated = await request("/me", "PATCH", {
    bio: "Working on useful ideas",
    skills: ["Research"],
  });
  assert.equal(updated.status, 200);
  assert.equal((await request("/me/summary")).body.profileDone, true);
  const event = await Event.create({
    title: "Member workshop",
    startsAt: new Date(Date.now() + 2 * 86400000),
    capacity: 10,
    status: "published",
    priceType: "free",
    CommunityId: community.id,
  });
  assert.equal(
    (await request(`/events/${event.id}/register`, "POST")).body.status,
    "registered",
  );
  const myEvents = await request("/my-events");
  assert.ok(myEvents.body.items.some((x) => x.Event.id === event.id));
  const activity = await request("/activity");
  assert.ok(
    activity.body.items.some(
      (x) => x.kind === "join" && x.href === "/communities/launchpad",
    ),
  );
  assert.ok(activity.body.items.some((x) => x.kind === "post"));
  assert.ok(
    activity.body.items.some(
      (x) => x.kind === "event" && x.href === `/events/${event.id}`,
    ),
  );
  const privateEvents = await request("/my-events", "GET", undefined, cookie2);
  assert.ok(!privateEvents.body.items.some((x) => x.Event.id === event.id));
  const ownPost = await Post.findOne({
    where: { UserId: user.id, status: "published" },
  });
  assert.equal(
    (
      await request(`/posts/${ownPost.id}`, "PATCH", {
        body: "A revised professional question",
      })
    ).status,
    200,
  );
  assert.equal(
    (await request(`/posts/${ownPost.id}`)).body.item.body,
    "A revised professional question",
  );
});
test("contact requests validate input and only admins can review them", async () => {
  assert.equal(
    (
      await request(
        "/contact",
        "POST",
        { name: "A", email: "bad", topic: "general", message: "short" },
        null,
      )
    ).status,
    400,
  );
  const sent = await request(
    "/contact",
    "POST",
    {
      name: "Community Visitor",
      email: "visitor@example.test",
      topic: "partnership",
      message: "I would like to discuss a relevant community collaboration.",
    },
    null,
  );
  assert.equal(sent.status, 201);
  assert.ok(sent.body.reference);
  assert.equal(
    (await request("/admin/contact", "GET", undefined, cookie2)).status,
    403,
  );
  const inbox = await request("/admin/contact");
  assert.equal(inbox.status, 200);
  const item = inbox.body.items.find((x) => x.email === "visitor@example.test");
  assert.ok(item);
  assert.equal(
    (
      await request(
        `/admin/contact/${item.id}`,
        "PATCH",
        { status: "closed" },
        cookie2,
      )
    ).status,
    403,
  );
  assert.equal(
    (await request(`/admin/contact/${item.id}`, "PATCH", { status: "closed" }))
      .status,
    200,
  );
  assert.equal(
    (await request("/admin/contact")).body.items.some((x) => x.id === item.id),
    false,
  );
});
test("plans, idempotent subscription requests, admin activation and cancellation persist", async () => {
  const catalog = await request("/plans", "GET", undefined, null);
  assert.equal(catalog.status, 200);
  assert.equal(catalog.body.items.length, 4);
  assert.equal(
    catalog.body.items.find((x) => x.code === "plus").yearlyEgp,
    1490,
  );
  assert.equal((await request("/billing", "GET", undefined, null)).status, 401);
  const missingKey = await request(
    "/subscriptions",
    "POST",
    { planCode: "plus", billingCycle: "yearly" },
    cookie2,
  );
  assert.equal(missingKey.status, 400);
  const key = "subscription-test-key-0001";
  async function subscription(body, authCookie = cookie2) {
    const r = await fetch(base + "/api/v1/subscriptions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": key,
        ...(authCookie ? { Cookie: authCookie } : {}),
      },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json() };
  }
  const created = await subscription({
    planCode: "plus",
    billingCycle: "yearly",
  });
  assert.equal(created.status, 202);
  assert.equal(created.body.status, "pending_payment");
  assert.equal(created.body.amountEgp, 1490);
  const repeated = await subscription({
    planCode: "plus",
    billingCycle: "yearly",
  });
  assert.equal(repeated.status, 202);
  assert.equal(repeated.body.subscriptionId, created.body.subscriptionId);
  const pending = await request("/billing", "GET", undefined, cookie2);
  assert.equal(pending.body.subscription.status, "pending_payment");
  assert.equal(
    (
      await request(
        `/admin/subscriptions/${created.body.subscriptionId}/activate`,
        "PATCH",
        { confirmed: true },
        cookie2,
      )
    ).status,
    403,
  );
  const activated = await activateVia(created.body.subscriptionId);
  assert.equal(activated.body.subscriptionStatus, "active");
  assert.equal(
    (await request("/billing", "GET", undefined, cookie2)).body.subscription
      .status,
    "active",
  );
  // Cancelling a PAID, running term is cancel-at-period-end: the member keeps
  // what they paid for until the term ends.
  const cancelled = await request(
    "/subscriptions/current",
    "DELETE",
    undefined,
    cookie2,
  );
  assert.equal(cancelled.body.status, "active");
  assert.ok(cancelled.body.cancelsAt);
  const afterCancel = (await request("/billing", "GET", undefined, cookie2))
    .body.subscription;
  assert.equal(afterCancel.status, "active");
  assert.ok(afterCancel.cancelsAt);
  assert.equal(
    (await request("/perks", "GET", undefined, cookie2)).body.access.eligible,
    true,
  );
  // Once the paid term has actually ended the entitlement is gone, even before
  // the maintenance job flips the status.
  await Subscription.update(
    { endsAt: new Date(Date.now() - 1000) },
    { where: { id: created.body.subscriptionId } },
  );
  assert.equal(
    (await request("/perks", "GET", undefined, cookie2)).body.access.eligible,
    false,
  );
});
test("groups, curated rooms, saved searches, preferences, partnerships, tickets and platform controls work", async () => {
  const groups = await request("/groups", "GET", undefined, cookie2);
  const group = groups.body.items.find((x) => x.slug === "founder-circle");
  assert.ok(group);
  const joined = await request(
    `/groups/${group.id}/join`,
    "POST",
    undefined,
    cookie2,
  );
  assert.equal(joined.body.status, "active");
  assert.ok(
    (await request("/me/groups", "GET", undefined, cookie2)).body.items.some(
      (x) => x.GroupId === group.id,
    ),
  );
  const saved = await request(
    "/saved-searches",
    "POST",
    { label: "Founder research", query: "founder" },
    cookie2,
  );
  assert.equal(saved.status, 201);
  assert.equal(
    (await request("/saved-searches", "GET", undefined, cookie2)).body.items[0]
      .query,
    "founder",
  );
  assert.equal(
    (
      await request(
        "/notification-preferences",
        "PUT",
        { inApp: true, email: false, digest: "daily", kinds: ["events"] },
        cookie2,
      )
    ).status,
    200,
  );
  assert.equal(
    (await request("/notification-preferences", "GET", undefined, cookie2)).body
      .item.digest,
    "daily",
  );
  const rooms = await request("/curated-rooms", "GET", undefined, cookie2);
  const room = rooms.body.items.find(
    (x) => x.title === "Founder Problem-Solving Room",
  );
  assert.ok(room);
  const application = await request(
    `/curated-rooms/${room.id}/applications`,
    "POST",
    {
      motivation:
        "I want to contribute a practical founder challenge and support peers.",
    },
    cookie2,
  );
  assert.equal(application.status, 201);
  assert.equal(
    (
      await request(
        `/admin/room-applications/${application.body.id}`,
        "PATCH",
        { status: "accepted" },
        cookie2,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request(
        `/admin/room-applications/${application.body.id}`,
        "PATCH",
        { status: "accepted" },
      )
    ).body.status,
    "accepted",
  );
  assert.equal(
    (
      await request(
        `/admin/room-applications/${application.body.id}`,
        "PATCH",
        { action: "checkin" },
      )
    ).status,
    200,
  );
  assert.equal(
    (
      await request(
        `/room-applications/${application.body.id}`,
        "PATCH",
        {
          action: "feedback",
          rating: 5,
          feedback: "A useful facilitated room with a clear follow-up step.",
        },
        cookie2,
      )
    ).status,
    200,
  );
  const partnership = await request(
    "/partnerships",
    "POST",
    {
      organizationName: "Partner Lab",
      contactEmail: "partner@example.test",
      objective:
        "Create reviewed professional sessions with clear outcomes and reporting.",
    },
    cookie2,
  );
  assert.equal(partnership.status, 201);
  assert.equal(
    (
      await request(`/admin/partnerships/${partnership.body.id}`, "PATCH", {
        status: "reviewing",
      })
    ).body.status,
    "reviewing",
  );
  assert.equal(
    (
      await request(`/admin/partnerships/${partnership.body.id}`, "PATCH", {
        status: "approved",
      })
    ).body.status,
    "approved",
  );
  assert.equal(
    (
      await request(`/admin/partnerships/${partnership.body.id}`, "PATCH", {
        status: "active",
      })
    ).body.status,
    "active",
  );
  assert.equal(
    (
      await request(
        "/admin/feature-flags/rooms_applications",
        "PUT",
        { enabled: false },
        cookie2,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await request("/admin/feature-flags/rooms_applications", "PUT", {
        enabled: true,
        description: "Room applications",
      })
    ).body.enabled,
    true,
  );
  assert.equal(
    (
      await request("/admin/cms/home_notice/ar", "PUT", {
        value: "تحديث مجتمع معتمد",
        status: "published",
      })
    ).status,
    200,
  );
  assert.equal(
    (await request("/platform-config?locale=ar", "GET", undefined, null)).body
      .content.home_notice,
    "تحديث مجتمع معتمد",
  );
  const event = await Event.create({
    title: "Ticketed free meetup",
    startsAt: new Date(Date.now() + 3 * 86400000),
    capacity: 20,
    status: "published",
    priceType: "free",
    CommunityId: community.id,
  });
  assert.equal(
    (await request(`/events/${event.id}/register`, "POST", undefined, cookie2))
      .body.status,
    "registered",
  );
  const ticket = await request(
    `/events/${event.id}/ticket`,
    "GET",
    undefined,
    cookie2,
  );
  assert.ok(ticket.body.ticket.code);
  const checkin = await request("/admin/events/check-in", "POST", {
    ticketCode: ticket.body.ticket.code,
  });
  assert.equal(checkin.body.ok, true);
  assert.equal(
    (
      await request("/admin/events/check-in", "POST", {
        ticketCode: ticket.body.ticket.code,
      })
    ).body.alreadyCheckedIn,
    true,
  );
});

test("paid member perks enforce access, persist applications and support admin review", async () => {
  const publicCatalog = await request("/perks", "GET", undefined, null);
  assert.equal(publicCatalog.status, 200);
  assert.equal(publicCatalog.body.access.eligible, false);
  assert.equal(publicCatalog.body.access.reason, "sign_in_required");
  assert.ok(publicCatalog.body.items.length > 0);
  assert.ok(publicCatalog.body.items.every((x) => x.application === null));

  const lockedCatalog = await request("/perks", "GET", undefined, cookie2);
  assert.equal(lockedCatalog.status, 200);
  assert.equal(lockedCatalog.body.access.eligible, false);
  const usamPerk = lockedCatalog.body.items.find(
    (x) => x.slug === "flowly-product-credit",
  );
  assert.ok(usamPerk);
  const denied = await request(
    `/perks/${usamPerk.id}/apply`,
    "POST",
    {
      startupName: "Example Startup",
      stage: "mvp",
      useCase: "We need a clear automation workflow for our member onboarding process.",
    },
    cookie2,
  );
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error, "paid_membership_required");

  const paidRequest = await fetch(base + "/api/v1/subscriptions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Idempotency-Key": "perk-access-subscription-0001",
      Cookie: cookie2,
    },
    body: JSON.stringify({ planCode: "plus", billingCycle: "monthly" }),
  });
  const paidBody = await paidRequest.json();
  assert.equal(paidRequest.status, 202);
  assert.equal((await activateVia(paidBody.subscriptionId)).status, 200);
  const unlocked = await request("/perks", "GET", undefined, cookie2);
  assert.equal(unlocked.body.access.eligible, true);
  assert.equal(unlocked.body.access.plan.code, "plus");

  const application = await request(
    `/perks/${usamPerk.id}/apply`,
    "POST",
    {
      startupName: "Example Startup",
      website: "https://example.test",
      stage: "mvp",
      useCase: "We need a clear automation workflow for our member onboarding process.",
    },
    cookie2,
  );
  assert.equal(application.status, 201);
  assert.equal(application.body.status, "submitted");
  assert.equal(
    (await request("/my-perk-applications", "GET", undefined, cookie2)).body
      .items[0].Perk.slug,
    "flowly-product-credit",
  );
  assert.equal(
    (
      await request(
        `/admin/perk-applications/${application.body.id}`,
        "PATCH",
        { status: "reviewing" },
      )
    ).body.status,
    "reviewing",
  );
});
