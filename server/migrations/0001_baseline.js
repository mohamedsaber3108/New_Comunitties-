// 0001_baseline
// Creates the full current schema from the Sequelize model definitions.
//
// Rationale: the models in server/db.js are the single source of truth and
// the schema has been validated by the integration test suite. For a fresh
// database, syncing the models IS the correct initial schema. Every schema
// change AFTER this baseline must be a hand-written, reviewable delta
// migration (0002_*, 0003_*, ...) so production never relies on sync() again.
//
// This migration is safe to run against an empty database only. On an existing
// populated database, skip it (mark as applied) and start from the first delta.
import { sequelize } from "../db.js";

export const name = "0001_baseline";

export async function up() {
  // alter:false — create missing tables without destructive column changes.
  await sequelize.sync();
}

export async function down() {
  // Intentionally no destructive down for the baseline. Dropping the entire
  // schema must be a deliberate manual operation, not a one-command rollback.
  throw new Error("baseline_migration_has_no_down");
}
