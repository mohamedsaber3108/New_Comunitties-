// Browser coverage for the screens that previously had none: groups and
// curated rooms (member <-> admin round trip), organizations and team
// management with analytics, admin event publishing (free + paid), event
// registration and waitlist, image posts, and member search. Every step goes
// through the real UI; database state is asserted where it matters.
import { test, expect } from "@playwright/test";
import { uniqueEmail, signUp, logIn, makeAdmin, verifyEmail, dbAll, makePng } from "./helpers.js";

test.beforeEach(async ({ context }) => context.addInitScript(() => localStorage.setItem("usam-lang", "en")));

// Join a community through the real community page button.
async function joinLaunchpad(page) {
  await page.goto("/communities/launchpad");
  const join = page.getByRole("button", { name: "Join community" });
  if (await join.count()) {
    await join.first().click();
    await expect(page.getByRole("button", { name: "Leave community" }).first()).toBeVisible();
  }
}
async function newMember(browser, name) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => localStorage.setItem("usam-lang", "en"));
  const page = await ctx.newPage();
  const email = uniqueEmail(name.toLowerCase());
  await signUp(page, { name, email });
  await verifyEmail(email);
  const [row] = await dbAll("SELECT id, username FROM Users WHERE email = ?", [email]);
  return { ctx, page, email, ...row };
}
async function newAdmin(browser) {
  const a = await newMember(browser, "Admin" + Math.random().toString(36).slice(2, 6));
  await makeAdmin(a.email);
  await a.page.reload();
  return a;
}

test("groups and curated rooms: admin creates, member requests, admin decides, attendance and feedback", async ({ browser }) => {
  const admin = await newAdmin(browser);
  const member = await newMember(browser, "Rania");
  const slug = `e2e-private-${Date.now()}`;
  const roomTitle = `E2E Founders Room ${Date.now()}`;

  // Admin -> Groups & rooms: create a private group and a curated room.
  await admin.page.goto("/admin");
  await admin.page.getByRole("button", { name: "Groups & rooms", exact: true }).click();
  await admin.page.getByLabel("Slug").fill(slug);
  await admin.page.getByLabel("Name (Arabic)").fill("مجموعة اختبار");
  await admin.page.getByLabel("Name (English)").fill("E2E Private Circle");
  await admin.page.getByLabel("Visibility").selectOption("private");
  await admin.page.getByRole("button", { name: "Create group" }).click();
  await expect(admin.page.getByText("Group created")).toBeVisible();
  const roomForm = admin.page.locator("form", { hasText: "Create curated room" });
  await roomForm.getByLabel("Title").fill(roomTitle);
  await roomForm.getByLabel("Description").fill("A small facilitated room for the E2E test.");
  await roomForm.getByLabel("Capacity").fill("4");
  await roomForm.getByRole("button", { name: "Create room" }).click();
  await expect(admin.page.getByText("Room created")).toBeVisible();

  // Member: request to join the private group, apply to the room.
  await joinLaunchpad(member.page);
  await member.page.goto("/participation");
  const card = member.page.locator(".directory-card", { hasText: "E2E Private Circle" });
  await card.getByRole("button", { name: "Join" }).click();
  await expect(card.getByText("Status: pending")).toBeVisible();
  await member.page.getByRole("button", { name: "Room applications" }).click();
  const room = member.page.locator(".directory-card", { hasText: roomTitle });
  await room.locator("textarea").fill("I am building a startup and want structured peer feedback.");
  await room.getByRole("button", { name: "Apply" }).click();
  await expect(room.getByText("Under review")).toBeVisible();

  // Admin -> Workflows: approve the group request, accept the room application, check in.
  await admin.page.goto("/admin");
  await admin.page.getByRole("button", { name: "Workflows", exact: true }).click();
  const groupReq = admin.page.locator(".admin-row", { hasText: "Private group request" }).filter({ hasText: "Rania" });
  await groupReq.getByRole("button", { name: "Approve" }).click();
  await expect(admin.page.getByText("Decision saved")).toBeVisible();
  const roomReq = admin.page.locator(".admin-row", { hasText: roomTitle }).filter({ hasText: "Rania" });
  await roomReq.getByRole("button", { name: "Accept" }).click();
  await expect(admin.page.locator(".admin-row", { hasText: roomTitle }).getByText("Not checked in")).toBeVisible();
  await admin.page.locator(".admin-row", { hasText: roomTitle }).getByRole("button", { name: "Check in" }).click();
  await expect(admin.page.locator(".admin-row", { hasText: roomTitle }).getByText(/Checked in/)).toBeVisible();

  // Member sees the outcomes and leaves feedback.
  await member.page.goto("/participation");
  await expect(member.page.locator(".directory-card", { hasText: "E2E Private Circle" }).getByText("Status: active")).toBeVisible();
  await member.page.getByRole("button", { name: "Room applications" }).click();
  const mine = member.page.locator(".directory-card", { hasText: roomTitle });
  await expect(mine.getByText("Accepted")).toBeVisible();
  await mine.getByPlaceholder("How was the session?").fill("Useful, focused and well facilitated.");
  await mine.getByRole("button", { name: "Submit feedback" }).click();
  await expect(member.page.getByText("Thanks for your feedback")).toBeVisible();

  const [app] = await dbAll(
    "SELECT a.status, a.checkedInAt, a.rating, a.feedback FROM RoomApplications a JOIN Rooms r ON r.id = a.RoomId WHERE r.title = ?",
    [roomTitle],
  );
  expect(app.status).toBe("accepted");
  expect(app.checkedInAt).toBeTruthy();
  expect(app.rating).toBeGreaterThan(0);
  expect(app.feedback).toContain("well facilitated");
  await admin.ctx.close();
  await member.ctx.close();
});

