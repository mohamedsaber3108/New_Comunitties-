// T-11 accessibility baseline (prompt 009) and T-15 checks (prompt 021).
//
// Runs axe-core on key pages in Arabic and English at 360 px and 1280 px.
// A test fails on: any critical axe error, any sideways scroll at 360 px, or
// a page whose <html lang/dir> does not match the language under test.
// Every finding (all impacts) is written to
// $E2E_DIR/a11y-<group>-<lang>.json, one file per test, rewritten each run.
/* global document, window */ // used only inside page.evaluate() callbacks
import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { uniqueEmail, signUp, makeAdmin, verifyEmail } from "./helpers.js";

const require = createRequire(import.meta.url);
const axeSource = fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");

const GROUPS = {
  public: { role: null, signedIn: false, pages: ["/", "/pricing", "/login", "/signup"] },
  member: {
    role: null,
    signedIn: true,
    pages: ["/home", "/feed", "/events", "/checkout/plus?cycle=monthly", "/settings", "/messages", "/search"],
  },
  admin: { role: "admin", signedIn: true, pages: ["/admin"] },
};
const LANGS = ["ar", "en"];
const WIDTHS = [360, 1280];

async function scan(page, url, lang, width) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(url);
  // Signed-in pages keep polling, so network idle never comes. Wait for real
  // content instead: a heading is shown and no loading skeleton is left.
  await page.locator("h1, h2").first().waitFor();
  await expect(page.locator(".skeleton-grid")).toHaveCount(0);
  const [docLang, dir] = await page.evaluate(() => [document.documentElement.lang, document.documentElement.dir]);
  // evaluate() runs through the browser protocol, so the app CSP (script-src
  // self) stays on and is not weakened for the test.
  await page.evaluate(axeSource);
  const violations = await page.evaluate(async () => {
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
  // When the page scrolls sideways, name the deepest elements that stick out.
  const wide = overflow > 0
    ? await page.evaluate(() => {
        const w = document.documentElement.clientWidth;
        const drawerOpen = document.querySelector(".sidebar.open");
        return [...document.querySelectorAll("body *")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            // The CLOSED mobile drawer sits off-screen on every page; skip it.
            if (!drawerOpen && el.closest(".sidebar")) return false;
            return r.width > 0 && (r.right > w + 1 || r.left < -1);
          })
          .filter((el, _, all) => !all.some((o) => o !== el && el.contains(o)))
          .slice(0, 5)
          .map((el) => `${el.tagName.toLowerCase()}.${[...el.classList].join(".")} ${Math.round(el.getBoundingClientRect().width)}px`);
      })
    : [];
  return { url, lang, width, docLang, dir, overflow, wide, violations };
}

async function openPage(browser, lang, group) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  if (group.signedIn) {
    await ctx.addInitScript(() => localStorage.setItem("usam-lang", "en"));
    const email = uniqueEmail(`a11y-${group.role || "member"}`);
    await signUp(page, { name: "Axe Tester", email });
    await verifyEmail(email);
    if (group.role) await makeAdmin(email, group.role);
  }
  // Added last, so it runs last on every navigation and wins.
  await ctx.addInitScript((l) => localStorage.setItem("usam-lang", l), lang);
  return { ctx, page };
}

test.describe("accessibility baseline", () => {
  test.setTimeout(240_000);
  for (const lang of LANGS) {
    for (const [name, group] of Object.entries(GROUPS)) {
      test(`${name} pages, ${lang}`, async ({ browser }) => {
        const { ctx, page } = await openPage(browser, lang, group);
        const rows = [];
        const problems = [];
        try {
          for (const url of group.pages) {
            for (const width of WIDTHS) {
              const r = await scan(page, url, lang, width);
              rows.push(r);
              const wantDir = lang === "ar" ? "rtl" : "ltr";
              if (r.docLang !== lang || r.dir !== wantDir)
                problems.push(`${url} ${width}px: html lang=${r.docLang} dir=${r.dir}, expected ${lang}/${wantDir}`);
              for (const v of r.violations.filter((x) => x.impact === "critical"))
                problems.push(`${url} ${width}px: ${v.id}`);
              if (width === 360 && r.overflow > 0) problems.push(`${url} 360px: sideways scroll ${r.overflow}px`);
            }
          }
        } finally {
          const out = path.join(process.env.E2E_DIR || ".", `a11y-${name}-${lang}.json`);
          fs.writeFileSync(out, JSON.stringify(rows, null, 2));
          await ctx.close();
        }
        expect(problems).toEqual([]);
      });
    }
  }
});
