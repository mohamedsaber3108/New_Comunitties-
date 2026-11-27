import { test, expect } from "@playwright/test";
import { emailToken, makeAdmin, makePng, uniqueEmail, useEnglish, signUp, logIn } from "./helpers.js";

test.beforeEach(async ({ context }) => useEnglish(context));

test.describe("language, direction and theme", () => {
  test("Arabic/RTL by default; toggle to English/LTR; dark theme persists across reload", async ({ browser }) => {
    // A context WITHOUT the English init script = first-time visitor.
    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
    await expect(page.locator("html")).toHaveAttribute("lang", "ar");

    await page.getByRole("button", { name: "تغيير اللغة" }).first().click();
    await expect(page.locator("html")).toHaveAttribute("dir", "ltr");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");

    await page.getByRole("button", { name: "Toggle theme" }).first().click();
    const theme = await page.locator("html").getAttribute("data-theme");
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await ctx.close();
  });

  test("no horizontal overflow on key public pages at phone width", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 800 } });
    await ctx.addInitScript(() => localStorage.setItem("usam-lang", "en"));
    const page = await ctx.newPage();
    for (const path of ["/", "/communities", "/pricing", "/login", "/signup", "/faq"]) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(overflow, `${path} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(1);
    }
    await ctx.close();
  });
});

test.describe("error pages", () => {
  test("unknown route shows 404; /403 page renders", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");
    await expect(page.getByText("404")).toBeVisible();
    await page.goto("/403");
    await expect(page.getByText("403")).toBeVisible();
    await expect(page.getByText("don't have access")).toBeVisible();
  });

  test("protected pages ask anonymous visitors to sign in", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByLabel("Email address")).toBeVisible();
    await expect(page.getByText("Sign in to continue")).toBeVisible();
  });
});

test.describe.serial("member journey through the real UI", () => {
  const email = uniqueEmail("e2e-member");
  const newPassword = "brandnew-9876";

  test("sign up -> unverified banner -> verified actions are refused", async ({ page }) => {
    await signUp(page, { name: "E2E Member", email });
    await expect(page.getByText("Verify your email to post, join and register.")).toBeVisible();

    // Joining a community must be refused by the SERVER, and the UI must say so.
    await page.goto("/communities/launchpad");
    await page.getByRole("button", { name: /join community/i }).click();
    await expect(page.getByRole("status").filter({ hasText: /email_verification_required|verify/i })).toBeVisible();
  });

  test("signing up again with the same email shows the same neutral message and creates nothing", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("Someone Else");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill("abcdef1234");
    await page.locator("button.auth-submit").click();
    await expect(page.getByTestId("signup-check-email")).toBeVisible();
    await expect(page).not.toHaveURL(/\/home/);
  });

  test("verify via the emailed link -> banner gone -> join -> post appears in feed", async ({ page }) => {
    await logIn(page, { email });
    const token = await emailToken(email, "verifyEmail");
    await page.goto(`/verify-email?token=${token}`);
    await expect(page.getByText("Your email is verified.")).toBeVisible();

    // The same link is single-use.
    await page.goto(`/verify-email?token=${token}`);
    await expect(page.getByText(/invalid or expired/i)).toBeVisible();

    await page.goto("/home");
    await page.reload();
    await expect(page.getByText("Verify your email to post")).toHaveCount(0);

    await page.goto("/communities/launchpad");
    await page.getByRole("button", { name: /join community/i }).click();
    await expect(page.getByRole("button", { name: /leave community/i })).toBeVisible();

    const text = `E2E post ${Date.now()}: what was your hardest first customer?`;
    await page.goto("/feed");
    // The composer is intentionally shown only once a joined community is selected.
    await page.getByRole("button", { name: "LaunchPad", exact: true }).click();
    await page.locator("form.compose textarea").fill(text);
    await page.getByRole("button", { name: /publish/i }).first().click();
    await expect(page.getByText(text)).toBeVisible();
  });

  test("forgot password -> reset with the emailed link -> old password rejected, new works", async ({ page }) => {
    await page.goto("/forgot-password");
    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: /send reset link/i }).click();
    await expect(page.getByText(/reset link is on its way/i)).toBeVisible();

    const token = await emailToken(email, "passwordReset");
    await page.goto(`/reset-password?token=${token}`);
    await page.getByLabel("New password").fill(newPassword);
    await page.getByLabel("Confirm password").fill(newPassword);
    await page.getByRole("button", { name: /update password/i }).click();
    await page.waitForURL("**/login");

    // Old password fails with a clear message.
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill("abcdef1234");
    await page.locator("button.auth-submit").click();
    await expect(page.getByText("Incorrect email or password")).toBeVisible();

    // New password works.
    await page.getByLabel("Password").fill(newPassword);
    await page.locator("button.auth-submit").click();
    await page.waitForURL("**/home");
  });

  test("settings: change password, see this device in sessions, export data", async ({ page }) => {
    await logIn(page, { email, password: newPassword });
    await page.goto("/settings");
    await expect(page.getByText("Your email is verified")).toBeVisible();
    await expect(page.getByText("This device")).toBeVisible();

    // Assert on the real API response + the UI confirmation. (Capturing the
    // browser's file download itself crashes Edge-under-Playwright when the
    // context closes mid-download; the export contents are covered by
    // server/journey.test.js.)
    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().endsWith("/api/v1/users/me/export")),
      page.getByRole("button", { name: /export my data/i }).click(),
    ]);
    expect(response.status()).toBe(200);
    const exported = await response.json();
    expect(exported.email).toBe(email);
    expect(exported.profile.passwordHash).toBeUndefined();
    await expect(page.getByText("Your data was downloaded")).toBeVisible();
  });

  test("avatar upload shows the photo and removal restores the initial", async ({ page }) => {
    await logIn(page, { email, password: newPassword });
    await page.goto("/settings");
    await page
      .locator('input[type="file"]')
      .setInputFiles({ name: "me.png", mimeType: "image/png", buffer: makePng(64, 64) });
    await expect(page.getByText("Photo updated")).toBeVisible();
    await expect(page.locator(".avatar-row img")).toBeVisible();
    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByText("Photo removed")).toBeVisible();
    await expect(page.locator(".avatar-row img")).toHaveCount(0);
  });

  test("pricing -> checkout: with Paymob off the UI is honest and nothing is activated", async ({ page }) => {
    await logIn(page, { email, password: newPassword });
    await page.goto("/checkout/plus?cycle=monthly");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: /continue to payment/i }).click();
    await page.waitForURL("**/billing");
    await expect(page.getByText(/Online payment is not active|Nothing has been charged/i).first()).toBeVisible();
    await expect(page.getByText(/Payment confirmation pending/i)).toBeVisible();
    // Not entitled: perks stay locked.
    await page.goto("/perks");
    await expect(page.getByText(/apply with an active paid plan/i)).toBeVisible();
  });

  test("account deletion signs the member out and the account can no longer log in", async ({ page }) => {
    await logIn(page, { email, password: newPassword });
    await page.goto("/settings");
    await page.getByRole("button", { name: /^delete account/i }).click();
    const zone = page.locator("form.danger-zone");
    const submit = zone.getByRole("button", { name: /permanently delete my account/i });
    // The final button stays disabled until the password and DELETE are typed.
    await expect(submit).toBeDisabled();
    await zone.getByLabel("Password").fill("wrong-password-1");
    await zone.getByLabel("Type DELETE to confirm").fill("DELETE");
    await submit.click();
    await expect(page.getByText("Wrong password")).toBeVisible();
    await zone.getByLabel("Password").fill(newPassword);
    await submit.click();
    await page.waitForURL((u) => u.pathname === "/");
    await page.goto("/login");
    await page.getByLabel("Email address").fill(email);
    await page.getByLabel("Password").fill(newPassword);
    await page.locator("button.auth-submit").click();
    await expect(page.locator(".form-error")).toBeVisible();
  });
});

test.describe.serial("roles in the real UI", () => {
  const memberEmail = uniqueEmail("e2e-plain");
  const adminEmail = uniqueEmail("e2e-admin");
  const modEmail = uniqueEmail("e2e-mod");

  test("a plain member sees no admin entry and is denied the admin page", async ({ page }) => {
    await signUp(page, { name: "Plain", email: memberEmail });
    await expect(page.getByRole("link", { name: /^admin$/i })).toHaveCount(0);
    await page.goto("/admin");
    await expect(page.getByText("You do not have access")).toBeVisible();
  });

  test("an admin reaches the dashboard and all the management tabs", async ({ page }) => {
    await signUp(page, { name: "Admin", email: adminEmail });
    await makeAdmin(adminEmail, "super_admin");
    await page.goto("/admin");
    for (const tab of ["Overview", "Plans", "Payments", "Users", "Feature flags", "CMS", "Background jobs", "Audit log", "Check-in", "Groups & rooms"]) {
      await expect(page.getByRole("button", { name: tab, exact: true })).toBeVisible();
    }
    await page.getByRole("button", { name: "Plans", exact: true }).click();
    await expect(page.getByText("Plans & pricing")).toBeVisible();
    await expect(page.getByText("Prices and benefits are stored in the database")).toBeVisible();
  });

  test("a moderator only gets the reports queue", async ({ page }) => {
    await signUp(page, { name: "Mod", email: modEmail });
    await makeAdmin(modEmail, "moderator");
    await page.goto("/admin");
    await expect(page.getByRole("button", { name: "Reports", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Plans", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Users", exact: true })).toHaveCount(0);
  });

  test("an admin-published CMS announcement appears site-wide and a flag hides a tab", async ({ page }) => {
    await logIn(page, { email: adminEmail });
    await page.goto("/admin");
    await page.getByRole("button", { name: "CMS", exact: true }).click();
    await page.getByLabel("Key").fill("site_announcement");
    await page.getByLabel("Value").fill("Scheduled maintenance tonight at 2am");
    await page.getByLabel("Status").selectOption("published");
    await page.getByLabel("Locale").selectOption("en");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByText("Content saved")).toBeVisible();

    await page.goto("/");
    await expect(page.getByText("Scheduled maintenance tonight at 2am")).toBeVisible();

    // Turn the saved-searches flag off -> its tab disappears from Participation.
    await page.goto("/admin");
    await page.getByRole("button", { name: "Feature flags", exact: true }).click();
    // Controlled input: it flips only after the server round-trip, so click
    // (not uncheck(), which requires an instant state change) and wait for the toast.
    await page.getByLabel(/saved_searches/).click();
    await expect(page.getByText("Feature flag updated")).toBeVisible();
    await page.goto("/participation");
    await expect(page.getByRole("button", { name: "Saved searches" })).toHaveCount(0);
  });
});
