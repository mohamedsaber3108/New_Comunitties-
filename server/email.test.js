// Email service tests.
//  - console transport never claims delivery
//  - SMTP transport really speaks SMTP (verified against an in-process fake server)
//  - SES transport builds the correct AWS request (SESClient.send is stubbed;
//    NO real AWS call is made, so SES is "implemented + unit-tested", not
//    "production verified" - that needs real credentials + a verified sender)
//  - templates HTML-escape user-controlled values
//  - the outbox retries failures with backoff and dead-letters after maxAttempts
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import fs from "node:fs";
process.env.NODE_ENV = "test";
process.env.DB_DIALECT = process.env.TEST_DB_DIALECT || "sqlite";
const { prepareTestDatabase } = await import("./test-support.js");
const dropTestDb = await prepareTestDatabase();
process.env.WORKER_ENABLED = "false";
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "usam-email-"));
process.env.SQLITE_PATH = path.join(temp, "db.sqlite");

const { config } = await import("./config.js");
const { sendRawEmail, templates } = await import("./email.js");
const { initDb, sequelize, OutboxMessage } = await import("./db.js");
const jobs = await import("./jobs.js");

// ---- minimal fake SMTP server -------------------------------------------
let smtp, smtpPort;
const received = [];
function startFakeSmtp() {
  return new Promise((resolve) => {
    smtp = net.createServer((sock) => {
      let inData = false, buf = "", current = { rcpt: [], data: "" };
      sock.write("220 fake ESMTP\r\n");
      sock.on("data", (chunk) => {
        buf += chunk.toString("utf8");
        if (inData) {
          if (buf.endsWith("\r\n.\r\n")) {
            current.data = buf;
            received.push(current);
            current = { rcpt: [], data: "" };
            buf = ""; inData = false;
            sock.write("250 queued\r\n");
          }
          return;
        }
        for (const line of buf.split("\r\n").filter(Boolean)) {
          const cmd = line.toUpperCase();
          if (cmd.startsWith("EHLO") || cmd.startsWith("HELO")) sock.write("250-fake\r\n250 8BITMIME\r\n");
          else if (cmd.startsWith("MAIL FROM")) { current.from = line; sock.write("250 OK\r\n"); }
          else if (cmd.startsWith("RCPT TO")) { current.rcpt.push(line); sock.write("250 OK\r\n"); }
          else if (cmd === "DATA") { inData = true; sock.write("354 go\r\n"); }
          else if (cmd === "QUIT") { sock.write("221 bye\r\n"); sock.end(); }
          else sock.write("250 OK\r\n");
        }
        if (!inData) buf = "";
      });
    });
    smtp.listen(0, "127.0.0.1", () => { smtpPort = smtp.address().port; resolve(); });
  });
}

before(async () => {
  await startFakeSmtp();
  await initDb();
});
after(async () => {
  smtp.close();
  await sequelize.close();
  await dropTestDb();
  fs.rmSync(temp, { recursive: true, force: true });
});

test("console transport never claims a message was delivered", async () => {
  config.email.provider = "console";
  const r = await sendRawEmail({ to: "a@b.test", subject: "s", html: "<p>x</p>" });
  assert.equal(r.delivered, false);
  assert.equal(r.transport, "console");
});

test("SMTP transport delivers a real message over a socket", async () => {
  config.email.provider = "smtp";
  Object.assign(config.email.smtp, { host: "127.0.0.1", port: smtpPort, secure: false, user: "", pass: "" });
  const { subject, html, text } = templates.passwordReset({ name: "Sara", link: "https://app.example/reset?token=abc" });
  const r = await sendRawEmail({ to: "sara@example.test", subject, html, text });
  assert.equal(r.delivered, true);
  assert.equal(r.transport, "smtp");
  assert.equal(received.length, 1);
  assert.match(received[0].rcpt[0], /sara@example\.test/);
  assert.match(received[0].data, /Reset your USAM Communities password/);
  // Body is quoted-printable encoded on the wire ("=" becomes "=3D").
  assert.match(received[0].data, /reset\?token=3Dabc/);
});

