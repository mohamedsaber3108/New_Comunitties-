// E2E helpers.
//
// The server runs with WORKER_ENABLED=false, so every email it "sends" stays in
// the OutboxMessages table with its full payload, including the real
// verification / reset link a user would receive. Tests read that link from the
// SQLite file the dev server writes to - no test-only route exists in the app.
import sqlite3 from "sqlite3";
import path from "node:path";
import zlib from "node:zlib";

const dbFile = () => path.join(process.env.E2E_DIR, "e2e.sqlite");

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbFile(), sqlite3.OPEN_READONLY);
    db.all(sql, params, (err, rows) => {
      db.close();
      err ? reject(err) : resolve(rows);
    });
  });
}
function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbFile());
    db.run(sql, params, function (err) {
      db.close();
      err ? reject(err) : resolve(this.changes);
    });
  });
}

// Builds a genuinely valid PNG (solid colour) so image tests never depend on a
// hand-typed base64 blob that could be subtly corrupt.
export function makePng(width = 8, height = 8, [r, g, b] = [214, 91, 57]) {
  const crcTable = new Int32Array(256).map((_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c;
  });
  const crc32 = (buf) => {
    let c = -1;
    for (const byte of buf) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: RGB
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array(width).fill([r, g, b]).flat())]);
  const raw = Buffer.concat(Array(height).fill(row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export const uniqueEmail = (prefix) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`;

// Newest queued email of a template for an address; returns its args.
export async function latestEmail(to, template) {
  for (let i = 0; i < 20; i++) {
    const rows = await all(
      `SELECT payload FROM OutboxMessages WHERE kind = 'email' ORDER BY createdAt DESC`,
    );
    for (const r of rows) {
      const p = JSON.parse(r.payload);
      if (p.to === to && p.template === template) return p.args;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no ${template} email queued for ${to}`);
}

// Same as latestEmail but returns just the token query param of its link.
export async function emailToken(to, template) {
  const args = await latestEmail(to, template);
  return new URL(args.link).searchParams.get("token");
}

// Make an existing account a platform admin (what an operator does with
// `npm run create:admin`).
export const makeAdmin = (email, role = "admin") =>
  run(`UPDATE Users SET role = ?, emailVerified = 1 WHERE email = ?`, [role, email]);

// Always run the UI in English unless a test says otherwise (labels are
// bilingual; English keeps locators readable).
export async function useEnglish(context) {
  await context.addInitScript(() => localStorage.setItem("usam-lang", "en"));
}

export async function signUp(page, { name, email, password = "abcdef1234" }) {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill(name);
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.locator("button.auth-submit").click();
  await page.waitForURL("**/home");
}

export async function logIn(page, { email, password = "abcdef1234" }) {
  await page.goto("/login");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.locator("button.auth-submit").click();
  await page.waitForURL("**/home");
}
