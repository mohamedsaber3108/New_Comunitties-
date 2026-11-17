// -------------------------------------------------------------------------
// Fixed-window rate limiter with bounded memory.
//
// Single-node EC2 target: an in-process store is correct and fast. Every
// bucket carries its own reset time and a janitor sweeps expired buckets on
// an unref'd timer, so the map cannot grow without bound (the previous
// ad-hoc limiter never pruned login/signup buckets).
//
// Scaling note (documented in PRODUCTION_DEPLOYMENT_GUIDE.md): if the app is
// ever run on >1 instance, swap `store` for a Redis-backed implementation
// with the same get/incr interface; call sites do not change.
//
// RATE_LIMIT_DISABLED=true turns every limiter into a pass-through (used only
// by load tests); it is refused in production by assertProductionConfig.
// -------------------------------------------------------------------------
const store = new Map();

const sweep = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of store) if (bucket.reset <= now) store.delete(key);
}, 60_000);
sweep.unref?.();

export function createLimiter({
  name,
  windowMs,
  max,
  key = (req) => req.ip,
  error = "too_many_requests",
}) {
  return function limiter(req, res, next) {
    if (process.env.RATE_LIMIT_DISABLED === "true") return next();
    const now = Date.now();
    const id = `${name}:${key(req)}`;
    let bucket = store.get(id);
    if (!bucket || bucket.reset <= now) {
      bucket = { count: 0, reset: now + windowMs };
      store.set(id, bucket);
    }
    bucket.count += 1;
    const remaining = Math.max(0, max - bucket.count);
    res.set("RateLimit-Limit", String(max));
    res.set("RateLimit-Remaining", String(remaining));
    res.set("RateLimit-Reset", String(Math.ceil((bucket.reset - now) / 1000)));
    if (bucket.count > max) {
      res.set("Retry-After", String(Math.ceil((bucket.reset - now) / 1000)));
      return res.status(429).json({ error });
    }
    next();
  };
}

// Test helper: clear all counters.
export function resetLimiters() {
  store.clear();
}

// ---- Shared limiter instances -------------------------------------------
const MIN = 60_000;
const num = (v, d) => (v === undefined ? d : Number(v));

// Broad safety net for every API call, per client IP.
export const apiLimiter = createLimiter({
  name: "api",
  windowMs: MIN,
  max: num(process.env.RATE_LIMIT_API_PER_MIN, 600),
});

// Credential endpoints: login / signup / reset. Keyed by IP + target email so a
// single attacker cannot spray one address, and one IP cannot spray many.
export const authLimiter = createLimiter({
  name: "auth",
  windowMs: 15 * MIN,
  max: num(process.env.RATE_LIMIT_AUTH_PER_15MIN, 30),
  key: (req) => `${req.ip}:${String(req.body?.email || "").toLowerCase().slice(0, 254)}`,
});

// Emails sent on behalf of a user (verification, reset): cost + spam vector.
export const emailLimiter = createLimiter({
  name: "email",
  windowMs: 60 * MIN,
  max: num(process.env.RATE_LIMIT_EMAIL_PER_HOUR, 6),
  key: (req) => (req.user ? `u:${req.user.id}` : `ip:${req.ip}`),
});

// Password-reset emails: keyed by the TARGET address (not the caller) so an
// attacker cannot mail-bomb a victim from many IPs. Applies uniformly to
// existing and unknown addresses, so the 429 leaks nothing about accounts.
export const forgotLimiter = createLimiter({
  name: "forgot",
  windowMs: 60 * MIN,
  max: num(process.env.RATE_LIMIT_FORGOT_PER_HOUR, 3),
  key: (req) => String(req.body?.email || "").toLowerCase().slice(0, 254) || req.ip,
});

// State-changing calls from a signed-in member (posting, commenting, etc.).
export const writeLimiter = createLimiter({
  name: "write",
  windowMs: MIN,
  max: num(process.env.RATE_LIMIT_WRITE_PER_MIN, 120),
  key: (req) => (req.user ? `u:${req.user.id}` : `ip:${req.ip}`),
});

// Payment initialization: protects Paymob quota and prevents order spam.
export const paymentLimiter = createLimiter({
  name: "payment",
  windowMs: 10 * MIN,
  max: num(process.env.RATE_LIMIT_PAYMENT_PER_10MIN, 20),
  key: (req) => (req.user ? `u:${req.user.id}` : `ip:${req.ip}`),
});

export default { createLimiter, apiLimiter, authLimiter, emailLimiter, forgotLimiter, writeLimiter, paymentLimiter, resetLimiters };
