// -------------------------------------------------------------------------
// Durable background job + email queue, backed by the OutboxMessage table.
//
// enqueue(kind, payload) writes a pending row. The worker claims due rows
// (status=pending, nextAttemptAt<=now) one batch at a time, runs the matching
// handler, and on failure reschedules with exponential backoff until
// maxAttempts, after which the row is marked "dead" for inspection.
//
// Running through the DB means jobs survive restarts and can be inspected /
// retried by an admin. A single-instance in-process worker is enough for the
// current EC2 single-node target; the claim uses a short lock window so a
// future multi-worker setup degrades gracefully rather than double-sending.
// -------------------------------------------------------------------------
import { Op } from "sequelize";
import { sequelize, OutboxMessage } from "./db.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { sendRawEmail, templates } from "./email.js";

const handlers = new Map();

export function registerHandler(kind, fn) {
  handlers.set(kind, fn);
}

export async function enqueue(kind, payload = {}, { delayMs = 0 } = {}) {
  return OutboxMessage.create({
    kind,
    payload: JSON.stringify(payload),
    status: "pending",
    nextAttemptAt: new Date(Date.now() + delayMs),
  });
}

// Convenience: enqueue a templated email. The template name + args are stored
// so the worker builds the message at send time.
export async function enqueueEmail(to, template, args = {}) {
  return enqueue("email", { to, template, args });
}

// ---- Built-in handlers --------------------------------------------------
registerHandler("email", async (payload) => {
  const { to, template, args } = payload;
  const builder = templates[template];
  if (!builder) throw new Error(`unknown_email_template:${template}`);
  const { subject, html, text } = builder(args || {});
  const result = await sendRawEmail({ to, subject, html, text });
  // console transport returns delivered:false; that is a successful no-op in
  // dev, not a retryable error.
  return result;
});

function backoffMs(attempts) {
  // 30s, 2m, 8m, 32m, 2h, capped ~ exponential (base 4).
  const base = 30_000 * Math.pow(4, Math.max(0, attempts - 1));
  return Math.min(base, 2 * 60 * 60 * 1000);
}

// Claim + process a single batch. Returns number of rows processed.
export async function processBatch(batchSize = config.worker.batchSize) {
  const now = new Date();
  const due = await OutboxMessage.findAll({
    where: { status: "pending", nextAttemptAt: { [Op.lte]: now } },
    order: [["nextAttemptAt", "ASC"]],
    limit: batchSize,
  });
  let processed = 0;
  for (const row of due) {
    // Optimistic claim: flip pending->processing only if still pending.
    const [claimed] = await OutboxMessage.update(
      { status: "processing", lockedAt: new Date() },
      { where: { id: row.id, status: "pending" } },
    );
    if (!claimed) continue;
    processed++;
    try {
      const handler = handlers.get(row.kind);
      if (!handler) throw new Error(`no_handler:${row.kind}`);
      const payload = JSON.parse(row.payload || "{}");
      await handler(payload, row);
      // NOTE: always transition via a static update keyed by id. The row was
      // claimed (pending -> processing) with a static update, so the in-memory
      // `row.status` is stale ("pending"); an instance .update({status:"pending"})
      // would be treated as "no change" and silently NOT written, stranding the
      // job in "processing" forever (caught by email.test.js).
      await OutboxMessage.update(
        { status: "sent", lastError: "", lockedAt: null },
        { where: { id: row.id } },
      );
    } catch (err) {
      const attempts = row.attempts + 1;
      const dead = attempts >= row.maxAttempts;
      await OutboxMessage.update(
        {
          status: dead ? "dead" : "pending",
          attempts,
          nextAttemptAt: dead ? row.nextAttemptAt : new Date(Date.now() + backoffMs(attempts)),
          lastError: String(err && err.message ? err.message : err).slice(0, 2000),
          lockedAt: null,
        },
        { where: { id: row.id } },
      );
      logger.warn("job.failed", {
        id: row.id,
        kind: row.kind,
        attempts,
        dead,
        error: String(err && err.message ? err.message : err),
      });
    }
  }
  return processed;
}

// ---- Recurring scheduled tasks -------------------------------------------
// Simple in-process scheduler for periodic maintenance (payment reconcile,
// subscription expiry, housekeeping). Each task is wrapped so one failure
// never stops others; runs are logged. Single-node target; for >1 instance
// run the worker on one node (WORKER_ENABLED=true) and disable elsewhere.
const scheduled = [];
const scheduleTimers = [];
export function registerScheduled(name, intervalMs, fn) {
  scheduled.push({ name, intervalMs, fn });
}
export async function runScheduledNow(name) {
  const task = scheduled.find((s) => s.name === name);
  if (!task) throw new Error(`unknown_task:${name}`);
  return task.fn();
}

let timer = null;

export function startWorker() {
  if (timer || !config.worker.enabled) return;
  for (const task of scheduled) {
    const run = async () => {
      try {
        const result = await task.fn();
        logger.info("scheduled.ran", { task: task.name, result });
      } catch (err) {
        logger.error("scheduled.failed", { task: task.name, error: String(err) });
      }
    };
    const handle = setInterval(run, task.intervalMs);
    handle.unref?.();
    scheduleTimers.push(handle);
  }
  // Recover rows stuck in "processing" from a crashed previous run.
  OutboxMessage.update(
    { status: "pending" },
    { where: { status: "processing" } },
  ).catch(() => {});
  const tick = async () => {
    try {
      await processBatch();
    } catch (err) {
      logger.error("worker.tick_error", { error: String(err) });
    } finally {
      timer = setTimeout(tick, config.worker.intervalMs);
    }
  };
  timer = setTimeout(tick, config.worker.intervalMs);
  logger.info("worker.started", { intervalMs: config.worker.intervalMs });
}

export function stopWorker() {
  if (timer) clearTimeout(timer);
  timer = null;
  while (scheduleTimers.length) clearInterval(scheduleTimers.pop());
}

export default {
  enqueue,
  enqueueEmail,
  registerHandler,
  processBatch,
  registerScheduled,
  runScheduledNow,
  startWorker,
  stopWorker,
};
