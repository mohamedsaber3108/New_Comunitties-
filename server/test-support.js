// Test-only helper: gives every test FILE its own isolated database so files
// can run in parallel without trampling each other.
//
//   sqlite   (default)      -> a temp-file database (caller already sets SQLITE_PATH)
//   postgres (TEST_DB_DIALECT=postgres)
//       needs TEST_PG_ADMIN_URL, e.g.
//         postgres://usam:local_dev_only@127.0.0.1:57432/postgres
//       Creates "usam_test_<random>" on that server, points DATABASE_URL at it,
//       and returns a cleanup function that drops it.
//
// Safety: it only ever creates/drops databases whose name it generated itself
// (prefix "usam_test_"), so it cannot touch any pre-existing database.
import crypto from "node:crypto";

// Sign-up is neutral (202, no session), so tests sign up and then log in.
// `req` is the file's own helper: (route, method, body, cookie) -> { status, body, cookie }.
// Returns the login reply: { status: 200, body: { user }, cookie }.
export async function signupLogin(req, body) {
  const s = await req("/auth/signup", "POST", body);
  if (s.status !== 202) return s;
  return req("/auth/login", "POST", { email: body.email, password: body.password });
}

export async function prepareTestDatabase() {
  if (process.env.TEST_DB_DIALECT !== "postgres") return async () => {};
  const adminUrl = process.env.TEST_PG_ADMIN_URL;
  if (!adminUrl) throw new Error("TEST_PG_ADMIN_URL is required for postgres tests");
  const { default: pg } = await import("pg");
  const name = `usam_test_${crypto.randomBytes(6).toString("hex")}`;
  const admin = new pg.Client({ connectionString: adminUrl });
  await admin.connect();
  await admin.query(`CREATE DATABASE "${name}"`);
  await admin.end();

  const url = new URL(adminUrl);
  url.pathname = `/${name}`;
  process.env.DATABASE_URL = url.toString();

  return async function dropTestDatabase() {
    const c = new pg.Client({ connectionString: adminUrl });
    await c.connect();
    await c.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
    await c.end();
  };
}
