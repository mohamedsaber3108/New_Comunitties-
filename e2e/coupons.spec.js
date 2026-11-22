// Promo codes and analytics in the real UI: an admin creates a 100% code for
// the Plus plan in Admin -> Promo codes; a member applies it at checkout
// (wrong code first), the price updates, the membership activates with no
// payment provider; the admin sees the redemption and the analytics tab.
import { test, expect } from "@playwright/test";
import { uniqueEmail, signUp, makeAdmin, verifyEmail, dbAll } from "./helpers.js";

async function person(browser, name, role) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => localStorage.setItem("usam-lang", "en"));
  const page = await ctx.newPage();
  const email = uniqueEmail(name.toLowerCase().replace(/\W+/g, "-"));
  await signUp(page, { name, email });
  await verifyEmail(email);
  if (role) await makeAdmin(email, role);
  await page.reload();
  return { ctx, page, email };
}

test("admin creates a promo code; member redeems it at checkout; admin sees usage and analytics", async ({ browser }) => {
  const admin = await person(browser, "Promo Admin", "admin");
  const buyer = await person(browser, "Promo Buyer");
  const code = `E2EFREE${Date.now().toString().slice(-6)}`;

  await admin.page.goto("/admin");
  await admin.page.getByRole("button", { name: "Promo codes", exact: true }).click();
  const form = admin.page.locator("form", { hasText: "New promo code" });
  await form.getByLabel("Code").fill(code);
  await form.getByLabel("Description").fill("Founding member gift");
  await form.getByLabel("Value").fill("100");
  await form.getByLabel("Applies to").selectOption("subscription");
  await form.getByLabel("Plus", { exact: true }).check();
  await form.getByRole("button", { name: "Create code" }).click();
  await expect(admin.page.getByText("Promo code created")).toBeVisible();
  const row = admin.page.locator(".admin-row", { hasText: code });
  await expect(row.getByText(/Uses 0/)).toBeVisible();

  // Member: monthly Plus checkout.
  await buyer.page.goto("/checkout/plus?cycle=monthly");
  await buyer.page.getByLabel("Promo code").fill("NOT-A-REAL-CODE");
  await buyer.page.getByRole("button", { name: "Apply" }).click();
  await expect(buyer.page.getByText("This code is not valid")).toBeVisible();
  await buyer.page.getByLabel("Promo code").fill(code.toLowerCase());
  await buyer.page.getByRole("button", { name: "Apply" }).click();
  await expect(buyer.page.locator(".coupon-applied", { hasText: code })).toBeVisible();
  await expect(buyer.page.locator(".checkout-total strong")).toContainText(/0/);
  await expect(buyer.page.locator(".checkout-total s")).toContainText(/149/);
  await buyer.page.getByLabel(/I have read and accept/).check();
  await buyer.page.getByRole("button", { name: "Activate with this code" }).click();
  await buyer.page.waitForURL("**/billing");
  await expect(buyer.page.getByText("Active", { exact: true })).toBeVisible();

  const [sub] = await dbAll(
    "SELECT s.status, s.provider, p.code FROM Subscriptions s JOIN Plans p ON p.id = s.PlanId JOIN Users u ON u.id = s.UserId WHERE u.email = ? ORDER BY s.createdAt DESC",
    [buyer.email],
  );
  expect(sub).toEqual({ status: "active", provider: "coupon", code: "plus" });

  // Admin sees the redemption, then the analytics tab renders real numbers.
  await admin.page.reload();
  await admin.page.getByRole("button", { name: "Promo codes", exact: true }).click();
  const used = admin.page.locator(".admin-row", { hasText: code });
  await expect(used.getByText(/Uses 1/)).toBeVisible();
  await used.getByRole("button", { name: "Redemptions" }).click();
  await expect(used.getByText(buyer.email)).toBeVisible();
  await admin.page.getByRole("button", { name: "Analytics", exact: true }).click();
  await expect(admin.page.locator(".stat-card", { hasText: "Total members" }).locator("strong")).not.toHaveText("0");
  await expect(admin.page.locator(".analytics-bars").first()).toBeVisible();
  await admin.page.getByRole("button", { name: "7 days" }).click();
  await expect(admin.page.locator(".analytics-bars").first().locator("span")).toHaveCount(7);
  await admin.ctx.close();
  await buyer.ctx.close();
});
