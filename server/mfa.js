// -------------------------------------------------------------------------
// Two-factor authentication (TOTP, RFC 6238) + single-use recovery codes.
//
// Implemented with node:crypto only (no new dependency):
//   - 20-byte random secret, base32 encoded for authenticator apps
//   - HMAC-SHA1, 6 digits, 30 s step, +/-1 step tolerance (RFC 6238 defaults,
//     what Google Authenticator / Microsoft Authenticator / Authy expect)
//   - secret encrypted at rest with AES-256-GCM (MFA_ENCRYPTION_KEY)
//   - accepted time step is stored, so a code cannot be replayed
//   - recovery codes: 10 x random, stored only as SHA-256 hashes, single use
//
// Endpoints (all under /api/v1/auth/mfa, all require a signed-in user):
//   GET  /status      { enabled, recoveryCodesLeft, required }
//   POST /setup       start enrolment -> { secret, otpauthUrl }
//   POST /enable      { code } -> activates, returns recovery codes ONCE
//   POST /disable     { password, code } -> turns MFA off
//   POST /recovery-codes  { password, code } -> regenerate recovery codes
//
// Login integration lives in index.js (/auth/login accepts `mfaCode`).
// -------------------------------------------------------------------------
import crypto from "node:crypto";
import { config } from "./config.js";
import { sha256 } from "./security.js";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_S = 30;
const DIGITS = 6;