test("organization: submit, admin approval, team management, promotion and analytics", async ({ browser }) => {
  const admin = await newAdmin(browser);
  const owner = await newMember(browser, "Omar");
  const mate = await newMember(browser, "Mona");
  const orgName = `E2E Org ${Date.now()}`;

  await owner.page.goto("/organization/new");
  await owner.page.getByLabel("Organization name").fill(orgName);
  await owner.page.getByLabel("Sector").fill("Education");
  await owner.page.getByLabel("Description").fill("An organization created by the browser test.");
  await owner.page.getByRole("button", { name: "Submit for review" }).click();
  await expect(owner.page.getByText("Organization submitted for review")).toBeVisible();

  await admin.page.goto("/admin");
  await admin.page.getByRole("button", { name: "Organizations", exact: true }).click();
  await admin.page.locator(".admin-row", { hasText: orgName }).getByRole("button", { name: "Approve" }).click();
  await expect(admin.page.getByText("Decision saved")).toBeVisible();

  await owner.page.goto("/participation");
  await owner.page.getByRole("button", { name: "Organization teams" }).click();
  const team = owner.page.locator(".admin-content-grid", { hasText: orgName });
  await expect(team.getByText("Your role: Owner")).toBeVisible();
  await team.getByLabel("Username").fill(mate.username);
  await team.getByRole("button", { name: "Add" }).click();
  await expect(owner.page.getByText("Member added to the team")).toBeVisible();
  const row = team.locator(".session-row", { hasText: "Mona" });
  await row.getByRole("button", { name: "Make admin" }).click();
  await expect(owner.page.getByText("Role updated")).toBeVisible();
  await expect(row.getByText("Admin")).toBeVisible();
  await team.getByRole("button", { name: "Team analytics" }).click();
  await expect(team.locator(".stat-card", { hasText: "Team size" }).locator("strong")).toHaveText("2");
  await expect(team.locator(".org-bar")).toHaveCount(6);

  // The teammate sees the org with their role and can leave it.
  await mate.page.goto("/participation");
  await mate.page.getByRole("button", { name: "Organization teams" }).click();
  const mateTeam = mate.page.locator(".admin-content-grid", { hasText: orgName });
  await expect(mateTeam.getByText("Your role: Admin")).toBeVisible();
  mate.page.once("dialog", (d) => d.accept());
  await mateTeam.getByRole("button", { name: "Leave team" }).click();
  await expect(mate.page.getByText("You left the team")).toBeVisible();

  const [m] = await dbAll(
    "SELECT om.status, om.role FROM OrganizationMembers om JOIN Organizations o ON o.id = om.OrganizationId WHERE o.name = ? AND om.UserId = ?",
    [orgName, mate.id],
  );
  expect(m).toEqual({ status: "removed", role: "admin" });
  for (const x of [admin, owner, mate]) await x.ctx.close();
});

