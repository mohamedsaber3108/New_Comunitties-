import { test, expect } from "@playwright/test";
import { uniqueEmail, useEnglish, signUp } from "./helpers.js";
import { totpAt, currentStep } from "../server/mfa.js";

test.beforeEach(async ({ context }) => useEnglish(context));

test("two-factor: enrol in Settings, then sign-in demands the code", async ({ page, context }) => {
  const email = uniqueEmail("e2e-mfa");
  await signUp(page, { name: "Mfa Browser", email });

  await page.goto("/settings");
  await page.getByRole("button", { name: "Start setup" }).click();
  const secret = (await page.locator(".mfa-secret").innerText()).trim();
  expect(secret).toMatch(/^[A-Z2-7]{32}$/);

  // A wrong code is refused and nothing is enabled.
  await page.getByLabel("Verification code").fill("000000");
  await page.getByRole("button", { name: "Enable", exact: true }).click();
  await expect(page.getByText("That code is not valid")).toBeVisible();

  await page.getByLabel("Verification code").fill(totpAt(secret, currentStep()));
  await page.getByRole("button", { name: "Enable", exact: true }).click();
  await expect(page.getByText("Two-factor is on.")).toBeVisible();
  const codes = (await page.locator(".mfa-codes").innerText()).trim().split("\n");
  expect(codes).toHaveLength(10);

  // Sign out (drop the session cookie) and sign back in.
  await context.clearCookies();
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill("abcdef1234");
  await page.locator("button.auth-submit").click();
  await expect(page.getByLabel("Two-factor code")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);

  // Wrong code -> still on the login page.
  await page.getByLabel("Two-factor code").fill("111111");
  await page.locator("button.auth-submit").click();
  await expect(page.getByText("wrong or was already used")).toBeVisible();

  // A recovery code gets in.
  await page.getByLabel("Two-factor code").fill(codes[0]);
  await page.locator("button.auth-submit").click();
  await page.waitForURL("**/home");
});
