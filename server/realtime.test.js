// Realtime (SSE) + messaging depth: live delivery to the right member only,
// unread counts / previews, newest-first paging with a cursor, auth on the
// stream.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
process.env.NODE_ENV = "test";
process.env.DB_DIALECT = process.env.TEST_DB_DIALECT || "sqlite";
const { prepareTestDatabase, signupLogin } = await import("./test-support.js");
const dropTestDb = await prepareTestDatabase();
process.env.WORKER_ENABLED = "false";
process.env.RATE_LIMIT_DISABLED = "true";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "usam-rt-"));
process.env.SQLITE_PATH = path.join(temp, "db.sqlite");

const { initDb, sequelize, User, Message } = await import("./db.js");
const { default: app } = await import("./index.js");

let server, base, port;
async function req(route, method = "GET", body, cookie) {
  const r = await fetch(base + "/api/v1" + route, {
    method,
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, body: await r.json().catch(() => ({})), cookie: r.headers.get("set-cookie")?.split(";")[0] };
}
async function member(email) {
  const r = await signupLogin(req, { name: "RT " + email.split("@")[0], email, password: "abcdef1234", persona: "launchpad" });
  await User.update({ emailVerified: true }, { where: { email } });
  await req("/me", "PATCH", { messagesEnabled: true, discoverable: true }, r.cookie);
  await req("/communities/launchpad/join", "POST", undefined, r.cookie);
  return { cookie: r.cookie, user: await User.findOne({ where: { email } }) };
}
// Open an SSE stream and collect parsed events.
function openStream(cookie) {
  const events = [];
  let resolveReady;
  const ready = new Promise((r) => (resolveReady = r));
  const reqH = http.get(
    { host: "127.0.0.1", port, path: "/api/v1/stream", headers: { Cookie: cookie, Accept: "text/event-stream" } },
    (res) => {
      events.status = res.statusCode;
      events.headers = res.headers;
      let buf = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        buf += chunk;
        let i;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const frame = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const ev = /^event: (.+)$/m.exec(frame)?.[1];
          const data = /^data: (.+)$/m.exec(frame)?.[1];
          if (ev) events.push({ event: ev, data: data ? JSON.parse(data) : null });
          if (ev === "ready") resolveReady();
        }
      });
      if (res.statusCode !== 200) resolveReady();
    },
  );
  events.close = () => reqH.destroy();
  events.ready = ready;
  return events;
}
const waitFor = async (fn, ms = 3000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return true;
    await new Promise((r) => setTimeout(r, 25));
  }
  return false;
};

let a, b, c, convId;
before(async () => {
  await initDb();
  server = app.listen(0, "127.0.0.1");
  await new Promise((r) => server.once("listening", r));
  port = server.address().port;
  base = `http://127.0.0.1:${port}`;
  a = await member("rt-a@example.test");
  b = await member("rt-b@example.test");
  c = await member("rt-c@example.test");
  convId = (await req("/messages/start", "POST", { username: b.user.username }, a.cookie)).body.id;
});
after(async () => {
  server.closeAllConnections?.();
  server.close();
  await sequelize.close();
  await dropTestDb();
  fs.rmSync(temp, { recursive: true, force: true });
});

test("the stream requires a session", async () => {
  const s = openStream("usam_session=nope");
  await s.ready;
  assert.equal(s.status, 401);
  s.close();
});

test("a sent message is pushed live to the recipient (and not to anyone else)", async () => {
  const sb = openStream(b.cookie);
  const sc = openStream(c.cookie);
  await Promise.all([sb.ready, sc.ready]);
  assert.equal(sb.status, 200);
  assert.match(sb.headers["content-type"], /text\/event-stream/);
  assert.equal(sb.headers["x-accel-buffering"], "no");

  const sent = await req(`/messages/${convId}`, "POST", { body: "live hello" }, a.cookie);
  assert.equal(sent.status, 201);
  assert.ok(await waitFor(() => sb.some((e) => e.event === "message")), "recipient got the message event");
  const ev = sb.find((e) => e.event === "message");
  assert.deepEqual(ev.data, { conversationId: convId, messageId: sent.body.id, senderId: a.user.id });
  assert.ok(!JSON.stringify(ev.data).includes("live hello"), "payload carries ids, not message bodies");
  assert.ok(await waitFor(() => sb.some((e) => e.event === "notification" && e.data.kind === "message")));
  await new Promise((r) => setTimeout(r, 150));
  assert.equal(sc.filter((e) => e.event !== "ready").length, 0, "a third member receives nothing");
  sb.close();
  sc.close();
});

test("reading a thread pushes a read receipt to the sender", async () => {
  const sa = openStream(a.cookie);
  await sa.ready;
  await req(`/messages/${convId}/read`, "PATCH", undefined, b.cookie);
  assert.ok(await waitFor(() => sa.some((e) => e.event === "read" && e.data.conversationId === convId)));
  sa.close();
});

test("conversation list shows the last message and unread count", async () => {
  await req(`/messages/${convId}`, "POST", { body: "first unread" }, a.cookie);
  await req(`/messages/${convId}`, "POST", { body: "second unread" }, a.cookie);
  const listB = await req("/messages", "GET", undefined, b.cookie);
  const item = listB.body.items.find((x) => x.id === convId);
  assert.equal(item.unread, 2);
  assert.equal(listB.body.unreadTotal, 2);
  assert.equal(item.lastMessage.body, "second unread");
  assert.equal(item.lastMessage.mine, false);
  const listA = await req("/messages", "GET", undefined, a.cookie);
  assert.equal(listA.body.items.find((x) => x.id === convId).unread, 0, "own messages are never unread");
  await req(`/messages/${convId}/read`, "PATCH", undefined, b.cookie);
  assert.equal((await req("/messages", "GET", undefined, b.cookie)).body.unreadTotal, 0);
});

test("threads return the NEWEST messages and page back with a cursor", async () => {
  const t0 = Date.now() - 200 * 1000;
  const rows = Array.from({ length: 120 }, (_, i) => ({
    ConversationId: convId,
    SenderId: a.user.id,
    body: `bulk ${i}`,
    createdAt: new Date(t0 + i * 1000),
    updatedAt: new Date(t0 + i * 1000),
  }));
  await Message.bulkCreate(rows);
  await req(`/messages/${convId}`, "POST", { body: "the very latest" }, a.cookie);
  const page1 = await req(`/messages/${convId}`, "GET", undefined, b.cookie);
  assert.equal(page1.body.items.length, 50);
  assert.equal(page1.body.items.at(-1).body, "the very latest", "the newest message is always visible");
  assert.equal(page1.body.hasMore, true);
  const seen = new Set(page1.body.items.map((m) => m.id));
  let cursor = page1.body.nextBefore, total = page1.body.items.length;
  while (cursor) {
    const p = await req(`/messages/${convId}?before=${encodeURIComponent(cursor)}`, "GET", undefined, b.cookie);
    for (const m of p.body.items) {
      assert.ok(!seen.has(m.id), "pages never overlap");
      seen.add(m.id);
    }
    total += p.body.items.length;
    cursor = p.body.nextBefore;
  }
  assert.equal(total, await Message.count({ where: { ConversationId: convId } }));
  assert.equal((await req(`/messages/${convId}?before=garbage`, "GET", undefined, b.cookie)).status, 400);
  // Outsiders still cannot read the thread.
  assert.equal((await req(`/messages/${convId}`, "GET", undefined, c.cookie)).status, 404);
});