test("events: admin publishes free + paid events; registration, waitlist, ticket; paid checkout is honest", async ({ browser }) => {
  const admin = await newAdmin(browser);
  const first = await newMember(browser, "Fadi");
  const second = await newMember(browser, "Salma");
  const free = `E2E Free Meetup ${Date.now()}`;
  const paid = `E2E Paid Dinner ${Date.now()}`;
  const when = new Date(Date.now() + 5 * 86400_000);
  const local = new Date(when.getTime() - when.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

  await admin.page.goto("/admin");
  await admin.page.getByRole("button", { name: "Events", exact: true }).click();
  const form = admin.page.locator("form", { hasText: "Publish an event" });
  await form.getByLabel("Title").fill(free);
  await form.getByLabel("Starts at").fill(local);
  await form.getByLabel("Capacity").fill("1");
  await form.getByRole("button", { name: "Publish" }).click();
  await expect(admin.page.locator(".toast", { hasText: "Published" })).toBeVisible();
  await form.getByLabel("Title").fill(paid);
  await form.getByLabel("Registration type").selectOption("paid");
  await form.getByLabel("Ticket price (EGP)").fill("350");
  await form.getByRole("button", { name: "Publish" }).click();
  await expect(admin.page.locator(".admin-row", { hasText: paid })).toBeVisible();
  const [ev] = await dbAll("SELECT startsAt, priceType, priceEgp FROM Events WHERE title = ?", [paid]);
  expect(ev).toMatchObject({ priceType: "paid", priceEgp: 350 });
  // The admin's local time was converted to the same instant on the server.
  expect(Math.abs(new Date(ev.startsAt).getTime() - new Date(local).getTime())).toBeLessThan(60_000);

  // Member 1 takes the only free seat from the event page.
  const [{ id: freeId }] = await dbAll("SELECT id FROM Events WHERE title = ?", [free]);
  await first.page.goto(`/events/${freeId}`);
  await first.page.getByRole("button", { name: "Register now" }).click();
  await expect(first.page.getByText("You are registered")).toBeVisible();
  await expect(first.page.getByText("1 / 1 seats")).toBeVisible();
  await first.page.getByRole("link", { name: "View my ticket" }).click();
  await first.page.getByRole("button", { name: "View ticket" }).click();
  await expect(first.page.getByText(/Check-in code: [0-9A-F]{20}/)).toBeVisible();

  // Member 2 is waitlisted, then promoted when member 1 cancels.
  await second.page.goto(`/events/${freeId}`);
  await second.page.getByRole("button", { name: "Register now" }).click();
  await expect(second.page.getByText("You are on the waitlist")).toBeVisible();
  await first.page.goto(`/events/${freeId}`);
  await first.page.getByRole("button", { name: "Cancel registration" }).click();
  await expect(first.page.getByText("Registration cancelled")).toBeVisible();
  await second.page.reload();
  await expect(second.page.getByText("You are registered")).toBeVisible();

  // Paid event: price shown; with Paymob off nothing is charged or held.
  const [{ id: paidId }] = await dbAll("SELECT id FROM Events WHERE title = ?", [paid]);
  await first.page.goto("/events");
  await expect(first.page.locator(".directory-card", { hasText: paid }).getByText(/Ticket · .*350/)).toBeVisible();
  await first.page.goto(`/events/${paidId}`);
  await first.page.getByRole("button", { name: /Buy ticket/ }).click();
  await expect(first.page.getByText("Online payment is not active right now. Nothing was charged.")).toBeVisible();
  const holds = await dbAll("SELECT COUNT(*) AS n FROM Registrations WHERE EventId = ?", [paidId]);
  expect(holds[0].n).toBe(0);
  for (const x of [admin, first, second]) await x.ctx.close();
});

test("feed: publish a post with images, see them, delete the post", async ({ browser }) => {
  const m = await newMember(browser, "Yara");
  await joinLaunchpad(m.page);
  await m.page.goto("/feed?community=launchpad");
  await m.page.getByRole("button", { name: "LaunchPad" }).click();
  await m.page.getByPlaceholder("What would you like to share?").fill("Our first prototype, with photos.");
  await m.page.getByLabel("Add images").setInputFiles([
    { name: "a.png", mimeType: "image/png", buffer: makePng(40, 30, [20, 120, 200]) },
    { name: "b.png", mimeType: "image/png", buffer: makePng(30, 40, [200, 120, 20]) },
  ]);
  await expect(m.page.locator(".compose-images figure")).toHaveCount(2);
  await m.page.getByRole("button", { name: "Publish" }).click();
  await expect(m.page.getByText("Your post is published")).toBeVisible();
  const post = m.page.locator(".post-card", { hasText: "Our first prototype" });
  await expect(post.locator(".post-images img")).toHaveCount(2);
  // The images really load (not a broken/blocked URL).
  const ok = await post.locator(".post-images img").first().evaluate((img) => img.decode().then(() => img.naturalWidth > 0));
  expect(ok).toBe(true);
  m.page.once("dialog", (d) => d.accept());
  await post.getByRole("button", { name: "Delete post" }).click();
  await expect(m.page.locator(".post-card", { hasText: "Our first prototype" })).toHaveCount(0);
  await m.ctx.close();
});

test("members directory: server-side search finds an opted-in member", async ({ browser }) => {
  const m = await newMember(browser, "Zeinab");
  await m.page.request.fetch("/api/v1/me", {
    method: "PATCH",
    data: { discoverable: true, location: "Alexandria" },
    headers: { Origin: new URL(m.page.url()).origin },
  });
  await m.page.goto("/members");
  await m.page.getByLabel("Search members").fill("Alexandria");
  await m.page.getByRole("button", { name: "Search" }).click();
  await expect(m.page.locator(".directory-card", { hasText: "Zeinab" })).toBeVisible();
  await m.page.getByLabel("Search members").fill("no-such-person-xyz");
  await m.page.getByRole("button", { name: "Search" }).click();
  await expect(m.page.getByText("Nothing published yet")).toBeVisible();
  await m.ctx.close();
});
