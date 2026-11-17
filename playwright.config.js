// End-to-end browser tests. They boot the REAL server (Express + SQLite temp
// DB + the built SPA) and drive it through a real browser.
//
// Browser: PLAYWRIGHT_CHANNEL selects an installed browser (default "msedge" so
// no download is needed on Windows; use "chrome", or unset + `npx playwright
// install chromium` in CI).
import { defineConfig } from "@playwright/test";
import os from "node:os";
import path from "node:path";

const PORT = Number(process.env.E2E_PORT || 3111);
// One fresh directory per run. The env var makes every Playwright process
// (runner + workers, which each evaluate this file) agree on the same path.
process.env.E2E_DIR ||= path.join(os.tmpdir(), `usam-e2e-${Date.now()}`);
const dbDir = process.env.E2E_DIR;
export const E2E_DB = path.join(dbDir, "e2e.sqlite");

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  expect: { timeout: 10_000 },
  fullyParallel: false, // tests share one server + DB and build on each other
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: process.env.PLAYWRIGHT_CHANNEL || "msedge",
    acceptDownloads: false,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  globalSetup: "./e2e/global-setup.js",
  webServer: {
    command: "node server/index.js",
    url: `http://127.0.0.1:${PORT}/api/v1/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      NODE_ENV: "development",
      PORT: String(PORT),
      DB_DIALECT: "sqlite",
      SQLITE_PATH: E2E_DB,
      APP_ORIGIN: `http://127.0.0.1:${PORT}`,
      FRONTEND_URL: `http://127.0.0.1:${PORT}`,
      REQUIRE_EMAIL_VERIFICATION: "true",
      REGISTRATION_ENABLED: "true",
      EMAIL_PROVIDER: "console",
      // Leave queued emails in the outbox so tests can read the real links.
      WORKER_ENABLED: "false",
      RATE_LIMIT_DISABLED: "true",
      PAYMOB_ENABLED: "false",
      MFA_ENCRYPTION_KEY: "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff",
      STORAGE_DRIVER: "local",
      MEDIA_ROOT: path.join(dbDir, "media"),
    },
  },
});
