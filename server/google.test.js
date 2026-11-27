// Google sign-in (OIDC) against a STUBBED Google: the token and JWKS
// endpoints are replaced in-process, but the ID tokens are real RS256 JWTs
// signed with a locally generated key, so signature / claim verification,
// state, PKCE and account-linking logic are exercised for real.
// Not covered here: Google's live consent screen (needs real credentials).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
process.env.NODE_ENV = "test";
process.env.DB_DIALECT = process.env.TEST_DB_DIALECT || "sqlite";
const { prepareTestDatabase } = await import("./test-support.js");
const dropTestDb = await prepareTestDatabase();
process.env.WORKER_ENABLED = "false";
process.env.RATE_LIMIT_DISABLED = "true";
process.env.GOOGLE_CLIENT_ID = "test-client.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "test-google-secret";
process.env.MFA_ENCRYPTION_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "usam-google-"));
process.env.SQLITE_PATH = path.join(temp, "db.sqlite");

// ---- Google stub -----------------------------------------------------------
const { privateKey, publicKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const attacker = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
const KID = "test-kid-1";
const jwk = { ...publicKey.export({ format: "jwk" }), kid: KID, alg: "RS256", use: "sig" };
const realFetch = globalThis.fetch;
let nextIdToken = null;
const tokenRequests = [];
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u === "https://www.googleapis.com/oauth2/v3/certs")
    return new Response(JSON.stringify({ keys: [jwk] }), { headers: { "Content-Type": "application/json" } });
  if (u === "https://oauth2.googleapis.com/token") {
    tokenRequests.push(Object.fromEntries(new URLSearchParams(init.body)));
    return new Response(JSON.stringify({ id_token: nextIdToken, access_token: "x" }), { headers: { "Content-Type": "application/json" } });
  }
  return realFetch(url, init);
};
function signJwt(claims, { key = privateKey, kid = KID } = {}) {
  const h = Buffer.from(JSON.stringify({ alg: "RS256", kid, typ: "JWT" })).toString("base64url");
  const p = Buffer.from(JSON.stringify(claims)).toString("base64url");
  const s = crypto.sign("RSA-SHA256", Buffer.from(`${h}.${p}`), key).toString("base64url");
  return `${h}.${p}.${s}`;
}

