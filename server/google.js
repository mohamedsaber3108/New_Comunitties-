// -------------------------------------------------------------------------
// Google sign-in (OpenID Connect, authorization-code flow with PKCE).
//
//   GET /api/v1/auth/providers          { google: bool }
//   GET /api/v1/auth/google/start       -> 302 to Google (state + PKCE + nonce)
//   GET /api/v1/auth/google/callback    <- Google; exchanges the code, verifies
//                                          the ID token, signs the member in
//
// Security:
//   - state, nonce and the PKCE verifier live in a short-lived httpOnly cookie
//     and must match on the way back (blocks login CSRF / code injection).
//   - The ID token's RS256 signature is verified against Google's published
//     keys (JWKS), plus iss / aud / exp / nonce / email_verified.
//   - Linking to an existing account by email only when Google says the
//     email is verified. Accounts with two-factor on must sign in with
//     password + code (Google sign-in is refused for them, never bypasses MFA).
//   - Suspended / deleted accounts are refused; new accounts obey
//     REGISTRATION_ENABLED.
//
// Configure: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and add
//   {APP_ORIGIN}/api/v1/auth/google/callback as an authorised redirect URI
//   in Google Cloud Console (OAuth client of type "Web application").
// -------------------------------------------------------------------------
import crypto from "node:crypto";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { issueSession, SESSION_COOKIE, cookieOptions } from "./security.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);
const FLOW_COOKIE = "usam_oauth";
const FLOW_TTL_MS = 10 * 60_000;

export const googleConfigured = () =>
  !!(config.google.clientId && config.google.clientSecret);
const redirectUri = () => `${config.appOrigin.replace(/\/$/, "")}/api/v1/auth/google/callback`;
const b64url = (buf) => Buffer.from(buf).toString("base64url");

let jwksCache = { at: 0, keys: [] };
async function googleKeys(force = false) {
  if (!force && Date.now() - jwksCache.at < 3600_000 && jwksCache.keys.length) return jwksCache.keys;
  const r = await fetch(JWKS_URL);
  if (!r.ok) throw new Error(`jwks_http_${r.status}`);
  const json = await r.json();
  jwksCache = { at: Date.now(), keys: json.keys || [] };
  return jwksCache.keys;
}

// Verify a Google ID token. Returns the claims or throws.
export async function verifyIdToken(idToken, { nonce } = {}) {
  const parts = String(idToken || "").split(".");
  if (parts.length !== 3) throw new Error("malformed_id_token");
  const header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  const claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  if (header.alg !== "RS256") throw new Error("unexpected_alg");
  let jwk = (await googleKeys()).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await googleKeys(true)).find((k) => k.kid === header.kid); // key rotation
  if (!jwk) throw new Error("unknown_kid");
  const key = crypto.createPublicKey({ key: jwk, format: "jwk" });
  const ok = crypto.verify(
    "RSA-SHA256",
    Buffer.from(`${parts[0]}.${parts[1]}`),
    key,
    Buffer.from(parts[2], "base64url"),
  );
  if (!ok) throw new Error("bad_signature");
  const now = Math.floor(Date.now() / 1000);
  if (!ISSUERS.has(claims.iss)) throw new Error("bad_issuer");
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(config.google.clientId)) throw new Error("bad_audience");
  if (!(claims.exp > now - 60)) throw new Error("expired");
  if (claims.iat && claims.iat > now + 300) throw new Error("issued_in_future");
  if (nonce && claims.nonce !== nonce) throw new Error("bad_nonce");
  if (!claims.sub) throw new Error("no_subject");
  return claims;
}

