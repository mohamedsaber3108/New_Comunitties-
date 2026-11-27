// Security regression suite: headers, cookies, CSRF/origin, injection,
// authorization (IDOR / mass-assignment), rate limiting, error hygiene.
// Rate limiting is deliberately ENABLED here (with a low auth threshold).
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
process.env.NODE_ENV = "test";
process.env.DB_DIALECT = process.env.TEST_DB_DIALECT || "sqlite";
const { prepareTestDatabase, signupLogin } = await import("./test-support.js");
const dropTestDb = await prepareTestDatabase();
process.env.REQUIRE_EMAIL_VERIFICATION = "false";
process.env.WORKER_ENABLED = "false";
// This suite verifies rate limiting, so it must run with limiting ON no matter
// what the surrounding shell/CI environment says.
delete process.env.RATE_LIMIT_DISABLED;
process.env.RATE_LIMIT_AUTH_PER_15MIN = "6";
process.env.RATE_LIMIT_FORGOT_PER_HOUR = "2";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "usam-sec-"));
process.env.SQLITE_PATH = path.join(temp, "db.sqlite");

const { initDb, sequelize, User, Notification } = await import("./db.js");
const { default: app } = await import("./index.js");

let server, base;
const u = {};
async function raw(route, { method = "GET", body, cookie, headers = {} } = {}) {
  return fetch(base + route, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}), ...headers },
    body: body == null ? undefined : JSON.stringify(body),
  });
}
async function req(route, method = "GET", body, who) {
  const r = await raw("/api/v1" + route, { method, body, cookie: who?.cookie });
  return { status: r.status, body: await r.json().catch(() => ({})), cookie: r.headers.get("set-cookie")?.split(";")[0], res: r };
}
async function signup(key) {
  const r = await signupLogin(req, { name: `Sec ${key}`, email: `${key}@example.test`, password: "abcdef1234", persona: "launchpad" });
  u[key] = { cookie: r.cookie, id: r.body.user.id, username: r.body.user.username, email: `${key}@example.test` };
}

before(async () => {
  await initDb();
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  await signup("alice");
  await signup("mallory");
});
after(async () => {
  server.close();
  await sequelize.close();
  await dropTestDb();
  fs.rmSync(temp, { recursive: true, force: true });
});

test("security headers are present on API and page responses", async () => {
  for (const route of ["/api/v1/plans", "/"]) {
    const r = await raw(route);
    assert.equal(r.headers.get("x-content-type-options"), "nosniff", route);
    assert.equal(r.headers.get("x-frame-options"), "DENY", route);
    assert.equal(r.headers.get("x-powered-by"), null, route);
    const csp = r.headers.get("content-security-policy") || "";
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /object-src 'none'/);
    assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
    assert.doesNotMatch(csp, /script-src[^;]*unsafe-eval/);
  }
  assert.equal((await raw("/api/v1/plans")).headers.get("cache-control"), "no-store");
});