export function base32Encode(buf) {
  let bits = 0,
    value = 0,
    out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(str) {
  let bits = 0,
    value = 0;
  const out = [];
  for (const ch of String(str).replace(/=+$/, "").toUpperCase()) {
    const idx = B32.indexOf(ch);
    if (idx < 0) throw new Error("invalid_base32");
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

export function totpAt(secretB32, step) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const h = crypto
    .createHmac("sha1", base32Decode(secretB32))
    .update(counter)
    .digest();
  const o = h[h.length - 1] & 15;
  const bin =
    ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, "0");
}

export const currentStep = (now = Date.now()) => Math.floor(now / 1000 / STEP_S);

// Returns the matching time step (number) or null. `lastStep` blocks replay:
// only steps strictly greater than the last accepted one are valid.
export function verifyTotp(secretB32, code, { lastStep = null, now = Date.now() } = {}) {
  const c = String(code || "").replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const cur = currentStep(now);
  for (const step of [cur, cur - 1, cur + 1]) {
    if (lastStep != null && step <= Number(lastStep)) continue;
    const expected = Buffer.from(totpAt(secretB32, step));
    if (crypto.timingSafeEqual(expected, Buffer.from(c))) return step;
  }
  return null;
}

export const newSecret = () => base32Encode(crypto.randomBytes(20));

export function otpauthUrl(secret, email) {
  const issuer = config.mfa.issuer;
  const label = encodeURIComponent(`${issuer}:${email}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_S}`;
}

// ---- Secret encryption at rest --------------------------------------------
export const mfaAvailable = () => /^[0-9a-fA-F]{64}$/.test(config.mfa.encryptionKey || "");
const key = () => Buffer.from(config.mfa.encryptionKey, "hex");

export function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}

export function decryptSecret(blob) {
  const [iv, tag, enc] = String(blob).split(".").map((s) => Buffer.from(s, "base64"));
  const d = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

// ---- Recovery codes ---------------------------------------------------------
const normRecovery = (c) => String(c || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function generateRecoveryCodes(n = 10) {
  const codes = [];
  for (let i = 0; i < n; i++) {
    const raw = crypto.randomBytes(5).toString("hex"); // 10 hex chars
    codes.push(`${raw.slice(0, 5)}-${raw.slice(5)}`);
  }
  return { codes, hashes: codes.map((c) => sha256(normRecovery(c))) };
}

// Returns the remaining hash list if `code` matched (and removes it), else null.
export function consumeRecoveryCode(hashesJson, code) {
  const hashes = JSON.parse(hashesJson || "[]");
  const h = sha256(normRecovery(code));
  const idx = hashes.indexOf(h);
  if (idx < 0) return null;
  hashes.splice(idx, 1);
  return hashes;
}

// Check a login/step-up factor: TOTP first, then a recovery code. Persists
// the replay counter / consumed recovery code. Returns { ok, via }.
export async function checkSecondFactor(user, code) {
  if (!user.mfaEnabledAt || !user.mfaSecretEnc || !mfaAvailable())
    return { ok: false };
  let secret;
  try {
    secret = decryptSecret(user.mfaSecretEnc);
  } catch {
    return { ok: false };
  }
  const step = verifyTotp(secret, code, { lastStep: user.mfaLastStep });
  if (step != null) {
    // Conditional update makes replay protection race-safe.
    await user.update({ mfaLastStep: step });
    return { ok: true, via: "totp" };
  }
  const left = consumeRecoveryCode(user.mfaRecoveryHashes, code);
  if (left) {
    await user.update({ mfaRecoveryHashes: JSON.stringify(left) });
    return { ok: true, via: "recovery", recoveryLeft: left.length };
  }
  return { ok: false };
}

export function registerMfaRoutes(app, deps) {
  const { User, Session, auth, fail, audit, bcrypt, authLimit, notify, sequelize } = deps;
  const base = "/api/v1/auth/mfa";
  app.use(base, authLimit);

  const ready = (res) =>
    mfaAvailable() ? true : (fail(res, 503, "mfa_unavailable"), false);

  const requiredFor = (u) =>
    config.mfa.requireForAdmins && u.role !== "member";

  app.get("/api/v1/auth/mfa/status", auth, (req, res) => {
    const left = JSON.parse(req.user.mfaRecoveryHashes || "[]").length;
    res.json({
      available: mfaAvailable(),
      enabled: !!req.user.mfaEnabledAt,
      recoveryCodesLeft: req.user.mfaEnabledAt ? left : 0,
      required: requiredFor(req.user),
    });
  });

  app.post("/api/v1/auth/mfa/setup", auth, async (req, res, next) => {
    try {
      if (!ready(res)) return;
      if (req.user.mfaEnabledAt) return fail(res, 409, "mfa_already_enabled");
      const secret = newSecret();
      await req.user.update({ mfaSecretEnc: encryptSecret(secret) });
      res.json({ secret, otpauthUrl: otpauthUrl(secret, req.user.email) });
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/v1/auth/mfa/enable", auth, async (req, res, next) => {
    try {
      if (!ready(res)) return;
      const u = req.user;
      if (u.mfaEnabledAt) return fail(res, 409, "mfa_already_enabled");
      if (!u.mfaSecretEnc) return fail(res, 409, "mfa_setup_required");
      let secret;
      try {
        secret = decryptSecret(u.mfaSecretEnc);
      } catch {
        return fail(res, 409, "mfa_setup_required");
      }
      const step = verifyTotp(secret, req.body.code);
      if (step == null) return fail(res, 400, "invalid_mfa_code");
      const { codes, hashes } = generateRecoveryCodes();
      await u.update({
        mfaEnabledAt: new Date(),
        mfaLastStep: step,
        mfaRecoveryHashes: JSON.stringify(hashes),
      });
      await audit(req, "mfa_enabled", "user", u.id, "");
      res.json({ enabled: true, recoveryCodes: codes });
    } catch (e) {
      next(e);
    }
  });

  // Sensitive changes need BOTH the password and a current second factor.
  async function stepUp(req, res) {
    const u = req.user;
    if (!u.mfaEnabledAt) return fail(res, 409, "mfa_not_enabled"), false;
    const pw = typeof req.body.password === "string" ? req.body.password : "";
    if (!pw || !(await bcrypt.compare(pw, u.passwordHash)))
      return fail(res, 401, "invalid_credentials"), false;
    const r = await checkSecondFactor(u, req.body.code);
    if (!r.ok) return fail(res, 401, "invalid_mfa_code"), false;
    return true;
  }

  app.post("/api/v1/auth/mfa/disable", auth, async (req, res, next) => {
    try {
      if (!(await stepUp(req, res))) return;
      if (requiredFor(req.user)) return fail(res, 403, "mfa_required_for_role");
      await req.user.update({
        mfaEnabledAt: null,
        mfaSecretEnc: null,
        mfaRecoveryHashes: null,
        mfaLastStep: null,
      });
      await audit(req, "mfa_disabled", "user", req.user.id, "");
      res.json({ enabled: false });
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/v1/auth/mfa/recovery-codes", auth, async (req, res, next) => {
    try {
      if (!(await stepUp(req, res))) return;
      const { codes, hashes } = generateRecoveryCodes();
      await req.user.update({ mfaRecoveryHashes: JSON.stringify(hashes) });
      await audit(req, "mfa_recovery_regenerated", "user", req.user.id, "");
      res.json({ recoveryCodes: codes });
    } catch (e) {
      next(e);
    }
  });
}
