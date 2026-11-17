// Integration tests for avatar upload/removal (server/media.js) and the
// /media static mount for the local storage driver.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
process.env.NODE_ENV = "test";
process.env.DB_DIALECT = process.env.TEST_DB_DIALECT || "sqlite";
const { prepareTestDatabase } = await import("./test-support.js");
const dropTestDb = await prepareTestDatabase();
process.env.REQUIRE_EMAIL_VERIFICATION = "false";
process.env.WORKER_ENABLED = "false";
process.env.STORAGE_DRIVER = "local";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "usam-media-"));
process.env.SQLITE_PATH = path.join(temp, "db.sqlite");
process.env.MEDIA_ROOT = path.join(temp, "media");
process.env.MAX_UPLOAD_BYTES = String(2 * 1024 * 1024); // 2MB, like the default-ish policy

const { initDb, sequelize } = await import("./db.js");
const { default: app } = await import("./index.js");

let server, base, cookie;
async function req(route, method = "GET", body, extraCookie) {
  const r = await fetch(base + "/api/v1" + route, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(extraCookie || cookie ? { Cookie: extraCookie || cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: r.status,
    body: await r.json().catch(() => ({})),
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function pngDataUrl(byteSize) {
  // Real PNG signature + filler so the magic-byte check passes while the
  // total size is exactly `byteSize` (size gating is what these tests probe).
  const buf = Buffer.concat([PNG_SIGNATURE, crypto.randomBytes(Math.max(0, byteSize - PNG_SIGNATURE.length))]);
  return "data:image/png;base64," + buf.toString("base64");
}

before(async () => {
  await initDb();
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${server.address().port}`;
  const signup = await req("/auth/signup", "POST", {
    name: "Avatar Tester",
    email: "avatar@example.test",
    password: "abcdef1234",
    persona: "launchpad",
  });
  cookie = signup.cookie;
});
after(async () => {
  server.close();
  await sequelize.close();
  await dropTestDb();
  fs.rmSync(temp, { recursive: true, force: true });
});

test("rejects a non-image data URL", async () => {
  const r = await req("/users/me/avatar", "POST", {
    image: "data:text/plain;base64,aGVsbG8=",
  });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "invalid_image");
});

test("uploads a small avatar successfully and persists the URL", async () => {
  const r = await req("/users/me/avatar", "POST", {
    image: pngDataUrl(2000),
  });
  assert.equal(r.status, 200);
  assert.ok(r.body.avatarUrl.startsWith("/media/avatars/"));
  const me = await req("/me");
  assert.equal(me.body.user.avatarUrl, r.body.avatarUrl);
});

test("the stored avatar is retrievable via the /media static mount with real content", async () => {
  const upload = await req("/users/me/avatar", "POST", { image: pngDataUrl(2000) });
  const fileRes = await fetch(base + upload.body.avatarUrl);
  assert.equal(fileRes.status, 200);
  // Must be served as a static binary asset, NOT the SPA's index.html
  // fallback (that would be the exact bug this test guards against).
  const contentType = fileRes.headers.get("content-type") || "";
  assert.ok(
    contentType.startsWith("image/"),
    `expected an image content-type, got "${contentType}"`,
  );
  const buf = Buffer.from(await fileRes.arrayBuffer());
  assert.equal(buf.length, 2000);
  assert.ok(!contentType.includes("html"));
});

test("a missing media key returns a real 404, not the SPA fallback", async () => {
  const fileRes = await fetch(base + "/media/avatars/does-not-exist.png");
  assert.equal(fileRes.status, 404);
  const contentType = fileRes.headers.get("content-type") || "";
  assert.ok(!contentType.includes("html"));
});

// This is the regression this test file exists to catch: an upload whose
// encoded body exceeds the GLOBAL express.json 80kb limit (set before the
// media route's own larger parser runs) must still succeed, because the
// storage policy allows up to MAX_UPLOAD_BYTES (2MB here, ~2.7MB as base64).
test("uploads an avatar larger than the global 80kb JSON limit", async () => {
  const bigPayload = pngDataUrl(500_000); // ~500KB raw, well over 80kb encoded
  const r = await req("/users/me/avatar", "POST", { image: bigPayload });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.ok(r.body.avatarUrl);
});

test("rejects an upload moderately beyond the max size with a clean 400", async () => {
  // Just over the 2MB policy but still under the body-parser's hard ceiling
  // (policy * 1.4 + 64KB margin) so server/media.js's own size check is what
  // rejects it, not the raw Express parser.
  // 2.05MB raw -> ~2.87MB base64: over the 2MB policy, under the ~3.0MB ceiling.
  const slightlyTooBig = pngDataUrl(Math.round(2.05 * 1024 * 1024));
  const r = await req("/users/me/avatar", "POST", { image: slightlyTooBig });
  assert.equal(r.status, 400);
  assert.equal(r.body.error, "file_too_large");
});

test("rejects an upload far beyond the body-parser ceiling with 413", async () => {
  const wayTooBig = pngDataUrl(10 * 1024 * 1024); // 10MB, past any margin
  const r = await req("/users/me/avatar", "POST", { image: wayTooBig });
  assert.equal(r.status, 413);
});

test("avatar removal clears the field", async () => {
  await req("/users/me/avatar", "POST", { image: pngDataUrl(2000) });
  const del = await req("/users/me/avatar", "DELETE");
  assert.equal(del.status, 200);
  const me = await req("/me");
  assert.equal(me.body.user.avatarUrl, "");
});

test("content that lies about its type is rejected (HTML/SVG/script disguised as an image)", async () => {
  const disguises = [
    ["image/png", "<html><script>alert(document.cookie)</script></html>"],
    ["image/jpeg", "<?php system($_GET['c']); ?>"],
    ["image/png", "GIF89a-but-declared-png-and-not-png-bytes....."],
  ];
  for (const [mime, payload] of disguises) {
    const r = await req("/users/me/avatar", "POST", {
      image: `data:${mime};base64,` + Buffer.from(payload).toString("base64"),
    });
    assert.equal(r.status, 400, `${mime} disguise must be rejected`);
    assert.equal(r.body.error, "invalid_image");
  }
});

test("SVG (script-capable image format) is not an accepted avatar type", async () => {
  const svg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
  const r = await req("/users/me/avatar", "POST", {
    image: "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64"),
  });
  assert.equal(r.status, 400);
});

test("one member cannot overwrite or delete another member's avatar", async () => {
  const other = await req("/auth/signup", "POST", {
    name: "Other", email: "other-avatar@example.test", password: "abcdef1234", persona: "launchpad",
  });
  const mine = await req("/users/me/avatar", "POST", { image: pngDataUrl(2000) });
  const theirs = await req("/users/me/avatar", "POST", { image: pngDataUrl(3000) }, other.cookie);
  assert.notEqual(mine.body.avatarUrl, theirs.body.avatarUrl);
  await req("/users/me/avatar", "DELETE", null, other.cookie);
  // My avatar is untouched by their deletion.
  assert.equal((await req("/me")).body.user.avatarUrl, mine.body.avatarUrl);
});
