// -------------------------------------------------------------------------
// Shared security primitives: token hashing, session issuance with device
// metadata, verification-token lifecycle, password policy, and the canonical
// session cookie options. Centralizing these keeps every auth path consistent
// (the monolith previously inlined cookie options in three places).
// -------------------------------------------------------------------------
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import { Op } from "sequelize";
import { config } from "./config.js";

export const SESSION_COOKIE = "usam_session";
export const sessionMs = () => config.sessionDays * 86400000;

export const sha256 = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");

export function cookieOptions(extra = {}) {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure,
    maxAge: sessionMs(),
    path: "/",
    ...extra,
  };
}

// Password policy: >=10 chars, must contain letters and digits, not obviously
// weak. Returns { ok, error }.
export function validatePassword(pw) {
  if (typeof pw !== "string" || pw.length < 10)
    return { ok: false, error: "weak_password" };
  if (pw.length > 200) return { ok: false, error: "weak_password" };
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw))
    return { ok: false, error: "weak_password" };
  return { ok: true };
}

export async function hashPassword(pw) {
  return bcrypt.hash(pw, 12);
}

// Create a session row + return the raw token to set as a cookie. Captures
// IP/user-agent for the device list.
export async function issueSession(Session, userId, req) {
  const token = crypto.randomBytes(32).toString("hex");
  await Session.create({
    UserId: userId,
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + sessionMs()),
    ip: (req?.ip || "").slice(0, 64),
    userAgent: (req?.headers?.["user-agent"] || "").slice(0, 400),
    lastSeenAt: new Date(),
  });
  return token;
}

// Issue a single-use verification/reset token. Returns the RAW token (goes in
// the email link); only its hash is persisted. Invalidates prior unconsumed
// tokens of the same purpose for that user.
export async function issueVerificationToken(
  VerificationToken,
  userId,
  purpose,
  ttlMs,
) {
  await VerificationToken.update(
    { consumedAt: new Date() },
    { where: { UserId: userId, purpose, consumedAt: null } },
  );
  const raw = crypto.randomBytes(32).toString("hex");
  await VerificationToken.create({
    UserId: userId,
    purpose,
    tokenHash: sha256(raw),
    expiresAt: new Date(Date.now() + ttlMs),
  });
  return raw;
}

// Consume a verification token. Returns the token row (with UserId) if valid
// and unexpired, else null. Marks it consumed atomically.
export async function consumeVerificationToken(VerificationToken, raw, purpose) {
  const row = await VerificationToken.findOne({
    where: {
      tokenHash: sha256(raw || ""),
      purpose,
      consumedAt: null,
      expiresAt: { [Op.gt]: new Date() },
    },
  });
  if (!row) return null;
  const [updated] = await VerificationToken.update(
    { consumedAt: new Date() },
    { where: { id: row.id, consumedAt: null } },
  );
  if (!updated) return null; // lost a race
  return row;
}

export const VERIFY_TTL_MS = 24 * 60 * 60 * 1000; // 24h
export const RESET_TTL_MS = 60 * 60 * 1000; // 1h

export default {
  SESSION_COOKIE,
  sha256,
  cookieOptions,
  validatePassword,
  hashPassword,
  issueSession,
  issueVerificationToken,
  consumeVerificationToken,
  VERIFY_TTL_MS,
  RESET_TTL_MS,
};
