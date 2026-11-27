// Robustness sweep: every registered API route must answer malformed input
// with a clean 4xx - never a 5xx. Routes are discovered from the live Express
// router, so newly added endpoints are covered automatically.
//
// The caller is a SUPER ADMIN (passes every permission gate) so each handler
// actually runs its own input handling rather than bouncing at auth.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
process.env.NODE_ENV = "test";
process.env.DB_DIALECT = process.env.TEST_DB_DIALECT || "sqlite";
const { prepareTestDatabase } = await import("./test-support.js");
const dropTestDb = await prepareTestDatabase();
process.env.REQUIRE_EMAIL_VERIFICATION = "false";
process.env.WORKER_ENABLED = "false";
process.env.RATE_LIMIT_DISABLED = "true";
// Enable MFA so the fuzz sweep exercises the real handlers, not the "unavailable" stub.
process.env.MFA_ENCRYPTION_KEY = "00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "usam-robust-"));
process.env.SQLITE_PATH = path.join(temp, "db.sqlite");

const { initDb, sequelize, User } = await import("./db.js");
const { default: app } = await import("./index.js");

let server, base, cookie;

// Walk Express 5's router stack and collect { method, path } for /api routes.
function discoverRoutes() {
  const out = [];
  const walk = (stack, prefix = "") => {
    for (const layer of stack) {
      if (layer.route) {
        for (const method of Object.keys(layer.route.methods)) {
          if (layer.route.methods[method]) out.push({ method: method.toUpperCase(), path: prefix + layer.route.path });
        }
      } else if (layer.handle?.stack) {
        walk(layer.handle.stack, prefix);
      }
    }
  };
  walk(app.router.stack);
  return out.filter((r) => typeof r.path === "string" && r.path.startsWith("/api/"));
}

// Session-destroying / environment-altering calls are excluded from the sweep
// (they're covered by their own focused tests).
const SKIP = new Set([
  "POST /api/v1/auth/logout",
  "POST /api/v1/auth/logout-all",
  "DELETE /api/v1/users/me",
  "DELETE /api/v1/users/me/sessions/:id",
]);
const ID_PARAMS = ["id", "attemptId", "memberId", "commentId"];
const fill = (p, idValue = "00000000-0000-4000-8000-000000000000") =>
  p.replace(/:(\w+)/g, (_, name) => (ID_PARAMS.includes(name) ? idValue : "x"));

before(async () => {
  await initDb();
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  await fetch(base + "/api/v1/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Root", email: "root@example.test", password: "abcdef1234", persona: "launchpad" }),
  });
  const r = await fetch(base + "/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "root@example.test", password: "abcdef1234" }),
  });
  cookie = r.headers.get("set-cookie").split(";")[0];
  await User.update({ role: "super_admin", emailVerified: true }, { where: { email: "root@example.test" } });
});
after(async () => {
  server.close();
  await sequelize.close();
  await dropTestDb();
  fs.rmSync(temp, { recursive: true, force: true });
});

test("route discovery finds the whole API surface", () => {
  const routes = discoverRoutes();
  assert.ok(routes.length > 120, `only discovered ${routes.length} routes`);
});

test("no endpoint ever answers malformed input with a 5xx", async () => {
  const payloads = [
    ["empty object", "{}"],
    ["nulls", '{"id":null,"body":null,"title":null,"email":null,"status":null,"community":null}'],
    ["wrong types", '{"id":123,"body":{"a":1},"title":[1,2],"email":true,"status":{},"amountEgp":"abc","capacity":"x"}'],
    ["huge numbers", '{"capacity":1e999,"amountEgp":-1,"quantity":9999999999999,"rating":"NaN"}'],
    ["array root", "[1,2,3]"],
  ];
  const failures = [];
  let calls = 0;
  for (const { method, path: p } of discoverRoutes()) {
    if (SKIP.has(`${method} ${p}`) || method === "GET" || method === "HEAD") continue;
    for (const [label, body] of payloads) {
      calls++;
      const r = await fetch(base + fill(p), {
        method,
        headers: { "Content-Type": "application/json", Cookie: cookie, "Idempotency-Key": "robustness-sweep-key-1" },
        body,
      });
      if (r.status >= 500) failures.push(`${method} ${p} [${label}] -> ${r.status} ${(await r.text()).slice(0, 80)}`);
    }
  }
  assert.ok(calls > 400, `sweep only made ${calls} calls`);
  assert.deepEqual(failures, [], `5xx responses:\n${failures.join("\n")}`);
});

test("malformed IDs in the URL never 5xx (Postgres throws on bad UUID syntax; SQLite doesn't)", async () => {
  const failures = [];
  const badIds = ["not-a-uuid", "1", "' OR 1=1 --", "%00", "../../etc/passwd", "a".repeat(300)];
  for (const { method, path: p } of discoverRoutes()) {
    if (SKIP.has(`${method} ${p}`) || !ID_PARAMS.some((n) => p.includes(`:${n}`))) continue;
    for (const bad of badIds) {
      const r = await fetch(base + fill(p, encodeURIComponent(bad)), {
        method,
        headers: { "Content-Type": "application/json", Cookie: cookie, "Idempotency-Key": "robustness-sweep-key-2" },
        body: method === "GET" || method === "HEAD" ? undefined : "{}",
      });
      if (r.status >= 500) failures.push(`${method} ${p} [id=${bad.slice(0, 12)}] -> ${r.status}`);
    }
  }
  assert.deepEqual(failures, [], `5xx responses:\n${failures.join("\n")}`);
});

test("GET endpoints with junk path parameters and query strings never 5xx", async () => {
  const failures = [];
  const junk = ["?page=abc&pageSize=-5", "?q=%00%ff", "?limit=99999999999", "?locale=zz&status=%27", "?community[]=a&community[]=b"];
  for (const { method, path: p } of discoverRoutes()) {
    if (method !== "GET") continue;
    for (const q of junk) {
      // redirect:"manual" - the OAuth routes answer with redirects to Google /
      // the frontend, which are correct responses, not something to follow.
      // The SSE stream never ends by design, so only its status is read.
      const ctrl = new AbortController();
      const r = await fetch(base + fill(p) + q, {
        headers: { Cookie: cookie },
        redirect: "manual",
        signal: ctrl.signal,
      });
      if (p === "/api/v1/stream") {
        assert.equal(r.status, 200);
        ctrl.abort();
        continue;
      }
      // /export streams a file and /health is covered elsewhere; both must still not 5xx.
      if (r.status >= 500) failures.push(`GET ${p}${q} -> ${r.status}`);
    }
  }
  assert.deepEqual(failures, [], `5xx responses:\n${failures.join("\n")}`);
});
