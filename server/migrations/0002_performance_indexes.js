// 0002_performance_indexes
// Adds the indexes catalogued in PERFORMANCE_INDEXES (server/db.js): foreign-key
// and sort/filter columns PostgreSQL does not index automatically, plus
// pg_trgm GIN indexes for substring search.
//
// Safe on a live database: every statement is CREATE INDEX IF NOT EXISTS and
// only reads/locks briefly at this table sizes. For very large tables, create
// them manually with CREATE INDEX CONCURRENTLY first (this migration then
// becomes a no-op).
import { ensureIndexes } from "../db.js";
import { logger } from "../logger.js";

export const name = "0002_performance_indexes";

export async function up() {
  const result = await ensureIndexes({ log: (m) => logger.warn("migration.0002", { m }) });
  logger.info("migration.0002.done", result);
}

export async function down() {
  // Dropping indexes is safe (only affects speed) but intentionally manual.
  throw new Error("0002_has_no_automatic_down: drop idx_* indexes manually if required");
}
