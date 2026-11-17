// -------------------------------------------------------------------------
// Centralized runtime configuration.
// Reads process.env once, applies safe defaults, and exposes a typed-ish
// config object. Nothing here throws at import time so tests and local dev
// keep working without any .env file; production-only requirements are
// validated explicitly via assertProductionConfig().
// -------------------------------------------------------------------------

const bool = (v, fallback = false) =>
  v === undefined ? fallback : String(v).toLowerCase() === "true";
const num = (v, fallback) => (v === undefined ? fallback : Number(v));
const str = (v, fallback = "") => (v === undefined ? fallback : String(v));
const list = (v) =>
  str(v)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export const config = {
  env: str(process.env.NODE_ENV, "development"),
  isProduction: process.env.NODE_ENV === "production",
  isTest: process.env.NODE_ENV === "test",
  port: num(process.env.PORT, 3001),

  // Public origin of the app (used in email links, CORS/origin checks).
  appOrigin: str(process.env.APP_ORIGIN, "http://127.0.0.1:3001"),
  frontendUrl: str(
    process.env.FRONTEND_URL || process.env.APP_ORIGIN,
    "http://127.0.0.1:3001",
  ),

  // Security
  cookieSecure: bool(process.env.COOKIE_SECURE, process.env.NODE_ENV === "production"),
  sessionDays: num(process.env.SESSION_DAYS, 30),
  registrationEnabled: process.env.REGISTRATION_ENABLED !== "false",
  // When true, email verification is required before protected access.
  requireEmailVerification: bool(process.env.REQUIRE_EMAIL_VERIFICATION, true),
  trustedOrigins: list(process.env.TRUSTED_ORIGINS),

  // Google sign-in (OIDC). Both values come from a Google Cloud OAuth client.
  google: {
    clientId: str(process.env.GOOGLE_CLIENT_ID),
    clientSecret: str(process.env.GOOGLE_CLIENT_SECRET),
  },

  // Two-factor auth (TOTP). The per-user secret is encrypted at rest with
  // AES-256-GCM using MFA_ENCRYPTION_KEY (64 hex chars = 32 bytes).
  // When REQUIRE_ADMIN_MFA=true, moderator/admin/super_admin accounts without
  // MFA enrolled are refused on privileged routes until they enrol.
  mfa: {
    encryptionKey: str(process.env.MFA_ENCRYPTION_KEY),
    requireForAdmins: bool(process.env.REQUIRE_ADMIN_MFA, false),
    issuer: str(process.env.MFA_ISSUER, "USAM Communities"),
  },

  // Email (AWS SES by default; console transport in dev/test)
  email: {
    provider: str(process.env.EMAIL_PROVIDER, "console"), // console | ses | smtp
    from: str(process.env.EMAIL_FROM, "USAM Communities <no-reply@usam.local>"),
    replyTo: str(process.env.EMAIL_REPLY_TO, ""),
    sesRegion: str(process.env.AWS_SES_REGION || process.env.AWS_REGION, "us-east-1"),
    // SES credentials come from the standard AWS SDK provider chain
    // (env vars, shared config, or EC2 instance role). We never read raw
    // secrets here beyond what the SDK resolves.
    configured: !!(
      process.env.EMAIL_PROVIDER === "ses" ||
      process.env.EMAIL_PROVIDER === "smtp"
    ),
    smtp: {
      host: str(process.env.SMTP_HOST),
      port: num(process.env.SMTP_PORT, 587),
      user: str(process.env.SMTP_USER),
      pass: str(process.env.SMTP_PASS),
      secure: bool(process.env.SMTP_SECURE, false),
    },
  },

  // Payments (Paymob)
  paymob: {
    enabled: bool(process.env.PAYMOB_ENABLED, false),
    apiKey: str(process.env.PAYMOB_API_KEY),
    secretKey: str(process.env.PAYMOB_SECRET_KEY),
    publicKey: str(process.env.PAYMOB_PUBLIC_KEY),
    integrationIdCard: str(process.env.PAYMOB_INTEGRATION_ID_CARD),
    iframeId: str(process.env.PAYMOB_IFRAME_ID),
    hmacSecret: str(process.env.PAYMOB_HMAC_SECRET),
    baseUrl: str(process.env.PAYMOB_BASE_URL, "https://accept.paymob.com/api"),
    currency: str(process.env.PAYMOB_CURRENCY, "EGP"),
    configured: !!(
      process.env.PAYMOB_SECRET_KEY && process.env.PAYMOB_PUBLIC_KEY
    ),
  },

  // Storage (AWS S3 for media; local disk fallback for dev)
  storage: {
    driver: str(process.env.STORAGE_DRIVER, "local"), // local | s3
    localDir: str(process.env.MEDIA_ROOT, "./media"),
    localPublicPath: str(process.env.MEDIA_PUBLIC_PATH, "/media"),
    s3Bucket: str(process.env.S3_BUCKET),
    s3Region: str(process.env.S3_REGION || process.env.AWS_REGION, "us-east-1"),
    s3PublicBaseUrl: str(process.env.S3_PUBLIC_BASE_URL),
    maxUploadBytes: num(process.env.MAX_UPLOAD_BYTES, 10 * 1024 * 1024),
  },

  // Background worker
  worker: {
    enabled: bool(process.env.WORKER_ENABLED, true),
    intervalMs: num(process.env.WORKER_INTERVAL_MS, 5000),
    batchSize: num(process.env.WORKER_BATCH_SIZE, 10),
  },

  // Observability
  logLevel: str(process.env.LOG_LEVEL, process.env.NODE_ENV === "production" ? "info" : "debug"),
  sentryDsn: str(process.env.SENTRY_DSN),
};

