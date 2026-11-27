// T-11 accessibility baseline (prompt 009) and T-15 checks (prompt 021).
//
// Runs axe-core (already installed as a dependency of eslint-plugin-jsx-a11y)
// on key pages in Arabic and English at 360 px and 1280 px, and checks that no
// page scrolls sideways at 360 px. The pass line is 0 critical axe errors.
// Every finding (all impacts) is written to $E2E_DIR/a11y-results.json so the
// audit report can be rebuilt from a CI run.
/* global document, window */ // used only inside page.evaluate() callbacks
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { uniqueEmail, signUp, makeAdmin, verifyEmail } from "./helpers.js";

const require = createRequire(import.meta.url);
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const PUBLIC_PAGES = ["/", "/pricing", "/login", "/signup"];
const MEMBER_PAGES = ["/home", "/feed", "/events", "/checkout/plus?cycle=monthly", "/settings"];
const ADMIN_PAGES = ["/admin"];
const LANGS = ["ar", "en"];
const WIDTHS = [360, 1280];

const OUT = path.join(process.env.E2E_DIR || ".", "a11y-results.jsonl");

async function scan(page, url, lang, width) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(url);
  // Signed-in pages keep polling, so wait for the page shell, not network idle.
  await page.waitForFunction(() => document.querySelector("#root")?.childElementCount > 0);
  await page.waitForTimeout(600);
  // evaluate() runs through the browser protocol, so the app CSP (script-src
  // self) stays on and is not weakened for the test.
  await page.evaluate(axeSource);
  const axe = await page.evaluate(async () => {
    const r = await window.axe.run(document, { resultTypes: ["violations"] });
    return r.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.length,
      sample: v.nodes.slice(0, 3).map((n) => n.target.join(" ")),
    }));
  });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  const dir = await page.evaluate(() => document.documentElement.dir);
  // When the page scrolls sideways, name the deepest elements that stick out.
  const wide = overflow > 0
    ? await page.evaluate(() => {
        const w = document.documentElement.clientWidth;
        return [...document.querySelectorAll("body *")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            // The closed mobile drawer sits off-screen on every page; skip it.
            return !el.closest(".sidebar") && r.width > 0 && (r.right > w + 1 || r.left < -1);
          })
          .filter((el, _, all) => !all.some((o) => o !== el && el.contains(o)))
          .slice(0, 5)
          .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join(".")} ${Math.round(el.getBoundingClientRect().width)}px`);
      })
    : [];
  // One JSON line per scan; appended so a failed test does not lose the rest.
  fs.appendFileSync(OUT, JSON.stringify({ url, lang, width, dir, overflow, wide, violations: axe }) + "\n");
  return { axe, overflow };
}

async function signedIn(browser, lang, role) {
  const ctx = await browser.newContext();
  await ctx.addInitScript(() => localStorage.setItem("usam-lang", "en"));
  const page = await ctx.newPage();
  const email = uniqueEmail(`a11y-${role || "member"}`);
  await signUp(page, { name: "Axe Tester", email });
  await verifyEmail(email);
  if (role) await makeAdmin(email, role);
  await ctx.addInitScript((l) => localStorage.setItem("usam-lang", l), lang);
  return { ctx, page };
}

test.describe("accessibility baseline", () => {
  test.setTimeout(180_000);
  for (const lang of LANGS) {
    test(`public pages, ${lang}`, async ({ browser }) => {
      const ctx = await browser.newContext();
      await ctx.addInitScript((l) => localStorage.setItem("usam-lang", l), lang);
      const page = await ctx.newPage();
      const problems = [];
      for (const url of PUBLIC_PAGES) {
        for (const width of WIDTHS) {
          const { axe, overflow } = await scan(page, url, lang, width);
          for (const v of axe.filter((x) => x.impact === "critical")) problems.push(`${url} ${width}px: ${v.id}`);
          if (width === 360 && overflow > 0) problems.push(`${url} 360px: sideways scroll ${overflow}px`);
        }
      }
      await ctx.close();
      expect(problems).toEqual([]);
    });

    test(`member pages, ${lang}`, async ({ browser }) => {
      const { ctx, page } = await signedIn(browser, lang);
      const problems = [];
      for (const url of MEMBER_PAGES) {
        for (const width of WIDTHS) {
          const { axe, overflow } = await scan(page, url, lang, width);
          for (const v of axe.filter((x) => x.impact === "critical")) problems.push(`${url} ${width}px: ${v.id}`);
          if (width === 360 && overflow > 0) problems.push(`${url} 360px: sideways scroll ${overflow}px`);
        }
      }
      await ctx.close();
      expect(problems).toEqual([]);
    });

    test(`admin pages, ${lang}`, async ({ browser }) => {
      const { ctx, page } = await signedIn(browser, lang, "admin");
      const problems = [];
      for (const url of ADMIN_PAGES) {
        for (const width of WIDTHS) {
          const { axe, overflow } = await scan(page, url, lang, width);
          for (const v of axe.filter((x) => x.impact === "critical")) problems.push(`${url} ${width}px: ${v.id}`);
          if (width === 360 && overflow > 0) problems.push(`${url} 360px: sideways scroll ${overflow}px`);
        }
      }
      await ctx.close();
      expect(problems).toEqual([]);
    });
  }
});