export function registerGoogleRoutes(app, deps) {
  const { User, Session, fail, authLimit, audit } = deps;

  const back = (res, path) =>
    res.redirect(302, `${config.frontendUrl.replace(/\/$/, "")}${path}`);
  const loginError = (res, code) => {
    res.clearCookie(FLOW_COOKIE, { path: "/api/v1/auth/google" });
    return back(res, `/login?error=${encodeURIComponent(code)}`);
  };

  app.get("/api/v1/auth/providers", (req, res) =>
    res.json({ google: googleConfigured() }),
  );

  app.use("/api/v1/auth/google", authLimit);

  app.get("/api/v1/auth/google/start", (req, res) => {
    if (!googleConfigured()) return fail(res, 404, "google_signin_unavailable");
    const state = b64url(crypto.randomBytes(24));
    const nonce = b64url(crypto.randomBytes(24));
    const verifier = b64url(crypto.randomBytes(48));
    const challenge = b64url(crypto.createHash("sha256").update(verifier).digest());
    // Only same-site relative paths are accepted as the post-login target.
    const next = String(req.query.next || "");
    const safeNext = /^\/(?!\/)[\w\-/?=&.%]*$/.test(next) ? next.slice(0, 200) : "/home";
    res.cookie(FLOW_COOKIE, JSON.stringify({ state, nonce, verifier, next: safeNext }), {
      httpOnly: true,
      secure: config.cookieSecure,
      // Lax so the cookie survives Google's top-level redirect back to us.
      sameSite: "lax",
      maxAge: FLOW_TTL_MS,
      path: "/api/v1/auth/google",
    });
    const url = new URL(AUTH_URL);
    url.search = new URLSearchParams({
      client_id: config.google.clientId,
      redirect_uri: redirectUri(),
      response_type: "code",
      scope: "openid email profile",
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256",
      prompt: "select_account",
    }).toString();
    res.redirect(302, url.toString());
  });

  app.get("/api/v1/auth/google/callback", async (req, res) => {
    try {
      if (!googleConfigured()) return loginError(res, "google_signin_unavailable");
      let flow;
      try {
        flow = JSON.parse(req.cookies?.[FLOW_COOKIE] || "null");
      } catch {
        flow = null;
      }
      if (req.query.error) return loginError(res, "google_cancelled");
      const state = String(req.query.state || "");
      if (
        !flow?.state ||
        state.length !== flow.state.length ||
        !crypto.timingSafeEqual(Buffer.from(state), Buffer.from(flow.state))
      )
        return loginError(res, "google_state_mismatch");
      const code = String(req.query.code || "");
      if (!code) return loginError(res, "google_failed");

      const tokenRes = await fetch(TOKEN_URL, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: config.google.clientId,
          client_secret: config.google.clientSecret,
          redirect_uri: redirectUri(),
          grant_type: "authorization_code",
          code_verifier: flow.verifier,
        }).toString(),
      });
      const tokens = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || !tokens.id_token) {
        logger.warn("google.token_exchange_failed", { status: tokenRes.status, error: tokens.error });
        return loginError(res, "google_failed");
      }
      let claims;
      try {
        claims = await verifyIdToken(tokens.id_token, { nonce: flow.nonce });
      } catch (err) {
        logger.warn("google.id_token_rejected", { reason: String(err.message || err) });
        return loginError(res, "google_failed");
      }
      const email = String(claims.email || "").toLowerCase();
      if (!email || claims.email_verified !== true) return loginError(res, "google_email_unverified");

      let user = await User.findOne({ where: { googleId: String(claims.sub) } });
      if (!user) {
        const byEmail = await User.findOne({ where: { email } });
        if (byEmail) {
          if (byEmail.isDeleted) return loginError(res, "account_deleted");
          if (byEmail.mfaEnabledAt) return loginError(res, "mfa_password_login_required");
          await byEmail.update({
            googleId: String(claims.sub),
            emailVerified: true,
            emailVerifiedAt: byEmail.emailVerifiedAt || new Date(),
          });
          user = byEmail;
          logger.info("google.linked_existing_account", { userId: user.id });
        } else {
          if (!config.registrationEnabled) return loginError(res, "registration_unavailable");
          user = await User.create({
            name: String(claims.name || email.split("@")[0]).slice(0, 100),
            email,
            username: "u" + crypto.randomBytes(6).toString("hex"),
            // No usable password: login is Google-only until the member sets
            // one through "forgot password".
            passwordHash: `!google:${crypto.randomBytes(16).toString("hex")}`,
            authProvider: "google",
            googleId: String(claims.sub),
            emailVerified: true,
            emailVerifiedAt: new Date(),
            persona: "launchpad",
          });
          logger.info("google.account_created", { userId: user.id });
        }
      }
      if (user.isDeleted || user.status === "deleted") return loginError(res, "account_deleted");
      if (user.status === "suspended") return loginError(res, "account_suspended");
      // Never let a second sign-in route bypass two-factor.
      if (user.mfaEnabledAt) return loginError(res, "mfa_password_login_required");

      await user.update({ lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null });
      const token = await issueSession(Session, user.id, req);
      res.clearCookie(FLOW_COOKIE, { path: "/api/v1/auth/google" });
      res.cookie(SESSION_COOKIE, token, cookieOptions());
      try {
        await audit({ user }, "google_sign_in", "user", user.id, "");
      } catch {}
      return back(res, flow.next || "/home");
    } catch (e) {
      logger.error("google.callback_failed", { error: String(e) });
      return loginError(res, "google_failed");
    }
  });
}

export default { registerGoogleRoutes, verifyIdToken, googleConfigured };
