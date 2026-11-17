// -------------------------------------------------------------------------
// Realtime delivery over Server-Sent Events (SSE).
//
//   GET /api/v1/stream   (signed-in)  ->  text/event-stream
//
// Events pushed to a member's open tabs:
//   event: notification   data: { id, kind, text, href, createdAt }
//   event: message        data: { conversationId, messageId, senderId }
//   event: read           data: { conversationId }
//
// Why SSE and not WebSockets: delivery is server -> browser only (sends still
// go through the normal authenticated, rate-limited, CSRF-checked POST
// routes), it works through the existing Nginx proxy with no upgrade
// handling, the browser reconnects automatically, and it needs no new
// dependency. The payloads carry ids only; the client re-fetches through the
// regular authorized endpoints, so a stream can never leak data a member
// could not already read.
//
// Scope: in-process fan-out, correct for the single-node EC2 target (same as
// the rate limiter). Running more than one app instance needs a shared bus
// (e.g. PostgreSQL LISTEN/NOTIFY or Redis pub/sub) in publish().
// -------------------------------------------------------------------------
import { logger } from "./logger.js";

const clients = new Map(); // userId -> Set<res>
const MAX_STREAMS_PER_USER = 6;
const HEARTBEAT_MS = 25_000;

export function publish(userId, event, data) {
  const set = clients.get(userId);
  if (!set) return 0;
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of set) {
    try {
      res.write(frame);
    } catch (err) {
      logger.warn("realtime.write_failed", { error: String(err) });
    }
  }
  return set.size;
}

export const connectedCount = () =>
  [...clients.values()].reduce((n, s) => n + s.size, 0);

export function registerRealtimeRoutes(app, { auth }) {
  app.get("/api/v1/stream", auth, (req, res) => {
    const uid = req.user.id;
    let set = clients.get(uid);
    if (!set) clients.set(uid, (set = new Set()));
    // Bound per-member connections so one account cannot exhaust sockets.
    if (set.size >= MAX_STREAMS_PER_USER) {
      const oldest = set.values().next().value;
      set.delete(oldest);
      try {
        oldest.end();
      } catch {}
    }
    res.status(200).set({
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no", // tell Nginx not to buffer this response
    });
    res.flushHeaders?.();
    res.write(`retry: 5000\nevent: ready\ndata: {}\n\n`);
    set.add(res);
    const beat = setInterval(() => {
      try {
        res.write(`: ping\n\n`);
      } catch {}
    }, HEARTBEAT_MS);
    beat.unref?.();
    const close = () => {
      clearInterval(beat);
      set.delete(res);
      if (!set.size) clients.delete(uid);
    };
    req.on("close", close);
    res.on("error", close);
  });
}

// Close every open stream (graceful shutdown, so server.close() can finish).
export function closeAllStreams() {
  for (const set of clients.values())
    for (const res of set)
      try {
        res.end();
      } catch {}
  clients.clear();
}
