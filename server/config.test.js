// Verifies assertProductionConfig() actually blocks the unsafe combinations
// it documents. These are plain unit tests (no server boot, no DB).
import { test } from "node:test";
import assert from "node:assert/strict";

// Each case sets env vars, re-imports a FRESH config module (env is read at
// import time), asserts, then resets process.env for the next case.
async function freshConfig() {
  const mod = await import(`./config.js?t=${Date.now()}-${Math.random()}`);
  return mod;
}
// Start from a known baseline regardless of what the surrounding shell/CI has
// exported: drop every variable config.js reads, then snapshot.
for (const k of [
  "RATE_LIMIT_DISABLED", "PAYMOB_ENABLED", "PAYMOB_HMAC_SECRET", "PAYMOB_SECRET_KEY", "PAYMOB_PUBLIC_KEY",
  "EMAIL_PROVIDER", "EMAIL_FROM", "REQUIRE_EMAIL_VERIFICATION", "REGISTRATION_ENABLED", "COOKIE_SECURE",
  "STORAGE_DRIVER", "S3_BUCKET", "SMTP_HOST", "DATABASE_URL", "DB_DIALECT", "DB_HOST", "APP_ORIGIN", "FRONTEND_URL", "STAGING_INSECURE_HTTP",
  "REQUIRE_ADMIN_MFA", "MFA_ENCRYPTION_KEY", "ALLOW_STAFF_WITHOUT_MFA",
]) delete process.env[k];
const SNAPSHOT = { ...process.env };
function reset() {
  for (const k of Object.keys(process.env)) if (!(k in SNAPSHOT)) delete process.env[k];
  Object.assign(process.env, SNAPSHOT);
}

test("baseline minimal-valid production config passes", async () => {
  reset();
  Object.assign(process.env, {
    NODE_ENV: "production",
    DB_DIALECT: "postgres",
    DATABASE_URL: "postgres://u:p@host/db",
    APP_ORIGIN: "https://usam.example",
    FRONTEND_URL: "https://usam.example",
    COOKIE_SECURE: "true",
    EMAIL_PROVIDER: "ses",
    EMAIL_FROM: "USAM <no-reply@usam.example>",
    REQUIRE_ADMIN_MFA: "true",
    MFA_ENCRYPTION_KEY: "ab".repeat(32),
  });
  const { assertProductionConfig } = await freshConfig();
  const check = assertProductionConfig();
  assert.equal(check.ok, true, JSON.stringify(check.errors));
  reset();
});

test("staff MFA start guard: refused without the flag, ok with it, escape warns loudly", async () => {
  const base = {
    NODE_ENV: "production",
    DB_DIALECT: "postgres",
    DATABASE_URL: "postgres://u:p@host/db",
    APP_ORIGIN: "https://usam.example",
    FRONTEND_URL: "https://usam.example",
    COOKIE_SECURE: "true",
    EMAIL_PROVIDER: "ses",
    EMAIL_FROM: "USAM <no-reply@usam.example>",
  };
  reset();
  Object.assign(process.env, base);
  let check = (await freshConfig()).assertProductionConfig();
  assert.equal(check.ok, false);
  assert.match(check.errors.join(" | "), /REQUIRE_ADMIN_MFA/);
  assert.match(check.errors.join(" | "), /MFA_ENCRYPTION_KEY/);
  // Flag without a key is still refused.
  reset();
  Object.assign(process.env, base, { REQUIRE_ADMIN_MFA: "true" });
  check = (await freshConfig()).assertProductionConfig();
  assert.equal(check.ok, false);
  reset();
  Object.assign(process.env, base, { REQUIRE_ADMIN_MFA: "true", MFA_ENCRYPTION_KEY: "ab".repeat(32) });
  check = (await freshConfig()).assertProductionConfig();
  assert.equal(check.ok, true, JSON.stringify(check.errors));
  reset();
  Object.assign(process.env, base, { ALLOW_STAFF_WITHOUT_MFA: "true" });
  check = (await freshConfig()).assertProductionConfig();
  assert.equal(check.ok, true, JSON.stringify(check.errors));
  assert.match(check.warnings.join(" | "), /ALLOW_STAFF_WITHOUT_MFA=true/);
  reset();
});