test("SES transport sends the expected AWS request (client stubbed, no network)", async () => {
  const ses = await import("@aws-sdk/client-ses");
  const sent = [];
  const original = ses.SESClient.prototype.send;
  ses.SESClient.prototype.send = async (command) => { sent.push(command.input); return { MessageId: "stub-123" }; };
  try {
    config.email.provider = "ses";
    config.email.from = "USAM Communities <no-reply@usam.example>";
    const { subject, html, text } = templates.verifyEmail({ name: "Omar", link: "https://app.example/verify-email?token=t" });
    const r = await sendRawEmail({ to: "omar@example.test", subject, html, text });
    assert.deepEqual({ delivered: r.delivered, transport: r.transport, id: r.id }, { delivered: true, transport: "ses", id: "stub-123" });
    assert.equal(sent.length, 1);
    assert.equal(sent[0].Source, "USAM Communities <no-reply@usam.example>");
    assert.deepEqual(sent[0].Destination.ToAddresses, ["omar@example.test"]);
    assert.equal(sent[0].Message.Subject.Charset, "UTF-8");
    assert.match(sent[0].Message.Body.Html.Data, /verify-email\?token=t/);
    assert.ok(sent[0].Message.Body.Text.Data.length > 0);
  } finally {
    ses.SESClient.prototype.send = original;
  }
});

test("templates HTML-escape user-controlled values (no injection into email HTML)", () => {
  const evil = '"><script>alert(1)</script>';
  for (const [name, args] of [
    ["verifyEmail", { name: evil, link: "https://x.test/?a=1&b=2" }],
    ["passwordReset", { name: evil, link: "https://x.test" }],
    ["passwordChanged", { name: evil }],
    ["subscriptionActive", { name: evil, planName: evil }],
    ["notification", { name: evil, text: evil, href: "/home" }],
    ["digest", { name: evil, items: [{ text: evil }] }],
  ]) {
    const { html } = templates[name](args);
    assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/, `${name} must escape markup`);
  }
});

test("outbox: failures retry with backoff, then dead-letter after maxAttempts", async () => {
  jobs.registerHandler("always_fails", async () => { throw new Error("boom: provider down"); });
  const row = await jobs.enqueue("always_fails", { n: 1 });
  await row.update({ maxAttempts: 3 });

  // Attempt 1 -> pending again, scheduled in the future (backoff).
  assert.equal(await jobs.processBatch(10), 1);
  let r = await OutboxMessage.findByPk(row.id);
  assert.equal(r.status, "pending");
  assert.equal(r.attempts, 1);
  assert.ok(r.nextAttemptAt > new Date(), "next attempt must be delayed");
  assert.match(r.lastError, /boom/);
  // Not due yet -> not picked up.
  assert.equal(await jobs.processBatch(10), 0);

  // Force due; attempt 2, then 3 -> dead.
  for (let i = 0; i < 2; i++) {
    await r.update({ nextAttemptAt: new Date(Date.now() - 1000) });
    await jobs.processBatch(10);
    r = await OutboxMessage.findByPk(row.id);
  }
  assert.equal(r.status, "dead");
  assert.equal(r.attempts, 3);
  // Dead rows are never retried automatically.
  await r.update({ nextAttemptAt: new Date(Date.now() - 1000) });
  assert.equal(await jobs.processBatch(10), 0);
});

test("outbox: a transient failure that later succeeds ends as 'sent'", async () => {
  let calls = 0;
  jobs.registerHandler("flaky", async () => { if (++calls < 2) throw new Error("temporary"); });
  const row = await jobs.enqueue("flaky", {});
  await jobs.processBatch(10);
  let r = await OutboxMessage.findByPk(row.id);
  assert.equal(r.status, "pending");
  await r.update({ nextAttemptAt: new Date(Date.now() - 1000) });
  await jobs.processBatch(10);
  r = await OutboxMessage.findByPk(row.id);
  assert.equal(r.status, "sent");
  assert.equal(r.lastError, "");
});
