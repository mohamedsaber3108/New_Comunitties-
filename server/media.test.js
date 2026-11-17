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

const { makePng, makeJpegWithExif, dataUrl } = await import("./test-images.js");
function pngDataUrl(byteSize) {
  // A structurally valid PNG padded with a private chunk to exactly
  // `byteSize` bytes (size gating is what these tests probe).
  return dataUrl("image/png", makePng({ totalBytes: byteSize }));
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

// ---- Post images -------------------------------------------------------
test("EXIF/GPS and text metadata are stripped before an image is stored", async () => {
  const { stripMetadata, imageSize } = await import("./storage.js");
  const jpeg = makeJpegWithExif("GPS:30.0444N,31.2357E");
  const clean = stripMetadata("image/jpeg", jpeg);
  assert.ok(jpeg.includes("GPS:30.0444N"));
  assert.ok(!clean.includes("GPS:30.0444N"), "EXIF segment removed");
  assert.ok(clean.includes("JFIF"), "JFIF header kept");
  assert.deepEqual(imageSize("image/jpeg", clean), { width: 640, height: 480 });
  const png = makePng({ width: 33, height: 21, extraChunks: [["tEXt", Buffer.from("Author\0Secret Person")], ["eXIf", Buffer.from("GPS-in-png")]] });
  const cleanPng = stripMetadata("image/png", png);
  assert.ok(!cleanPng.includes("Secret Person") && !cleanPng.includes("GPS-in-png"));
  assert.deepEqual(imageSize("image/png", cleanPng), { width: 33, height: 21 });
  // Truncated/garbled structure is refused, not stored.
  assert.equal(stripMetadata("image/png", png.subarray(0, 40)), null);

  // End to end: the stored file no longer contains the location.
  const up = await req("/media/images", "POST", { image: dataUrl("image/jpeg", jpeg) });
  assert.equal(up.status, 201, JSON.stringify(up.body));
  assert.equal(up.body.width, 640);
  const stored = Buffer.from(await (await fetch(base + up.body.url)).arrayBuffer());
  assert.ok(!stored.includes("GPS:30.0444N"));
});

test("post images: upload, attach to a post (max 4, own only), shown on the post, deleted with it", async () => {
  await req("/communities/launchpad/join", "POST");
  const ids = [];
  for (let i = 0; i < 5; i++) {
    const r = await req("/media/images", "POST", { image: dataUrl("image/png", makePng({ width: 10 + i, height: 10 })), alt: `pic ${i}` });
    assert.equal(r.status, 201);
    assert.match(r.body.url, /^\/media\/posts\//);
    ids.push(r.body.id);
  }
  assert.equal((await req("/posts", "POST", { community: "launchpad", body: "five pics", imageIds: ids })).status, 400, "max 4");
  // Another member cannot attach my uploads.
  const other = await req("/auth/signup", "POST", { name: "Thief", email: "thief@example.test", password: "abcdef1234", persona: "launchpad" });
  await req("/communities/launchpad/join", "POST", undefined, other.cookie);
  const steal = await req("/posts", "POST", { community: "launchpad", body: "not mine", imageIds: [ids[0]] }, other.cookie);
  assert.equal(steal.status, 400);
  assert.equal((await req(`/media/images/${ids[0]}`, "DELETE", null, other.cookie)).status, 404);

  const created = await req("/posts", "POST", { community: "launchpad", body: "three pics", imageIds: [ids[2], ids[0], ids[1]] });
  assert.equal(created.status, 201);
  const post = (await req(`/posts/${created.body.id}`)).body.item;
  assert.deepEqual(post.images.map((i) => i.id), [ids[2], ids[0], ids[1]], "order preserved");
  assert.equal(post.images[0].width, 12);
  assert.equal(post.images[1].alt, "pic 0");
  const feed = await req("/posts?community=launchpad");
  assert.equal(feed.body.items.find((p) => p.id === created.body.id).images.length, 3);
  // Already-attached images cannot be reused or deleted directly.
  assert.equal((await req("/posts", "POST", { community: "launchpad", body: "reuse", imageIds: [ids[0]] })).status, 400);
  assert.equal((await req(`/media/images/${ids[0]}`, "DELETE")).status, 409);
  // Unattached upload can be discarded by its owner.
  assert.equal((await req(`/media/images/${ids[4]}`, "DELETE")).status, 200);

  // Author deletes the post -> files are gone from storage.
  const url = post.images[0].url;
  assert.equal((await fetch(base + url)).status, 200);
  assert.equal((await req(`/posts/${created.body.id}`, "DELETE")).status, 200);
  assert.equal((await fetch(base + url)).status, 404);
});

test("housekeeping removes uploads that were never attached to a post", async () => {
  const { MediaAsset, Session, VerificationToken, OutboxMessage, WebhookEvent, Notification, User } = await import("./db.js");
  const { runHousekeeping } = await import("./housekeeping.js");
  const r = await req("/media/images", "POST", { image: dataUrl("image/png", makePng()) });
  await MediaAsset.update({ createdAt: new Date(Date.now() - 2 * 86400_000) }, { where: { id: r.body.id }, silent: true });
  const stats = await runHousekeeping({ Session, VerificationToken, OutboxMessage, WebhookEvent, Notification, MediaAsset, User, models: sequelize.models });
  assert.ok(stats.orphanImages >= 1);
  assert.equal(await MediaAsset.findByPk(r.body.id), null);
  assert.equal((await fetch(base + r.body.url)).status, 404);
});