test("rejects sqlite, http origin, insecure cookie, and disabled rate limiting", async () => {
  reset();
  Object.assign(process.env, {
    NODE_ENV: "production",
    DB_DIALECT: "sqlite",
    APP_ORIGIN: "http://usam.example",
    FRONTEND_URL: "http://usam.example",
    COOKIE_SECURE: "false",
    RATE_LIMIT_DISABLED: "true",
    EMAIL_PROVIDER: "console",
    REGISTRATION_ENABLED: "false",
  });
  const { assertProductionConfig } = await freshConfig();
  const check = assertProductionConfig();
  assert.equal(check.ok, false);
  const joined = check.errors.join(" | ");
  assert.match(joined, /DB_DIALECT/);
  assert.match(joined, /APP_ORIGIN/);
  assert.match(joined, /FRONTEND_URL/);
  assert.match(joined, /COOKIE_SECURE/);
  assert.match(joined, /RATE_LIMIT_DISABLED/);
  reset();
});

test("rejects require-email-verification with the console transport while registration is open", async () => {
  reset();
  Object.assign(process.env, {
    NODE_ENV: "production",
    DB_DIALECT: "postgres",
    DATABASE_URL: "postgres://u:p@host/db",
    APP_ORIGIN: "https://usam.example",
    FRONTEND_URL: "https://usam.example",
    COOKIE_SECURE: "true",
    EMAIL_PROVIDER: "console",
    REQUIRE_EMAIL_VERIFICATION: "true",
    REGISTRATION_ENABLED: "true",
  });
  const { assertProductionConfig } = await freshConfig();
  const check = assertProductionConfig();
  assert.equal(check.ok, false);
  assert.match(check.errors.join(" | "), /could never verify/);
  reset();
});

test("rejects Paymob enabled without an HMAC secret (webhook forgery risk)", async () => {
  reset();
  Object.assign(process.env, {
    NODE_ENV: "production",
    DB_DIALECT: "postgres",
    DATABASE_URL: "postgres://u:p@host/db",
    APP_ORIGIN: "https://usam.example",
    FRONTEND_URL: "https://usam.example",
    COOKIE_SECURE: "true",
    EMAIL_PROVIDER: "ses",
    EMAIL_FROM: "USAM <no-reply@usam.example>",
    PAYMOB_ENABLED: "true",
    PAYMOB_SECRET_KEY: "x",
    PAYMOB_PUBLIC_KEY: "y",
    // PAYMOB_HMAC_SECRET intentionally missing
  });
  const { assertProductionConfig } = await freshConfig();
  const check = assertProductionConfig();
  assert.equal(check.ok, false);
  assert.match(check.errors.join(" | "), /PAYMOB_HMAC_SECRET/);
  reset();
});

test("non-production environments are never blocked", async () => {
  reset();
  process.env.NODE_ENV = "development";
  const { assertProductionConfig } = await freshConfig();
  assert.deepEqual(assertProductionConfig(), { ok: true, warnings: [] });
  reset();
});

test("STAGING_INSECURE_HTTP relaxes ONLY the HTTPS checks, and only when set", async () => {
  const base = {
    NODE_ENV: "production",
    DB_DIALECT: "postgres",
    DATABASE_URL: "postgres://u:p@host/db",
    APP_ORIGIN: "http://13.48.0.1:8080",
    FRONTEND_URL: "http://13.48.0.1:8080",
    COOKIE_SECURE: "false",
    EMAIL_PROVIDER: "console",
    REQUIRE_EMAIL_VERIFICATION: "false",
    REQUIRE_ADMIN_MFA: "true",
    MFA_ENCRYPTION_KEY: "ab".repeat(32),
  };
  reset();
  Object.assign(process.env, base);
  let check = (await freshConfig()).assertProductionConfig();
  assert.equal(check.ok, false, "plain HTTP is refused by default");
  reset();
  Object.assign(process.env, base, { STAGING_INSECURE_HTTP: "true" });
  check = (await freshConfig()).assertProductionConfig();
  assert.equal(check.ok, true, JSON.stringify(check.errors));
  assert.match(check.warnings.join(" | "), /WITHOUT HTTPS/);
  // Everything else is still enforced: SQLite, disabled rate limits, etc.
  reset();
  Object.assign(process.env, base, { STAGING_INSECURE_HTTP: "true", DB_DIALECT: "sqlite", RATE_LIMIT_DISABLED: "true" });
  check = (await freshConfig()).assertProductionConfig();
  assert.equal(check.ok, false);
  assert.match(check.errors.join(" | "), /DB_DIALECT/);
  assert.match(check.errors.join(" | "), /RATE_LIMIT_DISABLED/);
  reset();
});