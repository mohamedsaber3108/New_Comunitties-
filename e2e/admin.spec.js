// Admin and super-admin actions in the real UI: suspend/reinstate (the
// member's live session ends), role change by a super admin, plan pricing that
// flows to the public pricing page, the audit trail of those actions, and the
// event list with cancellation.
import { test, expect } from "@playwright/test";
import { uniqueEmail, signUp, logIn, makeAdmin, verifyEmail, dbAll } from "./helpers.js";

test.beforeEach(async ({ context }) => context.addInitScript(() => localStorage.setItem("usam-lang", "en")));

async function person(browser, name, role) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => localStorage.setItem("usam-lang", "en"));
  const page = await ctx.newPage();
  const email = uniqueEmail(name.toLowerCase().replace(/\W+/g, "-"));
  await signUp(page, { name, email });
  await verifyEmail(email);
  if (role) await makeAdmin(email, role);
  await page.reload();
  return { ctx, page, email, name };
}

test.describe.serial("admin operations", () => {
  test("suspend ends the member's session, login is refused, reinstate restores access", async ({ browser }) => {
    const root = await person(browser, "Root", "super_admin");
    const target = await person(browser, "Tamer");
    await root.page.goto("/admin");
    await root.page.getByRole("button", { name: "Users", exact: true }).click();
    await root.page.getByPlaceholder("Search name or email").fill(target.email);
    await root.page.getByRole("button", { name: "Search", exact: true }).click();
    const row = root.page.locator(".admin-row", { hasText: target.email });
    await expect(row.getByText("member · active")).toBeVisible();
    root.page.once("dialog", (d) => d.accept("Spam reports"));
    await row.getByRole("button", { name: "Suspend" }).click();
    await expect(row.getByText("member · suspended")).toBeVisible();
    const [u] = await dbAll("SELECT status, suspensionReason FROM Users WHERE email = ?", [target.email]);
    expect(u).toEqual({ status: "suspended", suspensionReason: "Spam reports" });

    // The suspended member's existing session no longer works.
    await target.page.goto("/settings");
    await expect(target.page.getByText("Sign in to continue")).toBeVisible();
    await target.page.goto("/login");
    await target.page.getByLabel("Email address").fill(target.email);
    await target.page.getByLabel("Password").fill("abcdef1234");
    await target.page.locator("button.auth-submit").click();
    await expect(target.page.getByText("This account is suspended")).toBeVisible();

    await row.getByRole("button", { name: "Reinstate" }).click();
    await expect(row.getByText("member · active")).toBeVisible();
    await logIn(target.page, { email: target.email });

    // Super admin promotes the member to moderator; they now see the Admin entry.
    await row.locator("select").selectOption("moderator");
    await expect(row.getByText("moderator · active")).toBeVisible();
    // A role change revokes every session of the target (A-03): they are signed
    // out, and must sign in again to pick up the new role.
    await target.page.goto("/settings");
    await expect(target.page.getByText("Sign in to continue")).toBeVisible();
    await logIn(target.page, { email: target.email });
    await expect(target.page.getByRole("link", { name: /^admin$/i })).toBeVisible();

    // The audit log records each action.
    await root.page.getByRole("button", { name: "Audit log", exact: true }).click();
    await expect(root.page.getByText(/suspend/i).first()).toBeVisible();
    const actions = (await dbAll("SELECT action FROM AuditLogs ORDER BY createdAt")).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["user_suspend", "user_reinstate", "user_set_role"]));
    await root.ctx.close();
    await target.ctx.close();
  });

  test("an admin changes a plan price and the public pricing page shows it", async ({ browser }) => {
    const admin = await person(browser, "Pricing Admin", "admin");
    await admin.page.goto("/admin");
    await admin.page.getByRole("button", { name: "Plans", exact: true }).click();
    const plus = admin.page.locator(".admin-plan-row", { hasText: "(plus)" });
    const monthly = plus.getByLabel("Monthly (EGP)");
    const original = await monthly.inputValue();
    await monthly.fill("179");
    await monthly.blur();
    await expect(admin.page.getByText("Plan updated")).toBeVisible();
    const [p] = await dbAll("SELECT monthlyEgp FROM Plans WHERE code = 'plus'");
    expect(p.monthlyEgp).toBe(179);
    await admin.page.goto("/pricing");
    // The page opens on the annual cycle; switch to monthly to see the edit.
    await admin.page.getByRole("button", { name: "Monthly", exact: true }).click();
    await expect(admin.page.getByText(/179/).first()).toBeVisible();
    // Restore so other suites see the seeded price.
    await admin.page.goto("/admin");
    await admin.page.getByRole("button", { name: "Plans", exact: true }).click();
    const again = admin.page.locator(".admin-plan-row", { hasText: "(plus)" }).getByLabel("Monthly (EGP)");
    await again.fill(original);
    await again.blur();
    await expect(admin.page.getByText("Plan updated")).toBeVisible();
    await admin.ctx.close();
  });

  test("an admin cancels a free event; registrants are told on the event page", async ({ browser }) => {
    const admin = await person(browser, "Events Admin", "admin");
    const guest = await person(browser, "Guest");
    const title = `E2E Cancel Me ${Date.now()}`;
    const when = new Date(Date.now() + 3 * 86400_000);
    const local = new Date(when.getTime() - when.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    await admin.page.goto("/admin");
    await admin.page.getByRole("button", { name: "Events", exact: true }).click();
    const form = admin.page.locator("form", { hasText: "Publish an event" });
    await form.getByLabel("Title").fill(title);
    await form.getByLabel("Starts at").fill(local);
    await form.getByRole("button", { name: "Publish" }).click();
    const row = admin.page.locator(".admin-row", { hasText: title });
    await expect(row).toBeVisible();
    const [{ id }] = await dbAll("SELECT id FROM Events WHERE title = ?", [title]);
    await guest.page.goto(`/events/${id}`);
    await guest.page.getByRole("button", { name: "Register now" }).click();
    await expect(guest.page.getByText("You are registered")).toBeVisible();
    await admin.page.reload();
    await admin.page.getByRole("button", { name: "Events", exact: true }).click();
    await expect(admin.page.locator(".admin-row", { hasText: title }).getByText(/1\/30 seats/)).toBeVisible();
    admin.page.once("dialog", (d) => d.accept());
    await admin.page.locator(".admin-row", { hasText: title }).getByRole("button", { name: "Cancel event" }).click();
    await expect(admin.page.getByText("Event cancelled")).toBeVisible();
    await guest.page.reload();
    await expect(guest.page.getByText("This event was cancelled.", { exact: false })).toBeVisible();
    await expect(guest.page.getByRole("button", { name: "Register now" })).toHaveCount(0);
    await guest.page.goto("/notifications");
    await expect(guest.page.getByText(`${title} was cancelled`)).toBeVisible();
    await admin.ctx.close();
    await guest.ctx.close();
  });
});
