// -------------------------------------------------------------------------
// Lightweight versioned migration runner (no external dependency).
//
// Migrations are modules in server/migrations/*.js, each exporting:
//   export const name = "0001_init";
//   export async function up(queryInterface, Sequelize) { ... }
//   export async function down(queryInterface, Sequelize) { ... }  (optional)
//
// Applied migrations are tracked in a `schema_migrations` table. Each run
// applies pending migrations in filename order inside a transaction (per
// migration) so a failure leaves a clean, known state.
//
// Usage:
//   node server/migrate.js up        # apply all pending
//   node server/migrate.js status    # show applied/pending
//   node server/migrate.js down      # roll back the last applied
//
// For local dev/tests we still use sequelize.sync() (fast, disposable DBs).
// Production uses migrations exclusively (MIGRATIONS=true), never sync().
// -------------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { Sequelize } from "sequelize";
import { sequelize } from "./db.js";
import { logger } from "./logger.js";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

async function ensureTable(qi) {
  await qi.createTable("schema_migrations", {
    name: { type: Sequelize.STRING(200), primaryKey: true, allowNull: false },
    appliedAt: { type: Sequelize.DATE, allowNull: false },
  }).catch(() => {}); // already exists
}

function loadMigrationFiles() {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .sort();
}

async function appliedSet(qi) {
  const [rows] = await sequelize.query("SELECT name FROM schema_migrations");
  return new Set(rows.map((r) => r.name));
}

export async function migrateUp() {
  const qi = sequelize.getQueryInterface();
  await sequelize.authenticate();
  await ensureTable(qi);
  const applied = await appliedSet(qi);
  const files = loadMigrationFiles();
  let count = 0;
  for (const file of files) {
    const mod = await import(pathToFileURL(path.join(dir, file)).href);
    const name = mod.name || file.replace(/\.js$/, "");
    if (applied.has(name)) continue;
    logger.info("migrate.apply", { name });
    const t = await sequelize.transaction();
    try {
      await mod.up(qi, Sequelize, t);
      await sequelize.query(
        `INSERT INTO schema_migrations (name, ${quoteIdent("appliedAt")}) VALUES (:name, :at)`,
        { replacements: { name, at: new Date() }, transaction: t },
      );
      await t.commit();
      count++;
    } catch (err) {
      await t.rollback();
      logger.error("migrate.failed", { name, error: String(err) });
      throw err;
    }
  }
  logger.info("migrate.done", { applied: count });
  return count;
}

export async function migrateStatus() {
  const qi = sequelize.getQueryInterface();
  await ensureTable(qi);
  const applied = await appliedSet(qi);
  const files = loadMigrationFiles().map((f) => f.replace(/\.js$/, ""));
  return files.map((name) => ({ name, applied: applied.has(name) }));
}

export async function migrateDown() {
  const qi = sequelize.getQueryInterface();
  await ensureTable(qi);
  const applied = [...(await appliedSet(qi))].sort();
  const last = applied[applied.length - 1];
  if (!last) return null;
  const file = loadMigrationFiles().find(
    (f) => (f.replace(/\.js$/, "") === last),
  );
  if (!file) throw new Error(`migration_file_missing:${last}`);
  const mod = await import(pathToFileURL(path.join(dir, file)).href);
  if (!mod.down) throw new Error(`no_down:${last}`);
  const t = await sequelize.transaction();
  try {
    await mod.down(qi, Sequelize, t);
    await sequelize.query("DELETE FROM schema_migrations WHERE name = :name", {
      replacements: { name: last },
      transaction: t,
    });
    await t.commit();
    logger.info("migrate.rolled_back", { name: last });
    return last;
  } catch (err) {
    await t.rollback();
    throw err;
  }
}

// Quote an identifier for the active dialect (Postgres/SQLite use ", MySQL `).
function quoteIdent(id) {
  const dialect = sequelize.getDialect();
  return dialect === "mysql" ? `\`${id}\`` : `"${id}"`;
}

// CLI entry.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const cmd = process.argv[2] || "up";
  const run = async () => {
    if (cmd === "up") await migrateUp();
    else if (cmd === "down") await migrateDown();
    else if (cmd === "status") {
      const rows = await migrateStatus();
      for (const r of rows)
        console.log(`${r.applied ? "[x]" : "[ ]"} ${r.name}`);
    } else {
      console.error(`unknown command: ${cmd}`);
      process.exitCode = 1;
    }
    await sequelize.close();
  };
  run().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}

export default { migrateUp, migrateDown, migrateStatus };