// Validate production-critical settings. Call this at boot when
// NODE_ENV=production so misconfiguration fails fast and loudly rather than
// silently degrading security.
export function assertProductionConfig() {
  if (!config.isProduction) return { ok: true, warnings: [] };
  const errors = [];
  const warnings = [];

  const dialect = (process.env.DB_DIALECT || "sqlite").toLowerCase();
  if (!["postgres", "postgresql", "mysql"].includes(dialect))
    errors.push("DB_DIALECT must be 'postgres' in production (SQLite is for dev/test only).");
  if (dialect !== "sqlite" && !process.env.DATABASE_URL && !process.env.DB_HOST)
    errors.push("Set DATABASE_URL (or DB_HOST/DB_NAME/DB_USER/DB_PASSWORD).");
  // STAGING_INSECURE_HTTP=true: an explicit, temporary staging switch for a
  // server that has no domain/TLS yet (plain http://<ip>). It downgrades ONLY
  // the three HTTPS checks below to warnings; every other check still applies.
  // Never set it on the real public site - sessions travel unencrypted.
  const httpStaging = process.env.STAGING_INSECURE_HTTP === "true";
  const httpsIssue = (msg) => (httpStaging ? warnings : errors).push(msg);
  if (httpStaging)
    warnings.push("STAGING_INSECURE_HTTP=true: running WITHOUT HTTPS. Staging only - add a domain + TLS and remove this before launch.");
  if (!/^https:\/\//.test(config.appOrigin))
    httpsIssue("APP_ORIGIN must be the public HTTPS origin (used for CSRF checks and email links).");
  if (!/^https:\/\//.test(config.frontendUrl))
    httpsIssue("FRONTEND_URL must be HTTPS (it is embedded in verification/reset emails).");
  if (!config.cookieSecure)
    httpsIssue("COOKIE_SECURE must be true in production (session cookie would travel over HTTP).");
  if (process.env.RATE_LIMIT_DISABLED === "true")
    errors.push("RATE_LIMIT_DISABLED=true is not allowed in production.");
  // If verification is required but mail can't be delivered, NOBODY could ever
  // verify and registration would silently produce unusable accounts.
  if (config.email.provider === "console" && config.requireEmailVerification && config.registrationEnabled)
    errors.push("EMAIL_PROVIDER=console with REQUIRE_EMAIL_VERIFICATION=true: users could never verify. Configure ses/smtp, or set REGISTRATION_ENABLED=false.");
  if (config.email.provider === "ses" && !/<?[^<>@\s]+@[^<>@\s]+\.[^<>\s]+>?$/.test(config.email.from))
    errors.push("EMAIL_FROM must be a verified SES sender address.");
  if (config.email.provider === "smtp" && !config.email.smtp.host)
    errors.push("EMAIL_PROVIDER=smtp requires SMTP_HOST.");
  if (config.storage.driver === "s3" && !config.storage.s3Bucket)
    errors.push("STORAGE_DRIVER=s3 requires S3_BUCKET.");
  if (config.paymob.enabled && !config.paymob.hmacSecret)
    errors.push("PAYMOB_ENABLED=true requires PAYMOB_HMAC_SECRET (webhook signatures could not be verified).");
  if (config.paymob.enabled && !config.paymob.configured)
    errors.push("PAYMOB_ENABLED=true requires PAYMOB_SECRET_KEY and PAYMOB_PUBLIC_KEY.");
  if (!!config.google.clientId !== !!config.google.clientSecret)
    errors.push("Set BOTH GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (or neither to disable Google sign-in).");
  if (config.mfa.encryptionKey && !/^[0-9a-fA-F]{64}$/.test(config.mfa.encryptionKey))
    errors.push("MFA_ENCRYPTION_KEY must be 64 hex characters (generate with: openssl rand -hex 32).");
  if (config.mfa.requireForAdmins && !config.mfa.encryptionKey)
    errors.push("REQUIRE_ADMIN_MFA=true requires MFA_ENCRYPTION_KEY.");
  if (!config.mfa.encryptionKey)
    warnings.push("MFA_ENCRYPTION_KEY is not set; two-factor enrolment is unavailable (409 mfa_unavailable). Set it before launch.");
  if (config.storage.driver === "local")
    warnings.push("STORAGE_DRIVER is 'local'; uploads will not survive instance replacement. Use s3.");
  if (!config.paymob.enabled)
    warnings.push("Paymob is disabled; paid plans stay pending until an admin confirms payment manually.");
  if (!config.sentryDsn)
    warnings.push("No error-tracking DSN; rely on CloudWatch log alarms (see PRODUCTION_DEPLOYMENT_GUIDE.md).");

  return { ok: errors.length === 0, errors, warnings };
}

export default config;
