import { test, expect } from "@playwright/test";
import { uniqueEmail, signUp, verifyEmail, dbAll } from "./helpers.js";

// Two real browser sessions. Messages must arrive in the other window LIVE
// (Server-Sent Events) - no reload, no refresh button.
test("live messaging between two members, with unread badges and previews", async ({ browser }) => {
  const mk = async (name) => {
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => localStorage.setItem("usam-lang", "en"));
    const page = await ctx.newPage();
    const email = uniqueEmail(name.toLowerCase());
    await signUp(page, { name, email });
    await verifyEmail(email);
    // Opt in to the directory + messages and join a shared community, through
    // the same API the Settings and community pages call.
    for (const [url, method, data] of [
      ["/api/v1/me", "PATCH", { messagesEnabled: true, discoverable: true }],
      ["/api/v1/communities/launchpad/join", "POST", undefined],
    ]) {
      const r = await page.request.fetch(url, { method, data, headers: { Origin: new URL(page.url()).origin } });
      expect(r.ok(), `${method} ${url} -> ${r.status()}`).toBeTruthy();
    }
    const [row] = await dbAll(`SELECT username FROM Users WHERE email = ?`, [email]);
    return { ctx, page, email, username: row.username };
  };
  const amal = await mk("Amal");
  const badr = await mk("Badr");

  // Badr sits on his inbox.
  await badr.page.goto("/messages");
  await expect(badr.page.getByText("No conversations yet")).toBeVisible();

  // Amal opens Badr's profile and starts a conversation from the UI.
  await amal.page.goto(`/members/${badr.username}`);
  await amal.page.getByRole("button", { name: "Send a message" }).click();
  await amal.page.waitForURL(/\/messages\/[0-9a-f-]{36}$/);
  await amal.page.getByPlaceholder("Write your message...").fill("Hi Badr, live test");
  await amal.page.getByRole("button", { name: "Send" }).click();
  await expect(amal.page.locator(".message-bubble.mine", { hasText: "Hi Badr, live test" })).toBeVisible();

  // Badr's inbox updates by itself: conversation, preview, unread badge.
  const peer = badr.page.locator(".message-peer", { hasText: "Amal" });
  await expect(peer).toBeVisible();
  await expect(peer.locator(".message-preview")).toHaveText("Hi Badr, live test");
  await expect(peer.locator(".unread-badge")).toHaveText("1");
  await expect(badr.page.getByTestId("badge-messages")).toHaveText("1");

  // Opening the thread marks it read; the badge clears.
  await peer.click();
  await expect(badr.page.locator(".message-bubble", { hasText: "Hi Badr, live test" })).toBeVisible();
  await expect(badr.page.getByTestId("badge-messages")).toHaveCount(0);

  // Reply; it shows up in Amal's open thread without any reload.
  await badr.page.getByPlaceholder("Write your message...").fill("Got it, Amal");
  await badr.page.getByRole("button", { name: "Send" }).click();
  await expect(amal.page.locator(".message-bubble:not(.mine)", { hasText: "Got it, Amal" })).toBeVisible();

  // Persisted: both messages are in the database for this conversation.
  const rows = await dbAll(`SELECT body FROM Messages ORDER BY createdAt`);
  expect(rows.map((r) => r.body)).toEqual(expect.arrayContaining(["Hi Badr, live test", "Got it, Amal"]));

  // Notifications page also got the live notification.
  await amal.page.goto("/notifications");
  await expect(amal.page.getByText("New message from Badr")).toBeVisible();

  await amal.ctx.close();
  await badr.ctx.close();
});