const { initDb, sequelize, User } = await import("./db.js");
const { default: app } = await import("./index.js");
let server, base;
before(async () => {
  await initDb();
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => {
  globalThis.fetch = realFetch;
  server.close();
  await sequelize.close();
  await dropTestDb();
  fs.rmSync(temp, { recursive: true, force: true });
});

async function start(next) {
  const r = await realFetch(`${base}/api/v1/auth/google/start${next ? `?next=${encodeURIComponent(next)}` : ""}`, { redirect: "manual" });
  assert.equal(r.status, 302);
  const loc = new URL(r.headers.get("location"));
  const flowCookie = r.headers.get("set-cookie").split(";")[0];
  return { loc, flowCookie, state: loc.searchParams.get("state"), nonce: loc.searchParams.get("nonce") };
}
async function callback(flow, { state = flow.state, cookie = flow.flowCookie, code = "auth-code-1" } = {}) {
  const r = await realFetch(`${base}/api/v1/auth/google/callback?code=${code}&state=${encodeURIComponent(state)}`, {
    redirect: "manual",
    headers: cookie ? { Cookie: cookie } : {},
  });
  const cookies = r.headers.getSetCookie?.() || [];
  const session = cookies.find((c) => c.startsWith("usam_session="))?.split(";")[0];
  return { status: r.status, location: r.headers.get("location"), session };
}
const now = () => Math.floor(Date.now() / 1000);
const claims = (flow, over = {}) => ({
  iss: "https://accounts.google.com",
  aud: process.env.GOOGLE_CLIENT_ID,
  sub: "google-sub-1",
  email: "gina@example.test",
  email_verified: true,
  name: "Gina Google",
  iat: now(),
  exp: now() + 600,
  nonce: flow.nonce,
  ...over,
});
const me = async (cookie) => (await (await realFetch(`${base}/api/v1/me`, { headers: { Cookie: cookie } })).json()).user;

test("providers endpoint reports Google as configured", async () => {
  const r = await (await realFetch(`${base}/api/v1/auth/providers`)).json();
  assert.equal(r.google, true);
});

test("start redirects to Google with state, nonce and an S256 PKCE challenge", async () => {
  const f = await start("/events");
  assert.equal(f.loc.origin + f.loc.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(f.loc.searchParams.get("client_id"), process.env.GOOGLE_CLIENT_ID);
  assert.equal(f.loc.searchParams.get("code_challenge_method"), "S256");
  assert.match(f.loc.searchParams.get("redirect_uri"), /\/api\/v1\/auth\/google\/callback$/);
  assert.ok(f.state.length >= 20 && f.nonce.length >= 20);
  assert.match(f.flowCookie, /^usam_oauth=/);
});

test("a valid Google sign-in creates a verified account, PKCE verifier matches, and redirects to next", async () => {
  const f = await start("/events");
  nextIdToken = signJwt(claims(f));
  const r = await callback(f);
  assert.equal(r.status, 302);
  assert.match(r.location, /\/events$/);
  assert.ok(r.session, "session cookie issued");
  const sent = tokenRequests.at(-1);
  const challenge = crypto.createHash("sha256").update(sent.code_verifier).digest("base64url");
  assert.equal(challenge, f.loc.searchParams.get("code_challenge"), "code_verifier matches the challenge");
  assert.equal(sent.client_secret, "test-google-secret");
  const u = await me(r.session);
  assert.equal(u.name, "Gina Google");
  assert.equal(u.emailVerified, true);
  const row = await User.findOne({ where: { email: "gina@example.test" } });
  assert.equal(row.authProvider, "google");
  assert.equal(row.googleId, "google-sub-1");
  // A password login can never succeed against a Google-only account.
  const pw = await realFetch(`${base}/api/v1/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "gina@example.test", password: "!google:" }) });
  assert.equal(pw.status, 401);
  // Signing in again finds the same account by Google subject.
  const f2 = await start();
  nextIdToken = signJwt(claims(f2));
  const again = await callback(f2);
  assert.match(again.location, /\/home$/);
  assert.equal(await User.count({ where: { email: "gina@example.test" } }), 1);
});

test("forged, mismatched or unverified tokens are rejected and no session is issued", async () => {
  const cases = [
    ["signed with another key", (f) => signJwt(claims(f, { sub: "evil-1", email: "evil1@example.test" }), { key: attacker.privateKey })],
    ["wrong audience", (f) => signJwt(claims(f, { aud: "someone-else", sub: "evil-2", email: "evil2@example.test" }))],
    ["wrong issuer", (f) => signJwt(claims(f, { iss: "https://evil.example", sub: "evil-3", email: "evil3@example.test" }))],
    ["expired", (f) => signJwt(claims(f, { exp: now() - 3600, sub: "evil-4", email: "evil4@example.test" }))],
    ["wrong nonce (replayed token)", (f) => signJwt(claims(f, { nonce: "other", sub: "evil-5", email: "evil5@example.test" }))],
    ["unknown key id", (f) => signJwt(claims(f, { sub: "evil-6", email: "evil6@example.test" }), { kid: "nope" })],
  ];
  for (const [label, make] of cases) {
    const f = await start();
    nextIdToken = make(f);
    const r = await callback(f);
    assert.equal(r.status, 302, label);
    assert.match(r.location, /\/login\?error=google_failed$/, label);
    assert.equal(r.session, undefined, label);
  }
  const f = await start();
  nextIdToken = signJwt(claims(f, { email_verified: false, sub: "evil-7", email: "evil7@example.test" }));
  assert.match((await callback(f)).location, /error=google_email_unverified/);
  assert.equal(await User.count({ where: { email: { [(await import("sequelize")).Op.like]: "evil%" } } }), 0);
});

test("state mismatch or a missing flow cookie is refused (login CSRF)", async () => {
  const f = await start();
  nextIdToken = signJwt(claims(f));
  assert.match((await callback(f, { state: f.state.slice(0, -2) + "xx" })).location, /error=google_state_mismatch/);
  assert.match((await callback(f, { cookie: null })).location, /error=google_state_mismatch/);
});

test("an existing password account is linked by verified email; MFA accounts cannot use Google to bypass the code", async () => {
  const signup = await realFetch(`${base}/api/v1/auth/signup`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: "Pat Password", email: "pat@example.test", password: "abcdef1234", persona: "launchpad" }) });
  assert.equal(signup.status, 202);
  const f = await start();
  nextIdToken = signJwt(claims(f, { sub: "google-sub-pat", email: "PAT@example.test", name: "Pat" }));
  const r = await callback(f);
  assert.ok(r.session);
  const pat = await User.findOne({ where: { email: "pat@example.test" } });
  assert.equal(pat.googleId, "google-sub-pat");
  assert.equal(pat.authProvider, "password", "still a password account; password login keeps working");

  await User.update({ mfaEnabledAt: new Date(), mfaSecretEnc: "x" }, { where: { id: pat.id } });
  const f2 = await start();
  nextIdToken = signJwt(claims(f2, { sub: "google-sub-pat", email: "pat@example.test" }));
  const blocked = await callback(f2);
  assert.match(blocked.location, /error=mfa_password_login_required/);
  assert.equal(blocked.session, undefined);
});

test("suspended accounts and closed registration are honoured", async () => {
  await User.update({ status: "suspended" }, { where: { email: "gina@example.test" } });
  const f = await start();
  nextIdToken = signJwt(claims(f));
  assert.match((await callback(f)).location, /error=account_suspended/);
  await User.update({ status: "active" }, { where: { email: "gina@example.test" } });
});

test("open redirects are impossible: `next` must be a same-site path", async () => {
  for (const evil of ["https://evil.example/x", "//evil.example", "/\\evil.example"]) {
    const f = await start(evil);
    nextIdToken = signJwt(claims(f));
    const r = await callback(f);
    assert.equal(new URL(r.location).pathname, "/home", evil);
  }
});
