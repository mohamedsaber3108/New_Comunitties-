// -------------------------------------------------------------------------
// Minimal structured JSON logger (no external dependency).
// - Honors LOG_LEVEL (debug|info|warn|error).
// - Emits one JSON object per line in production (machine-parseable for
//   CloudWatch), and a compact human line in dev.
// - Never logs secrets: callers must pass already-safe fields.
// -------------------------------------------------------------------------
import { config } from "./config.js";

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = LEVELS[config.logLevel] ?? LEVELS.info;

function emit(level, message, meta) {
  if (LEVELS[level] < threshold) return;
  const record = {
    ts: new Date().toISOString(),
    level,
    msg: message,
    ...(meta && typeof meta === "object" ? meta : meta ? { meta } : {}),
  };
  const line = config.isProduction
    ? JSON.stringify(record)
    : `${record.ts} ${level.toUpperCase().padEnd(5)} ${message}${
        meta ? " " + safeInline(meta) : ""
      }`;
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

function safeInline(meta) {
  try {
    return typeof meta === "string" ? meta : JSON.stringify(meta);
  } catch {
    return "[unserializable]";
  }
}

export const logger = {
  debug: (m, meta) => emit("debug", m, meta),
  info: (m, meta) => emit("info", m, meta),
  warn: (m, meta) => emit("warn", m, meta),
  error: (m, meta) => emit("error", m, meta),
  child: (bindings) => ({
    debug: (m, meta) => emit("debug", m, { ...bindings, ...meta }),
    info: (m, meta) => emit("info", m, { ...bindings, ...meta }),
    warn: (m, meta) => emit("warn", m, { ...bindings, ...meta }),
    error: (m, meta) => emit("error", m, { ...bindings, ...meta }),
  }),
};

export default logger;