test("session cookie is HttpOnly + SameSite=Lax + scoped to /", async () => {
  const r = await raw("/api/v1/auth/login", { method: "POST", body: { email: "alice@example.test", password: "abcdef1234" } });
  const setCookie = r.headers.get("set-cookie") || "";
  assert.match(setCookie, /usam_session=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.match(setCookie, /Path=\//);
  // The raw session token is never echoed in the body.
  assert.doesNotMatch(JSON.stringify(await r.json()), /usam_session|tokenHash|passwordHash/);
});

test("cross-origin state-changing requests are rejected; same-origin allowed", async () => {
  const evil = await raw("/api/v1/posts", { method: "POST", cookie: u.alice.cookie, headers: { Origin: "https://evil.example" }, body: { body: "x".repeat(20), community: "launchpad" } });
  assert.equal(evil.status, 403);
  assert.equal((await evil.json()).error, "origin_rejected");
  const evilNull = await raw("/api/v1/users/me/change-password", { method: "POST", cookie: u.alice.cookie, headers: { Origin: "null" }, body: {} });
  assert.equal(evilNull.status, 403);
  const same = await raw("/api/v1/users/me/sessions", { cookie: u.alice.cookie, headers: { Origin: base } });
  assert.equal(same.status, 200);
});

test("SQL injection strings are inert (parameterised queries)", async () => {
  const payloads = ["' OR '1'='1", "'; DROP TABLE \"Users\"; --", "admin'--", "\" OR 1=1 --"];
  for (const p of payloads) {
    const login = await req("/auth/login", "POST", { email: p, password: p });
    assert.ok([400, 401, 429].includes(login.status), `login with ${p} -> ${login.status}`);
    const search = await req(`/search?q=${encodeURIComponent(p)}`);
    assert.ok(search.status < 500, `search with ${p} -> ${search.status}`);
    const member = await req(`/members/${encodeURIComponent(p)}`);
    assert.equal(member.status, 404);
  }
  assert.ok((await User.count()) >= 2, "Users table must still exist and be intact");
});

test("mass assignment: clients cannot grant themselves roles or verification", async () => {
  const signupAttack = await signupLogin(req, { name: "Evil Admin", email: "evil@example.test", password: "abcdef1234", persona: "launchpad", role: "super_admin", emailVerified: true, status: "active" });
  assert.equal(signupAttack.status, 200);
  assert.equal(signupAttack.body.user.role, "member");
  const evil = await User.findOne({ where: { email: "evil@example.test" } });
  assert.equal(evil.role, "member");
  assert.equal(evil.emailVerified, false);

  const patch = await req("/me", "PATCH", { role: "admin", emailVerified: true, status: "active", passwordHash: "x", email: "hijack@example.test", name: "Alice Renamed" }, u.alice);
  assert.equal(patch.status, 200);
  const alice = await User.findByPk(u.alice.id);
  assert.equal(alice.role, "member");
  assert.equal(alice.email, "alice@example.test");
  assert.notEqual(alice.passwordHash, "x");
  assert.equal(alice.name, "Alice Renamed", "legit fields still update");
});

test("authorization: members cannot touch each other's resources (IDOR)", async () => {
  const join = await req("/communities/launchpad/join", "POST", null, u.alice);
  assert.equal(join.status, 200, `join failed: ${JSON.stringify(join.body)}`);
  const post = await req("/posts", "POST", { body: "Alice's private-ish thoughts about pricing.", community: "launchpad" }, u.alice);
  const postId = post.body.id || post.body.item?.id;
  assert.ok(postId, `post creation failed: ${post.status} ${JSON.stringify(post.body)}`);
  // Mallory cannot edit or delete Alice's post.
  assert.equal((await req(`/posts/${postId}`, "PATCH", { body: "defaced by mallory" }, u.mallory)).status, 403);
  assert.equal((await req(`/posts/${postId}`, "DELETE", null, u.mallory)).status, 403);
  // Mallory cannot end Alice's sessions.
  const aliceSessions = (await req("/users/me/sessions", "GET", null, u.alice)).body.items;
  assert.equal((await req(`/users/me/sessions/${aliceSessions[0].id}`, "DELETE", null, u.mallory)).status, 404);
  assert.ok((await req("/users/me/sessions", "GET", null, u.alice)).body.items.length >= 1);
  // Mallory cannot mark Alice's notifications read or read them.
  const n = await Notification.create({ UserId: u.alice.id, kind: "t", text: "secret note", href: "/home" });
  await req(`/notifications/${n.id}/read`, "PATCH", null, u.mallory);
  assert.equal((await Notification.findByPk(n.id)).readAt, null);
  assert.ok(!JSON.stringify((await req("/notifications", "GET", null, u.mallory)).body).includes("secret note"));
  // Mallory cannot read Alice's billing/payments/export.
  assert.equal((await req("/payments/mine", "GET", null, u.mallory)).body.items.length, 0);
  assert.equal((await req("/users/me/export", "GET", null, u.mallory)).body.email, "mallory@example.test");
  // Anonymous callers get 401 on every personal endpoint.
  for (const r of ["/me/summary", "/billing", "/users/me/sessions", "/users/me/export", "/notifications", "/messages", "/payments/mine", "/saved"]) {
    assert.equal((await req(r)).status, 401, r);
  }
});

test("stored markup is returned as inert JSON text and uploads can't carry scripts", async () => {
  const payload = '<img src=x onerror=alert(1)><script>alert(2)</script>';
  await req("/me", "PATCH", { bio: payload, discoverable: true }, u.alice);
  const r = await req("/members/" + u.alice.username);
  assert.match(r.res.headers.get("content-type"), /application\/json/);
  assert.equal(r.res.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.body.item.bio, payload, "stored verbatim; the React UI escapes on render");
});

test("error responses do not leak internals", async () => {
  const bad = await raw("/api/v1/auth/login", { method: "POST", body: undefined, headers: {} });
  const malformed = await fetch(base + "/api/v1/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{not json" });
  const text = await malformed.text();
  assert.equal(malformed.status, 400);
  assert.equal(JSON.parse(text).error, "invalid_json", "parser internals must not be echoed");
  assert.doesNotMatch(text, /node_modules|at .*\.js:\d+|Sequelize|SQLITE|stack/i);
  const notFound = await req("/definitely-not-a-route");
  assert.equal(notFound.status, 404);
  void bad;
});

test("oversized JSON bodies are refused", async () => {
  const r = await raw("/api/v1/contact", { method: "POST", body: { name: "x", email: "a@b.co", message: "y".repeat(200_000), topic: "general" } });
  assert.equal(r.status, 413);
});

test("login does not reveal whether an account exists", async () => {
  const unknown = await req("/auth/login", "POST", { email: "nobody-here@example.test", password: "whatever12345" });
  const wrong = await req("/auth/login", "POST", { email: "alice@example.test", password: "whatever12345" });
  assert.equal(unknown.status, 401);
  assert.equal(wrong.status, 401);
  assert.deepEqual(unknown.body, wrong.body);
});

test("brute force is throttled: repeated bad logins for one account hit 429", async () => {
  let last;
  for (let i = 0; i < 9; i++) last = await req("/auth/login", "POST", { email: "brute@example.test", password: "guess" + i });
  assert.equal(last.status, 429);
  assert.equal(last.body.error, "too_many_requests");
  assert.ok(last.res.headers.get("retry-after"));
});

test("password-reset mail-bombing a single address is capped", async () => {
  const statuses = [];
  for (let i = 0; i < 4; i++) statuses.push((await req("/auth/password/forgot", "POST", { email: "bomb-target@example.test" })).status);
  assert.deepEqual(statuses.slice(0, 2), [200, 200]);
  assert.equal(statuses[3], 429);
});

test("requests with a missing/incorrect Content-Type are rejected with 4xx, never a 500", async () => {
  // Regression: the frontend's api() helper once dropped Content-Type whenever a
  // caller passed its own headers (checkout's Idempotency-Key), so the server
  // received an unparsed body and threw a TypeError (HTTP 500).
  const cases = [
    ["/api/v1/subscriptions", { "Idempotency-Key": "regression-key-000001" }, '{"planCode":"plus","billingCycle":"monthly"}'],
    ["/api/v1/posts", {}, '{"body":"hello there","community":"launchpad"}'],
    ["/api/v1/auth/login", { "Content-Type": "text/plain" }, "email=a&password=b"],
    ["/api/v1/contact", { "Content-Type": "application/x-www-form-urlencoded" }, "name=x"],
  ];
  for (const [route, headers, body] of cases) {
    const r = await fetch(base + route, {
      method: "POST",
      headers: { Cookie: u.alice.cookie, ...headers }, // deliberately NO application/json
      body,
    });
    assert.ok(r.status >= 400 && r.status < 500, `${route} -> ${r.status} (must be 4xx, not 5xx)`);
  }
});

test("control characters are stripped from input but multi-line text is preserved", async () => {
  await req("/communities/launchpad/join", "POST", null, u.alice);
  const multi = "First paragraph.\n\nSecond paragraph with a\ttab.\nThird line.";
  const created = await req("/posts", "POST", { body: multi + "\u0000\u0007", community: "launchpad" }, u.alice);
  assert.equal(created.status, 201);
  const fetched = await req(`/posts/${created.body.id}`, "GET", null, u.alice);
  const stored = fetched.body.item?.body ?? fetched.body.post?.body ?? fetched.body.body;
  assert.equal(stored, multi, "newlines/tabs kept; NUL and BEL removed");
  // A NUL in a search query must not crash the query layer.
  assert.equal((await req("/search?q=%00%ffab")).status, 200);
  assert.equal((await req("/admin/users?q=%00%ffab", "GET", null, u.alice)).status, 403);
});
