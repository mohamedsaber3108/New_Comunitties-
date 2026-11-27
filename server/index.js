import express from "express";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Op } from "sequelize";
import {
  sequelize,
  initDb,
  User,
  Session,
  Community,
  Membership,
  Post,
  Comment,
  Reaction,
  Bookmark,
  Event,
  Registration,
  Offer,
  Claim,
  Organization,
  Mentor,
  MentorRequest,
  Conversation,
  Message,
  Block,
  Follow,
  Challenge,
  Submission,
  Notification,
  Report,
  AuditLog,
  ContactRequest,
  Plan,
  Subscription,
  PaymentAttempt,
  Group,
  GroupMembership,
  Room,
  RoomApplication,
  SavedSearch,
  NotificationPreference,
  Partnership,
  OrganizationMember,
  FeatureFlag,
  CmsEntry,
  Perk,
  PerkApplication,
  VerificationToken,
  OutboxMessage,
  WebhookEvent,
  MediaAsset,
  Coupon,
  CouponRedemption,
  ApprovalRequest,
  publicUser,
  seedReferenceData,
  isPostgres,
} from "./db.js";
import { config, assertProductionConfig } from "./config.js";
import { logger } from "./logger.js";
import {
  SESSION_COOKIE,
  sha256 as hashToken,
  cookieOptions,
  validatePassword,
  hashPassword,
  issueSession,
  issueVerificationToken,
  VERIFY_TTL_MS,
} from "./security.js";
import { enqueueEmail, startWorker, stopWorker, registerScheduled } from "./jobs.js";
import {
  apiLimiter,
  authLimiter,
  emailLimiter,
  writeLimiter,
  paymentLimiter,
} from "./ratelimit.js";
import { registerIdentityRoutes } from "./identity.js";
import { registerMfaRoutes, checkSecondFactor } from "./mfa.js";
import { registerRealtimeRoutes, publish, closeAllStreams } from "./realtime.js";
import { registerGoogleRoutes } from "./google.js";
import { registerCouponRoutes, quoteCoupon, reserveCoupon } from "./coupons.js";
import { registerAnalyticsRoutes } from "./analytics.js";
import { registerPaymentRoutes, runPaymentMaintenance } from "./payments.js";
import { registerApprovalRoutes } from "./approvals.js";
import { runNotificationDigests } from "./notifications.js";
import { runHousekeeping } from "./housekeeping.js";
import paymob from "./paymob.js";
import { registerMediaRoutes, destroyAssets } from "./media.js";
import { registerAccountRoutes } from "./account.js";
import { migrateUp } from "./migrate.js";

// The signed-in user's own view: public profile + private security flags.
const selfUser = (u) =>
  u && {
    ...publicUser(u),
    mfaEnabled: !!u.mfaEnabledAt,
    authProvider: u.authProvider,
    googleLinked: !!u.googleId,
    // Google-created accounts have no usable password until they set one.
    hasPassword: !String(u.passwordHash || "").startsWith("!"),
  };

const couponModels = { Coupon, CouponRedemption, PaymentAttempt, Op };

const app = express();
app.disable("x-powered-by");
// ---- Request id + structured access log -----------------------------------
// Every request gets an id (honoring a sane inbound X-Request-Id from Nginx),
// echoed back in the response so a user-reported failure can be traced to one
// log line. One JSON line per API request: method, path, status, ms, user.
// Query strings are NEVER logged (they can hold tokens), nor are bodies.
app.use((req, res, next) => {
  const inbound = String(req.headers["x-request-id"] || "");
  req.id = /^[A-Za-z0-9._-]{8,64}$/.test(inbound) ? inbound : crypto.randomUUID();
  res.set("X-Request-Id", req.id);
  const started = process.hrtime.bigint();
  res.on("finish", () => {
    if (!req.path.startsWith("/api/") || (config.isTest && !process.env.LOG_ACCESS)) return;
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
    logger[level]("http", {
      requestId: req.id,
      method: req.method,
      path: req.path,
      status: res.statusCode,
      ms: Math.round(ms),
      userId: req.user?.id,
      ip: req.ip,
    });
  });
  next();
});
// The deployment runbook terminates TLS in a loopback Nginx proxy.
// Trust only that local proxy so per-IP abuse limits see the originating client.
app.set("trust proxy", "loopback");
// Body parsing: a tight 80kb limit everywhere, and a larger limit ONLY for the
// avatar upload path (a base64 image is ~1.37x its raw size). Express parsers
// run in registration order, so the size policy must be chosen here, up front:
// a bigger parser registered later on a route would never run, because an
// earlier, smaller one would already have rejected the request (this was a
// real bug, guarded by media.test.js).
const smallJson = express.json({ limit: "80kb" });
const uploadJson = express.json({
  limit: `${Math.ceil((config.storage.maxUploadBytes * 1.4) / 1024) + 64}kb`,
});
const UPLOAD_PATHS = new Set(["/api/v1/users/me/avatar", "/api/v1/media/images"]);
app.use((req, res, next) =>
  UPLOAD_PATHS.has(req.path) ? uploadJson(req, res, next) : smallJson(req, res, next),
);
app.use(cookieParser());
// Every primary key is a UUID. PostgreSQL THROWS ("invalid input syntax for
// type uuid") when a non-UUID reaches a UUID column, which surfaced as a 500
// on dozens of routes in production while SQLite quietly returned 404. Validate
// all id-style path params once, here, so no handler ever sees a malformed id.
// (Found by robustness.test.js running against a real Postgres.)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
for (const name of ["id", "attemptId", "memberId", "commentId"]) {
  app.param(name, (req, res, next, value) =>
    UUID_RE.test(String(value))
      ? next()
      : res.status(404).json({ error: "not_found" }),
  );
}
// Express 5 leaves req.body UNDEFINED when no body parser matched (missing or
// non-JSON Content-Type). Every handler reads req.body.*, so that used to
// surface as a 500 TypeError. Normalise to {} so bad requests fail validation
// with a clean 4xx instead.
app.use((req, res, next) => {
  if (req.body === undefined) req.body = {};
  next();
});
// Local-driver media (dev / single-node). In S3 mode files are served from the
// bucket/CDN and this mount is simply never hit. Served with nosniff and a
// restrictive CSP so an uploaded file can never execute as a page.
if (config.storage.driver === "local") {
  app.use(
    config.storage.localPublicPath,
    (req, res, next) => {
      res.set("X-Content-Type-Options", "nosniff");
      res.set("Content-Security-Policy", "default-src 'none'; img-src 'self'; sandbox");
      res.set("Cross-Origin-Resource-Policy", "same-site");
      next();
    },
    express.static(path.resolve(config.storage.localDir), {
      maxAge: "7d",
      immutable: true,
      index: false,
      dotfiles: "deny",
      fallthrough: false, // missing file => 404, NOT the SPA index.html
    }),
  );
}
// ---- Security headers -----------------------------------------------------
// CSP is tuned to what the app actually loads: its own bundle, Google Fonts
// (index.html), data:/https: images (avatars may live on S3/CDN), and the
// Paymob hosted-checkout iframe. No inline scripts are allowed. Inline styles
// are required by React `style=` attributes.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: https:",
  "connect-src 'self'",
  "frame-src https://accept.paymob.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.set("X-Frame-Options", "DENY");
  res.set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.set("Cross-Origin-Opener-Policy", "same-origin");
  res.set("Content-Security-Policy", CSP);
  if (config.isProduction)
    res.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  // API responses are per-user; never let a shared cache store them.
  if (req.path.startsWith("/api/")) res.set("Cache-Control", "no-store");
  next();
});
app.use("/api", apiLimiter);
const originAllowed = (req) => {
  if (!req.headers.origin) return true;
  try {
    return (
      new URL(req.headers.origin).host === req.headers.host ||
      (process.env.APP_ORIGIN && req.headers.origin === process.env.APP_ORIGIN)
    );
  } catch {
    return false;
  }
};
app.use("/api", (req, res, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method) && !originAllowed(req))
    return res.status(403).json({ error: "origin_rejected" });
  next();
});
const fail = (res, code, error) => res.status(code).json({ error });
// Op.like is case-INSENSITIVE on SQLite/MySQL but case-SENSITIVE on
// PostgreSQL. Using it directly made search/user-lookup silently behave
// differently in production (Postgres) vs. dev/test (SQLite) — caught by
// running the suite against a real Postgres container. Op.iLike is
// Postgres-only, so pick per dialect.
const likeOp = isPostgres ? Op.iLike : Op.like;
const contains = (value) => ({ [likeOp]: `%${String(value).replace(/[%_]/g, "")}%` });
const tokenHash = (token) =>
  crypto.createHash("sha256").update(token).digest("hex");
// Strips C0/C1 control characters (e.g. a stray NUL byte in a query string),
// which SQLite's driver rejects mid-query and Express 5 does NOT decode-reject
// on its own - left in, a single "%00" crashed /search and /admin/users with
// a raw 500 (found by the robustness sweep).
const clean = (v, max = 1000) =>
  typeof v === "string"
    ? // Keep \t (09), \n (0A) and \r (0D) - posts/messages/bios are multi-line.
      v.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "").trim().slice(0, max)
    : "";
const publicPlan = (p) => ({
  id: p.id,
  code: p.code,
  nameAr: p.nameAr,
  nameEn: p.nameEn,
  audience: p.audience,
  monthlyEgp: p.monthlyEgp,
  yearlyEgp: p.yearlyEgp,
  descriptionAr: p.descriptionAr,
  descriptionEn: p.descriptionEn,
  featuresAr: JSON.parse(p.featuresAr || "[]"),
  featuresEn: JSON.parse(p.featuresEn || "[]"),
  featured: p.featured,
});
// ROLE_RANK is declared further down; it is only read at request time.
function staffSessionExpired(session) {
  const now = Date.now();
  const created = session.createdAt ? session.createdAt.getTime() : now;
  const seen = session.lastSeenAt ? session.lastSeenAt.getTime() : created;
  return (
    now - created > config.staffSession.maxHours * 3600_000 ||
    now - seen > config.staffSession.idleMin * 60_000
  );
}
const withUser = async (req, res, next) => {
  try {
    const token = req.cookies.usam_session;
    if (token) {
      const session = await Session.findOne({
        where: {
          tokenHash: tokenHash(token),
          expiresAt: { [Op.gt]: new Date() },
          revokedAt: null,
        },
        include: User,
      });
      // Staff sessions (moderator+) have an idle and an absolute limit that
      // are shorter than the member session. Expired ones are deleted.
      if (
        session?.User &&
        ROLE_RANK[session.User.role] > 0 &&
        staffSessionExpired(session)
      ) {
        await session.destroy();
        req.session = null;
        req.sessionEnded = true;
        return next();
      }
      // Reject sessions whose owner was deleted or suspended mid-session.
      if (
        session?.User &&
        !session.User.isDeleted &&
        session.User.status !== "deleted" &&
        session.User.status !== "suspended"
      ) {
        req.user = session.User;
        req.session = session;
        // Refresh last-seen at most once a minute to avoid write amplification.
        const last = session.lastSeenAt ? session.lastSeenAt.getTime() : 0;
        if (Date.now() - last > 60_000) {
          session.update({ lastSeenAt: new Date() }).catch(() => {});
        }
      } else {
        req.session = null;
      }
      // A cookie was sent but no live session matches it: the session ended
      // (expired, revoked on role change or suspension, staff limit).
      if (!req.user) req.sessionEnded = true;
    }
    next();
  } catch (e) {
    next(e);
  }
};
app.use("/api", withUser);
// Keyset paging for long admin queues (T-21), newest first and stable when
// rows share a timestamp: the cursor is "<createdAt ISO>|<id>" of the last row
// shown. ?limit=1..100 (default 50). Returns { items, hasMore, nextCursor },
// or null for a malformed cursor. opts.oldestFirst pages a first-come queue
// (pending payments, perk applications) oldest first; opts.include is passed
// to findAll.
async function keysetPage(Model, where, req, opts = {}) {
  const PAGE = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
  const dir = opts.oldestFirst ? "ASC" : "DESC";
  const past = opts.oldestFirst ? Op.gt : Op.lt;
  const w = { ...where };
  if (req.query.cursor) {
    const [iso, id] = String(req.query.cursor).split("|");
    const at = new Date(iso);
    if (Number.isNaN(at.getTime()) || !id || !UUID_RE.test(id)) return null;
    w[Op.or] = [{ createdAt: { [past]: at } }, { createdAt: at, id: { [past]: id } }];
  }
  const rows = await Model.findAll({
    where: w,
    include: opts.include,
    order: [["createdAt", dir], ["id", dir]],
    limit: PAGE + 1,
  });
  const hasMore = rows.length > PAGE;
  const items = rows.slice(0, PAGE);
  const last = items.at(-1);
  return { items, hasMore, nextCursor: hasMore ? `${last.createdAt.toISOString()}|${last.id}` : null };
}
// 401 for a missing session. "session_ended" when the caller still sent a
// session cookie, so the UI can say "your session ended, sign in again".
// The dead cookie is cleared so the notice shows once.
const signInRequired = (req, res) => {
  if (!req.sessionEnded) return fail(res, 401, "sign_in_required");
  res.clearCookie(SESSION_COOKIE, cookieOptions({ maxAge: 0 }));
  return fail(res, 401, "session_ended");
};
// Per-member write throttle (runs after withUser so it can key on the user).
app.use("/api", (req, res, next) =>
  ["GET", "HEAD", "OPTIONS"].includes(req.method)
    ? next()
    : writeLimiter(req, res, next),
);
// ---- Role-based access control -----------------------------------------
// Role hierarchy: member < moderator < admin < super_admin.
const ROLE_RANK = { member: 0, moderator: 1, admin: 2, super_admin: 3 };
const atLeast = (role) => (req, res, next) => {
  if (!req.user) return signInRequired(req, res);
  if (ROLE_RANK[req.user.role] < ROLE_RANK[role]) return fail(res, 403, "forbidden");
  // Privileged staff must have enrolled in two-factor auth when the
  // deployment requires it (REQUIRE_ADMIN_MFA=true).
  if (config.mfa.requireForAdmins && !req.user.mfaEnabledAt)
    return fail(res, 403, "mfa_setup_required");
  next();
};
const auth = (req, res, next) =>
  req.user ? next() : signInRequired(req, res);
// `admin` now admits super_admin as well (strictly higher privilege).
const admin = atLeast("admin");
const moderator = atLeast("moderator");
// Inline (non-middleware) rank check for resource-level rules such as
// "owner OR moderator+". Use this instead of comparing role strings so new
// roles (super_admin) are never accidentally excluded.
const hasRole = (user, role) =>
  !!user && ROLE_RANK[user.role] >= ROLE_RANK[role];
const superAdmin = atLeast("super_admin");
// Server-side feature-flag gate. A flag that exists and is switched OFF blocks
// the action for everyone (the UI also hides it, but hiding is only cosmetic).
// A flag that doesn't exist yet defaults to ON so new deployments aren't
// accidentally locked out of features before an admin has created the flag.
const requireFlag = (key) => async (req, res, next) => {
  try {
    const flag = await FeatureFlag.findOne({ where: { key }, attributes: ["enabled"] });
    if (flag && !flag.enabled) return fail(res, 403, "feature_disabled");
    next();
  } catch (e) {
    next(e);
  }
};
// Gate that requires a verified email for sensitive member actions. When
// REQUIRE_EMAIL_VERIFICATION is off (dev), it is a pass-through.
const requireVerified = (req, res, next) => {
  if (!req.user) return signInRequired(req, res);
  if (!config.requireEmailVerification) return next();
  if (req.user.emailVerified) return next();
  return fail(res, 403, "email_verification_required");
};
async function paidAccess(UserId) {
  const subscription = await Subscription.findOne({
    where: {
      UserId,
      // "active" is only ever used for paid plans (free plans are "free").
      // It is NOT keyed on the amount charged: a 100%-off coupon makes that 0
      // while the member is still entitled to the paid plan.
      status: "active",
      // Entitlement ends with the paid term even if the expiry job hasn't
      // flipped the status yet.
      [Op.or]: [{ endsAt: null }, { endsAt: { [Op.gt]: new Date() } }],
    },
    include: [Plan],
    order: [["createdAt", "DESC"]],
  });
  return {
    eligible: !!subscription,
    plan: subscription?.Plan
      ? { code: subscription.Plan.code, nameAr: subscription.Plan.nameAr, nameEn: subscription.Plan.nameEn }
      : null,
    reason: subscription ? null : "paid_membership_required",
  };
}
// Creates the in-app notification and honors the member's preferences:
//   inApp=false  -> no in-app row
//   kinds=[...]  -> optional allow-list (empty list = everything)
//   email=true & digest=off -> immediate email through the durable outbox
//   email=true & digest!=off -> batched into the periodic digest instead
// Notification delivery must never break the business action that triggered
// it, so failures are logged and swallowed.
async function notify(UserId, kind, text, href) {
  try {
    const prefs = await NotificationPreference.findOne({ where: { UserId } });
    const allow = prefs ? JSON.parse(prefs.kinds || "[]") : [];
    if (allow.length && !allow.includes(kind)) return;
    if (!prefs || prefs.inApp !== false) {
      const n = await Notification.create({ UserId, kind, text, href });
      publish(UserId, "notification", {
        id: n.id,
        kind,
        text,
        href,
        createdAt: n.createdAt,
      });
    }
    if (prefs?.email && prefs.digest === "off") {
      const member = await User.findByPk(UserId, {
        attributes: ["email", "name", "isDeleted", "status"],
      });
      if (member && !member.isDeleted && member.status === "active")
        await enqueueEmail(member.email, "notification", {
          name: member.name,
          text,
          href: typeof href === "string" && href.startsWith("/") ? href : "/notifications",
        });
    }
  } catch (err) {
    logger.warn("notify.failed", { UserId, kind, error: String(err) });
  }
}
async function audit(req, action, subjectType, subjectId, details = "", transaction) {
  await AuditLog.create(
    {
      UserId: req.user.id,
      action,
      subjectType,
      subjectId,
      details,
    },
    transaction ? { transaction } : undefined,
  );
}
// authLimit: shared alias kept for identity.js's existing call sites
// (forgot/reset password). Backed by server/ratelimit.js's bounded-memory
// limiter (the previous inline Map here never pruned expired entries).
const authLimit = authLimiter;
app.use("/api/v1/auth/login", authLimiter);
app.use("/api/v1/auth/signup", authLimiter);
app.use("/api/v1/auth/resend-verification", emailLimiter);
app.use("/api/v1/payments/checkout", paymentLimiter);
const contactAttempts = new Map();
app.post("/api/v1/contact", (req, res, next) => {
  const now = Date.now(),
    key = req.ip,
    prior = contactAttempts.get(key);
  const state =
    prior && prior.reset > now ? prior : { count: 0, reset: now + 3600000 };
  state.count++;
  contactAttempts.set(key, state);
  if (state.count > 8) return fail(res, 429, "too_many_requests");
  if (contactAttempts.size > 10000)
    for (const [ip, value] of contactAttempts)
      if (value.reset < now) contactAttempts.delete(ip);
  next();
});
const postInclude = [
  { model: User, attributes: ["id", "name", "username", "persona"] },
  {
    model: Community,
    attributes: ["id", "slug", "nameAr", "nameEn", "accent"],
  },
  // One-to-few (max 4 per post), so joining does not multiply rows badly.
  {
    model: MediaAsset,
    as: "images",
    attributes: ["id", "url", "width", "height", "alt", "position"],
    separate: true,
    order: [["position", "ASC"]],
  },
];
// Counts + the viewer's own liked/saved flags for a PAGE of posts, via small
// grouped queries. This replaced eager-loading every Comment/Reaction/Bookmark
// row just to count them: Sequelize joined all three one-to-many tables, so
// each post produced comments x reactions x bookmarks rows (a cartesian
// product that grew quadratically with engagement). Cost is now bounded by the
// page size, not by how popular the posts are.
async function postStats(ids, viewer) {
  const empty = new Map(ids.map((id) => [id, { comments: 0, reactions: 0, liked: false, saved: false }]));
  if (!ids.length) return empty;
  const grouped = (Model) =>
    Model.findAll({
      attributes: ["PostId", [sequelize.fn("COUNT", sequelize.col("id")), "n"]],
      where: { PostId: { [Op.in]: ids } },
      group: ["PostId"],
      raw: true,
    });
  const mine = (Model) =>
    viewer
      ? Model.findAll({ attributes: ["PostId"], where: { UserId: viewer.id, PostId: { [Op.in]: ids } }, raw: true })
      : Promise.resolve([]);
  const [comments, reactions, liked, saved] = await Promise.all([
    grouped(Comment),
    grouped(Reaction),
    mine(Reaction),
    mine(Bookmark),
  ]);
  for (const r of comments) empty.get(r.PostId).comments = Number(r.n);
  for (const r of reactions) empty.get(r.PostId).reactions = Number(r.n);
  for (const r of liked) empty.get(r.PostId).liked = true;
  for (const r of saved) empty.get(r.PostId).saved = true;
  return empty;
}
const safePost = (p, viewer, stats) => ({
  id: p.id,
  body: p.body,
  createdAt: p.createdAt,
  updatedAt: p.updatedAt,
  author: p.User && {
    id: p.User.id,
    name: p.User.name,
    username: p.User.username,
    persona: p.User.persona,
  },
  community: p.Community,
  images: (p.images || []).map((i) => ({ id: i.id, url: i.url, width: i.width, height: i.height, alt: i.alt })),
  commentsCount: stats?.comments ?? 0,
  reactionsCount: stats?.reactions ?? 0,
  liked: !!stats?.liked,
  saved: !!stats?.saved,
  own: p.UserId === viewer?.id,
});
// Public event representation: aggregate seat counts plus ONLY the viewer's
// own registration status (no other attendees, no ticket codes).
async function eventViews(events, viewer) {
  if (!events.length) return [];
  const ids = events.map((e) => e.id);
  const now = new Date();
  const [counts, mine] = await Promise.all([
    Registration.findAll({
      where: {
        EventId: { [Op.in]: ids },
        [Op.or]: [
          { status: { [Op.in]: ["registered", "waitlisted"] } },
          { status: "pending_payment", paymentExpiresAt: { [Op.gt]: now } },
        ],
      },
      attributes: ["EventId", "status", [sequelize.fn("COUNT", sequelize.col("id")), "n"]],
      group: ["EventId", "status"],
      raw: true,
    }),
    viewer
      ? Registration.findAll({
          where: { EventId: { [Op.in]: ids }, UserId: viewer.id },
          attributes: ["EventId", "status", "paymentExpiresAt", "checkedInAt"],
        })
      : [],
  ]);
  const c = new Map();
  for (const r of counts) {
    const m = c.get(r.EventId) || {};
    m[r.status] = Number(r.n);
    c.set(r.EventId, m);
  }
  return events.map((e) => {
    const m = c.get(e.id) || {};
    const own = mine.find((r) => r.EventId === e.id && r.status !== "cancelled");
    const registered = m.registered || 0;
    const held = m.pending_payment || 0;
    const json = e.toJSON();
    delete json.Registrations;
    return {
      ...json,
      registeredCount: registered,
      waitlistCount: m.waitlisted || 0,
      seatsLeft: Math.max(0, e.capacity - registered - held),
      myRegistration: own
        ? {
            status:
              own.status === "pending_payment" && own.paymentExpiresAt <= now
                ? "expired"
                : own.status,
            checkedIn: !!own.checkedInAt,
          }
        : null,
    };
  });
}
async function getPosts(where, user, limit = 30) {
  const denied = user
    ? await Block.findAll({
        where: { [Op.or]: [{ UserId: user.id }, { BlockedUserId: user.id }] },
      })
    : [];
  const blockedIds = denied
    .flatMap((b) => [b.UserId, b.BlockedUserId])
    .filter((id) => id !== user?.id);
  const authorFilter = blockedIds.length
    ? { [Op.notIn]: blockedIds }
    : undefined;
  const posts = await Post.findAll({
    where: {
      status: "published",
      ...where,
      ...(authorFilter
        ? {
            UserId: where.UserId
              ? { [Op.and]: [where.UserId, authorFilter] }
              : authorFilter,
          }
        : {}),
    },
    include: postInclude,
    order: [["createdAt", "DESC"]],
    limit,
  });
  const stats = await postStats(posts.map((p) => p.id), user);
  return posts.map((p) => safePost(p, user, stats.get(p.id)));
}
app.get("/api/v1/health", async (req, res) => {
  try {
    await sequelize.authenticate();
    res.json({ status: "ok", db: "connected" });
  } catch {
    fail(res, 503, "database_unavailable");
  }
});
app.post("/api/v1/contact", async (req, res, next) => {
  try {
    if (req.body.website)
      return res.status(201).json({ reference: "received" });
    const name = clean(req.body.name, 100),
      email = clean(req.body.email, 254).toLowerCase(),
      message = clean(req.body.message, 3000),
      topic = clean(req.body.topic, 30);
    if (
      name.length < 2 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
      message.length < 20 ||
      !["general", "partnership", "support", "privacy"].includes(topic)
    )
      return fail(res, 400, "invalid_contact");
    const item = await ContactRequest.create({ name, email, message, topic });
    res.status(201).json({ reference: item.id.slice(0, 8).toUpperCase() });
  } catch (e) {
    next(e);
  }
});
app.post("/api/v1/auth/signup", async (req, res, next) => {
  try {
    if (process.env.REGISTRATION_ENABLED === "false")
      return fail(res, 503, "registration_unavailable");
    const name = clean(req.body.name, 100),
      email = clean(req.body.email, 254).toLowerCase(),
      password = req.body.password,
      persona = clean(req.body.persona, 30);
    if (
      name.length < 2 ||
      !/^\S+@\S+\.\S+$/.test(email) ||
      typeof password !== "string" ||
      password.length < 10 ||
      !["launchpad", "freelancespace", "hrconnect", "studentzone"].includes(
        persona,
      )
    )
      return fail(res, 400, "invalid_signup");
    // Enforce the shared password policy (letters + digits, length).
    const policy = validatePassword(password);
    if (!policy.ok) return fail(res, 400, "invalid_signup");
    // Neutral reply (no email enumeration): a new and an existing address get
    // the same 202 and no session. The member signs in after reading the mail.
    // emailVerification is the same for every caller (a deployment setting),
    // so the UI can say "sign in now" when no verification mail is sent.
    const neutral = () =>
      res.status(202).json({ ok: true, next: "check_email", emailVerification: config.requireEmailVerification });
    const existing = await User.findOne({ where: { email } });
    if (existing) {
      await hashPassword(password); // similar timing to a real sign-up
      try {
        await enqueueEmail(existing.email, "signupAttemptExisting", {
          name: existing.name,
          loginLink: `${config.frontendUrl}/login`,
          resetLink: `${config.frontendUrl}/forgot-password`,
        });
      } catch (mailErr) {
        logger.warn("signup.existing_notice_enqueue_failed", {
          userId: existing.id,
          error: String(mailErr),
        });
      }
      return neutral();
    }
    const username = "u" + crypto.randomBytes(6).toString("hex");
    let user;
    try {
      user = await User.create({
        name,
        email,
        username,
        passwordHash: await hashPassword(password),
        persona,
        authProvider: "password",
        passwordChangedAt: new Date(),
      });
    } catch (createErr) {
      // Two sign-ups for one address at the same moment: same neutral reply.
      if (createErr?.name === "SequelizeUniqueConstraintError") return neutral();
      throw createErr;
    }
    // Issue and email a verification link via the durable outbox.
    try {
      const raw = await issueVerificationToken(
        VerificationToken,
        user.id,
        "email_verify",
        VERIFY_TTL_MS,
      );
      await enqueueEmail(user.email, "verifyEmail", {
        name: user.name,
        link: `${config.frontendUrl}/verify-email?token=${raw}`,
      });
    } catch (mailErr) {
      logger.warn("signup.verify_email_enqueue_failed", {
        userId: user.id,
        error: String(mailErr),
      });
    }
    neutral();
  } catch (e) {
    next(e);
  }
});
app.post("/api/v1/auth/login", async (req, res, next) => {
  try {
    const email = clean(req.body.email, 254).toLowerCase(),
      password = req.body.password || "";
    const user = await User.findOne({ where: { email } });
    // Uniform failure for unknown user OR bad password (no enumeration).
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      if (user) {
        // Track failed attempts; lock the account after a threshold.
        const failed = (user.failedLoginCount || 0) + 1;
        const updates = { failedLoginCount: failed };
        if (failed >= 10)
          updates.lockedUntil = new Date(Date.now() + 15 * 60_000);
        await user.update(updates);
      }
      return fail(res, 401, "invalid_credentials");
    }
    if (user.isDeleted || user.status === "deleted")
      return fail(res, 403, "account_deleted");
    if (user.status === "suspended")
      return fail(res, 403, "account_suspended");
    if (user.lockedUntil && user.lockedUntil > new Date())
      return fail(res, 429, "account_locked");
    // Second factor (only for accounts that enrolled). The client resubmits
    // email + password + mfaCode; no half-authenticated state is stored.
    if (user.mfaEnabledAt) {
      const code = req.body.mfaCode;
      if (code === undefined || code === null || code === "")
        return res.status(401).json({ error: "mfa_required", mfaRequired: true });
      const r = await checkSecondFactor(user, String(code).slice(0, 32));
      if (!r.ok) {
        const failed = (user.failedLoginCount || 0) + 1;
        const updates = { failedLoginCount: failed };
        if (failed >= 10)
          updates.lockedUntil = new Date(Date.now() + 15 * 60_000);
        await user.update(updates);
        return fail(res, 401, "invalid_mfa_code");
      }
    }
    await user.update({
      failedLoginCount: 0,
      lockedUntil: null,
      lastLoginAt: new Date(),
    });
    const token = await issueSession(Session, user.id, req);
    res.cookie(SESSION_COOKIE, token, cookieOptions()).json({
      user: selfUser(user),
    });
  } catch (e) {
    next(e);
  }
});
app.post("/api/v1/auth/logout", auth, async (req, res, next) => {
  try {
    if (req.session) await req.session.destroy();
    res
      .clearCookie(SESSION_COOKIE, cookieOptions({ maxAge: 0 }))
      .json({ ok: true });
  } catch (e) {
    next(e);
  }
});
app.post("/api/v1/auth/logout-all", auth, async (req, res, next) => {
  try {
    await Session.destroy({ where: { UserId: req.user.id } });
    res
      .clearCookie(SESSION_COOKIE, cookieOptions({ maxAge: 0 }))
      .json({ ok: true });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/me", (req, res) =>
  res.json({ user: selfUser(req.user) || null }),
);
app.get("/api/v1/plans", async (req, res, next) => {
  try {
    res.json({
      currency: "EGP",
      annualDiscountMonths: 2,
      items: (
        await Plan.findAll({
          where: { active: true },
          order: [["monthlyEgp", "ASC"]],
        })
      ).map(publicPlan),
    });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/billing", auth, async (req, res, next) => {
  try {
    const subscription = await Subscription.findOne({
      where: { UserId: req.user.id },
      include: [Plan],
      order: [["createdAt", "DESC"]],
    });
    res.json({
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            billingCycle: subscription.billingCycle,
            amountEgp: subscription.amountEgp,
            startsAt: subscription.startsAt,
            endsAt: subscription.endsAt,
            // Set when the member cancelled but the paid term is still running.
            cancelsAt:
              subscription.status === "active" && subscription.canceledAt
                ? subscription.endsAt
                : null,
            plan: publicPlan(subscription.Plan),
          }
        : null,
      paymentProvider: "paymob",
      paymentsConfigured: paymob.isConfigured(),
    });
  } catch (e) {
    next(e);
  }
});
app.post("/api/v1/subscriptions", auth, requireVerified, async (req, res, next) => {
  try {
    const plan = await Plan.findOne({
        where: { code: clean(req.body.planCode, 32), active: true },
      }),
      cycle = clean(req.body.billingCycle, 12);
    if (!plan || !["monthly", "yearly"].includes(cycle))
      return fail(res, 400, "invalid_plan");
    const listAmount = cycle === "yearly" ? plan.yearlyEgp : plan.monthlyEgp;
    let amount = listAmount;
    const couponCode = clean(req.body.couponCode, 40);
    const couponTarget = { kind: "subscription", planCode: plan.code, cycle };
    // Preview the coupon outside the transaction for a fast, clear error; it
    // is re-checked with the coupon row locked when the use is recorded.
    if (couponCode && listAmount > 0) {
      const q = await quoteCoupon(couponModels, { code: couponCode, user: req.user, target: couponTarget, baseAmount: listAmount });
      if (!q.ok) return fail(res, 400, q.error);
      amount = q.finalEgp;
    }
    if (couponCode && listAmount > 0 && amount === 0) {
      // 100% discount: nothing to charge, so no payment provider is involved.
      // The membership activates now and the code counts as redeemed.
      const out = await sequelize.transaction(async (t) => {
        const q = await quoteCoupon(couponModels, { code: couponCode, user: req.user, target: couponTarget, baseAmount: listAmount }, t);
        if (!q.ok || q.finalEgp !== 0) throw Object.assign(new Error(q.error || "coupon_changed"), { status: 409 });
        await Subscription.update(
          { status: "canceled", canceledAt: new Date() },
          { where: { UserId: req.user.id, status: { [Op.in]: ["free", "active", "pending_payment"] } }, transaction: t },
        );
        const endsAt = new Date();
        endsAt.setMonth(endsAt.getMonth() + (cycle === "yearly" ? 12 : 1));
        const subscription = await Subscription.create(
          { UserId: req.user.id, PlanId: plan.id, billingCycle: cycle, status: "active", amountEgp: 0, provider: "coupon", startsAt: new Date(), endsAt },
          { transaction: t },
        );
        await reserveCoupon(couponModels, q, { user: req.user, target: couponTarget, subscriptionId: subscription.id, redeemed: true }, t);
        return { subscription, code: q.coupon.code };
      });
      await audit(req, "activate_subscription_with_coupon", "subscription", out.subscription.id, `${plan.code}:${cycle}:${out.code}`);
      await notify(req.user.id, "subscription_active", "Your USAM membership is active", "/billing");
      return res.status(201).json({
        subscriptionId: out.subscription.id,
        status: "active",
        amountEgp: 0,
        originalEgp: listAmount,
        plan: publicPlan(plan),
      });
    }
    if (listAmount === 0) {
      await Subscription.update(
        { status: "canceled", canceledAt: new Date() },
        {
          where: {
            UserId: req.user.id,
            status: { [Op.in]: ["free", "active", "pending_payment"] },
          },
        },
      );
      const subscription = await Subscription.create({
        UserId: req.user.id,
        PlanId: plan.id,
        billingCycle: cycle,
        status: "free",
        amountEgp: 0,
        provider: "none",
        startsAt: new Date(),
      });
      await audit(
        req,
        "activate_free_subscription",
        "subscription",
        subscription.id,
        plan.code,
      );
      return res
        .status(201)
        .json({
          subscriptionId: subscription.id,
          status: subscription.status,
          plan: publicPlan(plan),
        });
    }
    const idempotencyKey = clean(req.headers["idempotency-key"], 100);
    if (idempotencyKey.length < 12)
      return fail(res, 400, "idempotency_key_required");
    const existing = await PaymentAttempt.findOne({
      where: { idempotencyKey },
      include: [Subscription],
    });
    if (existing) {
      if (existing.UserId !== req.user.id)
        return fail(res, 409, "idempotency_conflict");
      // Replay of the same request: return the same outcome. If the payment
      // is still open and Paymob is live, hand back a (re)usable checkout URL
      // so a refresh/double-click lands the member in the same payment.
      let checkout = { provider: existing.provider, configured: paymob.isConfigured() };
      if (
        paymob.isConfigured() &&
        ["created", "pending"].includes(existing.status)
      ) {
        try {
          const c = await routeDeps.initCheckoutForAttempt(existing, req.user);
          checkout = { ...checkout, checkoutUrl: c.checkoutUrl };
        } catch (err) {
          logger.error("subscriptions.checkout_init_failed", { error: String(err) });
          checkout = { ...checkout, error: "checkout_init_failed" };
        }
      } else if (!paymob.isConfigured()) {
        checkout.message = "payment_provider_activation_required";
      }
      return res.status(202).json({
        subscriptionId: existing.SubscriptionId,
        paymentAttemptId: existing.id,
        status: existing.Subscription?.status,
        paymentStatus: existing.status,
        checkout,
      });
    }
    const result = await sequelize.transaction(async (t) => {
      const subscription = await Subscription.create(
        {
          UserId: req.user.id,
          PlanId: plan.id,
          billingCycle: cycle,
          status: "pending_payment",
          amountEgp: amount,
          provider: "paymob",
        },
        { transaction: t },
      );
      // Re-check the coupon with its row locked and record the use in the
      // same transaction as the payment attempt (no over-redemption race).
      let q = null;
      if (couponCode) {
        q = await quoteCoupon(couponModels, { code: couponCode, user: req.user, target: couponTarget, baseAmount: listAmount }, t);
        if (!q.ok) throw Object.assign(new Error(q.error), { status: 400 });
        if (q.finalEgp !== amount) throw Object.assign(new Error("coupon_changed"), { status: 409 });
      }
      const payment = await PaymentAttempt.create(
        {
          UserId: req.user.id,
          SubscriptionId: subscription.id,
          idempotencyKey,
          amountEgp: amount,
          status: "pending",
          provider: "paymob",
        },
        { transaction: t },
      );
      if (q)
        await reserveCoupon(couponModels, q, { user: req.user, target: couponTarget, paymentAttemptId: payment.id, subscriptionId: subscription.id }, t);
      return { subscription, payment };
    });
    await audit(
      req,
      "request_paid_subscription",
      "subscription",
      result.subscription.id,
      `${plan.code}:${cycle}`,
    );
    // The price comes from the Plan row above, never from the client, so the
    // browser cannot pick its own amount. With Paymob configured we open a
    // real hosted checkout; otherwise the response honestly says the payment
    // provider is not active (the subscription stays pending_payment and is
    // NOT activated by anything the frontend sends).
    let checkout;
    if (paymob.isConfigured()) {
      checkout = { provider: "paymob", configured: true };
      try {
        const attemptWithPlan = await PaymentAttempt.findByPk(result.payment.id, {
          include: [{ model: Subscription, include: [Plan] }],
        });
        const c = await routeDeps.initCheckoutForAttempt(attemptWithPlan, req.user);
        checkout.checkoutUrl = c.checkoutUrl;
      } catch (err) {
        logger.error("subscriptions.checkout_init_failed", { error: String(err) });
        checkout.error = "checkout_init_failed";
      }
    } else {
      checkout = {
        provider: "paymob",
        configured: false,
        message: "payment_provider_activation_required",
      };
    }
    res.status(202).json({
      subscriptionId: result.subscription.id,
      paymentAttemptId: result.payment.id,
      status: "pending_payment",
      paymentStatus: "pending",
      amountEgp: amount,
      originalEgp: listAmount,
      currency: "EGP",
      checkout,
    });
  } catch (e) {
    next(e);
  }
});
app.delete("/api/v1/subscriptions/current", auth, async (req, res, next) => {
  try {
    const item = await Subscription.findOne({
      where: {
        UserId: req.user.id,
        status: { [Op.in]: ["free", "active", "pending_payment"] },
      },
      order: [["createdAt", "DESC"]],
    });
    if (!item) return fail(res, 404, "no_active_subscription");
    // A PAID, currently-running term is cancelled at period end: the member
    // keeps what they paid for until endsAt, then the maintenance job expires
    // it (and no renewal reminder is sent). Free / unpaid / pending
    // subscriptions are simply cancelled now.
    const paidAndRunning =
      item.status === "active" &&
      item.endsAt &&
      item.endsAt > new Date();
    if (paidAndRunning) {
      if (!item.canceledAt) await item.update({ canceledAt: new Date() });
      await audit(req, "cancel_subscription_at_period_end", "subscription", item.id);
      return res.json({ status: "active", cancelsAt: item.endsAt });
    }
    await item.update({ status: "canceled", canceledAt: new Date() });
    await PaymentAttempt.update(
      { status: "canceled" },
      {
        where: {
          SubscriptionId: item.id,
          status: { [Op.in]: ["created", "pending"] },
        },
      },
    );
    await audit(req, "cancel_subscription", "subscription", item.id);
    res.json({ status: "canceled" });
  } catch (e) {
    next(e);
  }
});

app.get("/api/v1/perks", async (req, res, next) => {
  try {
    const [items, access] = await Promise.all([
      Perk.findAll({
        where: { status: "published", availability: { [Op.ne]: "paused" } },
        order: [
          ["featured", "DESC"],
          ["providerGroup", "ASC"],
          ["valueMaxUsd", "DESC"],
        ],
      }),
      req.user
        ? paidAccess(req.user.id)
        : Promise.resolve({
            eligible: false,
            plan: null,
            reason: "sign_in_required",
          }),
    ]);
    const applications = req.user
      ? await PerkApplication.findAll({
          where: { UserId: req.user.id },
          attributes: ["id", "PerkId", "status", "createdAt"],
        })
      : [];
    const byPerk = Object.fromEntries(applications.map((x) => [x.PerkId, x]));
    res.json({
      access,
      items: items.map((item) => ({
        ...item.toJSON(),
        application: byPerk[item.id] || null,
      })),
      disclosure:
        "External programs are subject to each provider's current eligibility, terms and final approval. USAM support does not guarantee acceptance or credit value.",
    });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/my-perk-applications", auth, async (req, res, next) => {
  try {
    res.json({
      items: await PerkApplication.findAll({
        where: { UserId: req.user.id },
        include: [Perk],
        order: [["createdAt", "DESC"]],
      }),
    });
  } catch (e) {
    next(e);
  }
});
app.post("/api/v1/perks/:id/apply", auth, requireVerified, async (req, res, next) => {
  try {
    const access = await paidAccess(req.user.id);
    if (!access.eligible) return fail(res, 403, "paid_membership_required");
    const perk = await Perk.findOne({
      where: {
        id: req.params.id,
        status: "published",
        availability: { [Op.ne]: "paused" },
      },
    });
    if (!perk) return fail(res, 404, "perk_unavailable");
    const startupName = clean(req.body.startupName, 160),
      website = clean(req.body.website, 300),
      stage = clean(req.body.stage, 60),
      useCase = clean(req.body.useCase, 2500);
    if (startupName.length < 2 || stage.length < 2 || useCase.length < 30)
      return fail(res, 400, "invalid_perk_application");
    const [item, created] = await PerkApplication.findOrCreate({
      where: { PerkId: perk.id, UserId: req.user.id },
      defaults: { startupName, website, stage, useCase },
    });
    if (!created) return fail(res, 409, "perk_application_exists");
    await notify(
      req.user.id,
      "perk_application",
      `Your ${perk.provider} perk application was received`,
      "/perks",
    );
    await audit(req, "apply_perk", "perk_application", item.id, perk.slug);
    res.status(201).json({ id: item.id, status: item.status });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/me/summary", auth, async (req, res, next) => {
  try {
    const [joinedCount, postCount] = await Promise.all([
      Membership.count({ where: { UserId: req.user.id } }),
      Post.count({ where: { UserId: req.user.id, status: "published" } }),
    ]);
    res.json({
      joinedCount,
      postCount,
      profileDone: !!(
        req.user.bio?.trim() &&
        req.user.skills &&
        JSON.parse(req.user.skills).length
      ),
    });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/my-events", auth, async (req, res, next) => {
  try {
    const items = await Registration.findAll({
      where: {
        UserId: req.user.id,
        [Op.or]: [
          { status: { [Op.in]: ["registered", "waitlisted"] } },
          { status: "pending_payment", paymentExpiresAt: { [Op.gt]: new Date() } },
        ],
      },
      attributes: { exclude: ["ticketCode"] },
      include: [
        {
          model: Event,
          where: { status: "published" },
          attributes: ["id", "title", "startsAt", "timezone", "venue", "priceType", "priceEgp"],
        },
      ],
      order: [["createdAt", "DESC"]],
      limit: 50,
    });
    res.json({ items });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/activity", auth, async (req, res, next) => {
  try {
    const id = req.user.id;
    const [memberships, posts, comments, registrations, claims] =
      await Promise.all([
        Membership.findAll({
          where: { UserId: id },
          order: [["createdAt", "DESC"]],
          limit: 20,
        }),
        Post.findAll({
          where: { UserId: id, status: "published" },
          include: [{ model: Community, attributes: ["nameEn"] }],
          order: [["createdAt", "DESC"]],
          limit: 20,
        }),
        Comment.findAll({
          where: { UserId: id },
          include: [
            { model: Post, where: { status: "published" }, attributes: ["id"] },
          ],
          order: [["createdAt", "DESC"]],
          limit: 20,
        }),
        Registration.findAll({
          where: {
            UserId: id,
            status: { [Op.in]: ["registered", "waitlisted"] },
          },
          include: [
            {
              model: Event,
              where: { status: "published" },
              attributes: ["id", "title"],
            },
          ],
          order: [["createdAt", "DESC"]],
          limit: 20,
        }),
        Claim.findAll({
          where: { UserId: id },
          include: [{ model: Offer, attributes: ["title"] }],
          order: [["createdAt", "DESC"]],
          limit: 20,
        }),
      ]);
    const communityIds = memberships.map((x) => x.CommunityId);
    const communities = new Map(
      (communityIds.length
        ? await Community.findAll({
            where: { id: { [Op.in]: communityIds } },
            attributes: ["id", "slug", "nameEn"],
          })
        : []
      ).map((x) => [x.id, x]),
    );
    const items = [
      ...memberships.map((x) => ({
        id: x.id,
        kind: "join",
        detail: communities.get(x.CommunityId)?.nameEn || "",
        href: `/communities/${communities.get(x.CommunityId)?.slug || ""}`,
        createdAt: x.createdAt,
      })),
      ...posts.map((x) => ({
        id: x.id,
        kind: "post",
        detail: x.Community?.nameEn || "",
        href: `/posts/${x.id}`,
        createdAt: x.createdAt,
      })),
      ...comments.map((x) => ({
        id: x.id,
        kind: "comment",
        detail: "",
        href: `/posts/${x.PostId}`,
        createdAt: x.createdAt,
      })),
      ...registrations.map((x) => ({
        id: x.id,
        kind: "event",
        detail: x.Event?.title || "",
        href: `/events/${x.EventId}`,
        createdAt: x.createdAt,
      })),
      ...claims.map((x) => ({
        id: x.id,
        kind: "offer",
        detail: x.Offer?.title || "",
        href: "/offers",
        createdAt: x.createdAt,
      })),
    ];
    items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ items: items.slice(0, 50) });
  } catch (e) {
    next(e);
  }
});
app.patch("/api/v1/me", auth, async (req, res, next) => {
  try {
    const updates = {};
    for (const field of ["name", "bio", "location"])
      if (field in req.body)
        updates[field] = clean(req.body[field], field === "bio" ? 400 : 100);
    if (
      req.body.persona &&
      ["launchpad", "freelancespace", "hrconnect", "studentzone"].includes(
        req.body.persona,
      )
    )
      updates.persona = req.body.persona;
    if (req.body.language && ["ar", "en"].includes(req.body.language))
      updates.language = req.body.language;
    if (typeof req.body.discoverable === "boolean")
      updates.discoverable = req.body.discoverable;
    if (typeof req.body.messagesEnabled === "boolean")
      updates.messagesEnabled = req.body.messagesEnabled;
    if (Array.isArray(req.body.skills))
      updates.skills = JSON.stringify(
        req.body.skills
          .slice(0, 15)
          .map((x) => clean(x, 40))
          .filter(Boolean),
      );
    await req.user.update(updates);
    res.json({ user: selfUser(req.user) });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/communities", async (req, res, next) => {
  try {
    const rows = await Community.findAll({ order: [["createdAt", "ASC"]] });
    res.json({ items: rows });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/communities/:slug", async (req, res, next) => {
  try {
    const c = await Community.findOne({ where: { slug: req.params.slug } });
    if (!c) return fail(res, 404, "not_found");
    const count = await Membership.count({ where: { CommunityId: c.id } });
    const joined = req.user
      ? !!(await Membership.findOne({
          where: { CommunityId: c.id, UserId: req.user.id },
        }))
      : false;
    res.json({ item: c, membersCount: count, joined });
  } catch (e) {
    next(e);
  }
});
app.post("/api/v1/communities/:slug/join", auth, requireVerified, async (req, res, next) => {
  try {
    const c = await Community.findOne({ where: { slug: req.params.slug } });
    if (!c) return fail(res, 404, "not_found");
    await Membership.findOrCreate({
      where: { UserId: req.user.id, CommunityId: c.id },
    });
    res.json({ joined: true });
  } catch (e) {
    next(e);
  }
});
app.delete("/api/v1/communities/:slug/join", auth, async (req, res, next) => {
  try {
    const c = await Community.findOne({ where: { slug: req.params.slug } });
    if (!c) return fail(res, 404, "not_found");
    await Membership.destroy({
      where: { UserId: req.user.id, CommunityId: c.id },
    });
    res.json({ joined: false });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/posts", async (req, res, next) => {
  try {
    const where = {};
    if (req.query.community) {
      const c = await Community.findOne({
        where: { slug: req.query.community },
      });
      if (!c) return res.json({ items: [] });
      where.CommunityId = c.id;
    }
    if (req.query.mode === "following") {
      if (!req.user) return signInRequired(req, res);
      const follows = await Follow.findAll({
        where: { FollowerId: req.user.id },
        attributes: ["FollowingId"],
      });
      where.UserId = { [Op.in]: follows.map((f) => f.FollowingId) };
    }
    // Cursor pagination (newest first): `before` = createdAt of the last post
    // already shown. Fetch one extra row to know whether more exist.
    const PAGE = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 20));
    if (req.query.before) {
      const before = new Date(String(req.query.before));
      if (Number.isNaN(before.getTime())) return fail(res, 400, "invalid_cursor");
      where.createdAt = { [Op.lt]: before };
    }
    const rows = await getPosts(where, req.user, PAGE + 1);
    const hasMore = rows.length > PAGE;
    const items = rows.slice(0, PAGE);
    res.json({ items, hasMore, nextBefore: hasMore ? items.at(-1).createdAt : null });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/posts/:id", async (req, res, next) => {
  try {
    const p = await Post.findOne({
      where: { id: req.params.id, status: "published" },
      include: postInclude,
    });
    if (!p || (req.user && (await blocked(req.user.id, p.UserId))))
      return fail(res, 404, "not_found");
    // Comments are fetched separately with an explicit order and a cap. (An
    // `order` nested inside `include` is silently ignored by Sequelize, so they
    // were never actually sorted oldest-first, and the list was unbounded.)
    const [stats, comments] = await Promise.all([
      postStats([p.id], req.user),
      Comment.findAll({
        where: { PostId: p.id },
        include: [{ model: User, attributes: ["id", "name", "username"] }],
        order: [["createdAt", "ASC"]],
        limit: 500,
      }),
    ]);
    res.json({
      item: {
        ...safePost(p, req.user, stats.get(p.id)),
        comments: comments.map((c) => ({
          id: c.id,
          body: c.body,
          createdAt: c.createdAt,
          author: c.User,
        })),
      },
    });
  } catch (e) {
    next(e);
  }
});
app.post("/api/v1/posts", auth, requireVerified, async (req, res, next) => {
  try {
    const body = clean(req.body.body, 3000),
      c = await Community.findOne({ where: { slug: clean(req.body.community, 64) } });
    if (!c || body.length < 2) return fail(res, 400, "invalid_post");
    if (
      !(await Membership.findOne({
        where: { UserId: req.user.id, CommunityId: c.id },
      }))
    )
      return fail(res, 403, "join_community_first");
    // Optional images: ids of MY uploads (POST /media/images) that are not
    // attached to any post yet. Max 4, order preserved.
    const rawIds = Array.isArray(req.body.imageIds) ? req.body.imageIds : [];
    if (rawIds.length > 4) return fail(res, 400, "too_many_images");
    const imageIds = [...new Set(rawIds.map(String))];
    if (imageIds.some((x) => !UUID_RE.test(x))) return fail(res, 400, "invalid_image");
    const p = await sequelize.transaction(async (t) => {
      const assets = imageIds.length
        ? await MediaAsset.findAll({
            where: { id: { [Op.in]: imageIds }, UserId: req.user.id, PostId: null },
            transaction: t,
          })
        : [];
      if (assets.length !== imageIds.length)
        throw Object.assign(new Error("invalid_image"), { status: 400 });
      const post = await Post.create(
        { UserId: req.user.id, CommunityId: c.id, body },
        { transaction: t },
      );
      for (const a of assets)
        await a.update({ PostId: post.id, position: imageIds.indexOf(a.id) }, { transaction: t });
      return post;
    });
    res.status(201).json({ id: p.id });
  } catch (e) {
    next(e);
  }
});
app.patch("/api/v1/posts/:id", auth, async (req, res, next) => {
  try {
    const p = await Post.findByPk(req.params.id);
    if (!p) return fail(res, 404, "not_found");
    if (p.UserId !== req.user.id) return fail(res, 403, "forbidden");
    const body = clean(req.body.body, 3000);
    if (body.length < 2) return fail(res, 400, "invalid_post");
    await p.update({ body });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
app.delete("/api/v1/posts/:id", auth, async (req, res, next) => {
  try {
    const p = await Post.findByPk(req.params.id);
    if (!p) return fail(res, 404, "not_found");
    if (p.UserId !== req.user.id && !hasRole(req.user, "moderator"))
      return fail(res, 403, "forbidden");
    await p.update({ status: "hidden" });
    // An author deleting their own post also deletes its image files (they
    // are publicly addressable). A moderator removal keeps them for review.
    if (p.UserId === req.user.id)
      await destroyAssets(await MediaAsset.findAll({ where: { PostId: p.id } }));
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
app.post("/api/v1/posts/:id/comments", auth, requireVerified, async (req, res, next) => {
  try {
    const p = await Post.findOne({
      where: { id: req.params.id, status: "published" },
    });
    if (!p) return fail(res, 404, "not_found");
    const body = clean(req.body.body, 800);
    if (!body) return fail(res, 400, "invalid_comment");
    const c = await Comment.create({ body, PostId: p.id, UserId: req.user.id });
    if (p.UserId !== req.user.id)
      await notify(
        p.UserId,
        "comment",
        `${req.user.name} commented on your post`,
        `/posts/${p.id}`,
      );
    res.status(201).json({ id: c.id });
  } catch (e) {
    next(e);
  }
});
app.delete(
  "/api/v1/posts/:id/comments/:commentId",
  auth,
  async (req, res, next) => {
    try {
      const c = await Comment.findOne({
        where: { id: req.params.commentId, PostId: req.params.id },
      });
      if (!c) return fail(res, 404, "not_found");
      if (c.UserId !== req.user.id && !hasRole(req.user, "moderator"))
        return fail(res, 403, "forbidden");
      await c.destroy();
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  },
);
app.put("/api/v1/posts/:id/reaction", auth, requireVerified, async (req, res, next) => {
  try {
    const p = await Post.findOne({
      where: { id: req.params.id, status: "published" },
    });
    if (!p) return fail(res, 404, "not_found");
    await Reaction.findOrCreate({
      where: { PostId: p.id, UserId: req.user.id },
    });
    res.json({ liked: true });
  } catch (e) {
    next(e);
  }
});
app.delete("/api/v1/posts/:id/reaction", auth, async (req, res, next) => {
  try {
    await Reaction.destroy({
      where: { PostId: req.params.id, UserId: req.user.id },
    });
    res.json({ liked: false });
  } catch (e) {
    next(e);
  }
});
app.put("/api/v1/posts/:id/bookmark", auth, requireVerified, async (req, res, next) => {
  try {
    const p = await Post.findOne({
      where: { id: req.params.id, status: "published" },
    });
    if (!p) return fail(res, 404, "not_found");
    await Bookmark.findOrCreate({
      where: { PostId: p.id, UserId: req.user.id },
    });
    res.json({ saved: true });
  } catch (e) {
    next(e);
  }
});
app.delete("/api/v1/posts/:id/bookmark", auth, async (req, res, next) => {
  try {
    await Bookmark.destroy({
      where: { PostId: req.params.id, UserId: req.user.id },
    });
    res.json({ saved: false });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/saved", auth, async (req, res, next) => {
  try {
    const b = await Bookmark.findAll({
      where: { UserId: req.user.id },
      attributes: ["PostId"],
    });
    res.json({
      items: await getPosts(
        { id: { [Op.in]: b.map((x) => x.PostId) } },
        req.user,
      ),
    });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/events", async (req, res, next) => {
  try {
    // Upcoming by default; `past=1` for history. Never exposes other members'
    // registrations (previously every attendee's UserId was returned here).
    const past = req.query.past === "1";
    const events = await Event.findAll({
      where: {
        status: "published",
        startsAt: past ? { [Op.lt]: new Date() } : { [Op.gte]: new Date(Date.now() - 6 * 3600_000) },
      },
      include: [{ model: Community, attributes: ["slug", "nameAr", "nameEn"] }],
      order: [["startsAt", past ? "DESC" : "ASC"]],
      limit: 100,
    });
    const views = await eventViews(events, req.user);
    res.json({ items: views });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/events/:id", async (req, res, next) => {
  try {
    // SECURITY: this route is public. It previously included EVERY
    // Registration row (other members' ids and their ticket codes, which are
    // the check-in credential). Now: aggregate counts + only the viewer's own
    // registration.
    // Cancelled events stay reachable so registrants' links still explain
    // what happened (registration itself requires "published").
    const e = await Event.findOne({
      where: { id: req.params.id, status: { [Op.in]: ["published", "cancelled"] } },
      include: [Community],
    });
    if (!e) return fail(res, 404, "not_found");
    const [view] = await eventViews([e], req.user);
    res.json({ item: view });
  } catch (e) {
    next(e);
  }
});
// Paid seats are held this long while the member is on the hosted checkout.
const PAID_SEAT_HOLD_MS = 30 * 60_000;
// Paid event ticket: hold a seat (pending_payment), create a PaymentAttempt
// for the server-side price, and open the Paymob hosted checkout. The seat is
// confirmed (ticket code issued) ONLY by the signature-verified webhook /
// reconciliation in payments.js. Retrying while a hold is open reuses it.
async function registerPaid(req, res, next) {
  try {
    const couponCode = clean(req.body?.couponCode, 40);
    // A 100%-off code needs no payment provider, so check that case first.
    if (!paymob.isConfigured() && !couponCode)
      return fail(res, 409, "payment_provider_activation_required");
    const outcome = await sequelize.transaction(async (t) => {
      const e = await Event.findOne({
        where: { id: req.params.id, status: "published", priceType: "paid" },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!e) throw Object.assign(new Error("event_unavailable"), { status: 404 });
      if (!(e.priceEgp > 0)) throw Object.assign(new Error("event_unavailable"), { status: 404 });
      if (new Date(e.startsAt) < new Date())
        throw Object.assign(new Error("event_started"), { status: 409 });
      const now = new Date();
      const existing = await Registration.findOne({
        where: { EventId: e.id, UserId: req.user.id },
        transaction: t,
      });
      if (existing?.status === "registered") return { status: "registered" };
      const holdOpen =
        existing?.status === "pending_payment" && existing.paymentExpiresAt > now;
      if (holdOpen) {
        const attempt = await PaymentAttempt.findOne({
          where: { RegistrationId: existing.id, status: { [Op.in]: ["created", "pending"] } },
          order: [["createdAt", "DESC"]],
          transaction: t,
        });
        if (attempt) return { status: "pending_payment", attempt, registration: existing };
      }
      const taken = await Registration.count({
        where: {
          EventId: e.id,
          id: existing ? { [Op.ne]: existing.id } : { [Op.ne]: null },
          [Op.or]: [
            { status: "registered" },
            { status: "pending_payment", paymentExpiresAt: { [Op.gt]: now } },
          ],
        },
        transaction: t,
      });
      if (taken >= e.capacity) throw Object.assign(new Error("event_full"), { status: 409 });
      // Optional coupon, checked with its row locked.
      let q = null;
      const couponTarget = { kind: "event", eventId: e.id };
      if (couponCode) {
        q = await quoteCoupon(couponModels, { code: couponCode, user: req.user, target: couponTarget, baseAmount: e.priceEgp }, t);
        if (!q.ok) throw Object.assign(new Error(q.error), { status: 400 });
      }
      if (q && q.finalEgp === 0) {
        // 100% off: the seat is confirmed now; no payment provider involved.
        const ticketCode = crypto.randomBytes(10).toString("hex").toUpperCase();
        const registration = existing
          ? await existing.update({ status: "registered", ticketCode, paymentExpiresAt: null, checkedInAt: null }, { transaction: t })
          : await Registration.create({ EventId: e.id, UserId: req.user.id, status: "registered", ticketCode }, { transaction: t });
        await reserveCoupon(couponModels, q, { user: req.user, target: couponTarget, registrationId: registration.id, redeemed: true }, t);
        return { status: "registered", free: true, registration, event: e, code: q.coupon.code };
      }
      // Something is still to be paid: without a live provider no seat is
      // held and nothing is recorded.
      if (!paymob.isConfigured())
        throw Object.assign(new Error("payment_provider_activation_required"), { status: 409 });
      const paymentExpiresAt = new Date(Date.now() + PAID_SEAT_HOLD_MS);
      const registration = existing
        ? await existing.update(
            { status: "pending_payment", paymentExpiresAt, ticketCode: null, checkedInAt: null },
            { transaction: t },
          )
        : await Registration.create(
            { EventId: e.id, UserId: req.user.id, status: "pending_payment", paymentExpiresAt },
            { transaction: t },
          );
      // Cancel any stale attempts for an earlier, expired hold.
      await PaymentAttempt.update(
        { status: "canceled" },
        { where: { RegistrationId: registration.id, status: { [Op.in]: ["created", "pending"] } }, transaction: t },
      );
      const attempt = await PaymentAttempt.create(
        {
          UserId: req.user.id,
          RegistrationId: registration.id,
          idempotencyKey: `event:${registration.id}:${crypto.randomBytes(6).toString("hex")}`,
          // server-side price (minus a server-validated coupon); never from the client
          amountEgp: q ? q.finalEgp : e.priceEgp,
          status: "pending",
          provider: "paymob",
        },
        { transaction: t },
      );
      if (q)
        await reserveCoupon(couponModels, q, { user: req.user, target: couponTarget, paymentAttemptId: attempt.id, registrationId: registration.id }, t);
      return { status: "pending_payment", attempt, registration, event: e };
    });
    if (outcome.free) {
      await audit(req, "event_ticket_with_coupon", "registration", outcome.registration.id, outcome.code);
      await enqueueEmail(req.user.email, "eventTicket", {
        name: req.user.name,
        eventTitle: outcome.event.title,
        startsAt: outcome.event.startsAt,
        eventId: outcome.event.id,
        ticketCode: outcome.registration.ticketCode,
      });
      await notify(req.user.id, "event_ticket", `Your ticket for ${outcome.event.title} is confirmed`, `/events/${outcome.event.id}`);
      return res.json({ status: "registered", amountEgp: 0 });
    }
    if (outcome.status === "registered") return res.json({ status: "registered" });
    const attempt = await PaymentAttempt.findByPk(outcome.attempt.id, {
      include: [{ model: Registration, include: [Event] }],
    });
    let checkout;
    try {
      checkout = await routeDeps.initCheckoutForAttempt(attempt, req.user);
    } catch (err) {
      logger.error("events.checkout_failed", { error: String(err), attemptId: attempt.id });
      return fail(res, 502, "payment_initialization_failed");
    }
    await audit(req, "event_checkout", "payment_attempt", attempt.id, req.params.id);
    res.status(202).json({
      status: "pending_payment",
      paymentAttemptId: attempt.id,
      amountEgp: attempt.amountEgp,
      holdExpiresAt: outcome.registration.paymentExpiresAt,
      checkoutUrl: checkout.checkoutUrl,
    });
  } catch (e) {
    next(e);
  }
}
app.post("/api/v1/events/:id/register", auth, requireVerified, async (req, res, next) => {
  try {
    const target = await Event.findOne({
      where: { id: req.params.id, status: "published" },
      attributes: ["id", "priceType"],
    });
    if (target?.priceType === "paid") return registerPaid(req, res, next);
    const result = await sequelize.transaction(async (t) => {
      const e = await Event.findOne({
        where: { id: req.params.id, status: "published", priceType: "free" },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!e)
        throw Object.assign(new Error("event_unavailable"), { status: 404 });
      const existing = await Registration.findOne({
        where: { EventId: e.id, UserId: req.user.id },
        transaction: t,
      });
      if (existing && existing.status !== "cancelled") return existing.status;
      const count = await Registration.count({
        where: { EventId: e.id, status: "registered" },
        transaction: t,
      });
      const status = count >= e.capacity ? "waitlisted" : "registered";
      const ticketCode =
        status === "registered"
          ? existing?.ticketCode ||
            crypto.randomBytes(10).toString("hex").toUpperCase()
          : null;
      if (existing)
        await existing.update(
          { status, ticketCode, checkedInAt: null },
          { transaction: t },
        );
      else
        await Registration.create(
          { EventId: e.id, UserId: req.user.id, status, ticketCode },
          { transaction: t },
        );
      return status;
    });
    res.json({ status: result });
  } catch (e) {
    next(e);
  }
});
app.delete("/api/v1/events/:id/register", auth, async (req, res, next) => {
  try {
    await sequelize.transaction(async (t) => {
      const event = await Event.findByPk(req.params.id, {
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!event) throw Object.assign(new Error("not_found"), { status: 404 });
      const registration = await Registration.findOne({
        where: { EventId: event.id, UserId: req.user.id },
        transaction: t,
      });
      if (!registration || registration.status === "cancelled") return;
      if (event.priceType === "paid") {
        // A paid, confirmed ticket is cancelled through a refund (admin
        // Payments panel) so money and seat stay consistent. An unpaid hold
        // can simply be released.
        if (registration.status === "registered")
          throw Object.assign(new Error("paid_ticket_refund_required"), { status: 409 });
        await registration.update({ status: "cancelled" }, { transaction: t });
        await PaymentAttempt.update(
          { status: "canceled" },
          {
            where: { RegistrationId: registration.id, status: { [Op.in]: ["created", "pending"] } },
            transaction: t,
          },
        );
        return;
      }
      const freed = registration.status === "registered";
      await registration.update({ status: "cancelled" }, { transaction: t });
      if (freed) {
        const next = await Registration.findOne({
          where: { EventId: event.id, status: "waitlisted" },
          order: [["createdAt", "ASC"]],
          transaction: t,
          lock: t.LOCK.UPDATE,
        });
        if (next) {
          await next.update(
            {
              status: "registered",
              ticketCode: crypto.randomBytes(10).toString("hex").toUpperCase(),
            },
            { transaction: t },
          );
          await Notification.create(
            {
              UserId: next.UserId,
              kind: "event_waitlist",
              text: "A place is now available for your event",
              href: `/events/${event.id}`,
            },
            { transaction: t },
          );
        }
      }
    });
    res.json({ status: "cancelled" });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/offers", async (req, res, next) => {
  try {
    res.json({
      items: await Offer.findAll({
        where: { status: "published" },
        attributes: { exclude: ["code"] },
      }),
    });
  } catch (e) {
    next(e);
  }
});
app.post("/api/v1/offers/:id/claim", auth, requireVerified, async (req, res, next) => {
  try {
    const item = await sequelize.transaction(async (t) => {
      const offer = await Offer.findOne({
        where: { id: req.params.id, status: "published" },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });
      if (!offer || (offer.expiresAt && offer.expiresAt < new Date()))
        throw Object.assign(new Error("offer_unavailable"), { status: 404 });
      const prior = await Claim.findOne({
        where: { OfferId: offer.id, UserId: req.user.id },
        transaction: t,
      });
      if (prior) return prior;
      if (offer.claimedCount >= offer.quantity)
        throw Object.assign(new Error("offer_full"), { status: 409 });
      await offer.increment("claimedCount", { transaction: t });
      return Claim.create(
        {
          OfferId: offer.id,
          UserId: req.user.id,
          claimCode: crypto.randomBytes(8).toString("hex"),
        },
        { transaction: t },
      );
    });
    const claimedOffer = await Offer.findByPk(item.OfferId);
    res.json({
      claimId: item.claimCode,
      code: claimedOffer.code || null,
      terms: claimedOffer.terms || "",
    });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/organizations", async (req, res, next) => {
  try {
    res.json({
      items: await Organization.findAll({
        where: { status: "approved" },
        attributes: { exclude: ["OwnerId"] },
      }),
    });
  } catch (e) {
    next(e);
  }
});
app.post("/api/v1/organizations", auth, requireVerified, async (req, res, next) => {
  try {
    const name = clean(req.body.name, 160),
      description = clean(req.body.description, 1500),
      sector = clean(req.body.sector, 100);
    if (name.length < 2) return fail(res, 400, "invalid_organization");
    const o = await Organization.create({
      name,
      description,
      sector,
      OwnerId: req.user.id,
    });
    res.status(201).json({ id: o.id, status: o.status });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/mentors", async (req, res, next) => {
  try {
    const rows = await Mentor.findAll({
      where: { published: true },
      include: [
        {
          model: User,
          attributes: ["id", "name", "username", "bio", "location"],
        },
      ],
    });
    res.json({ items: rows });
  } catch (e) {
    next(e);
  }
});
app.post("/api/v1/mentors/:id/request", auth, requireVerified, async (req, res, next) => {
  try {
    const mentor = await Mentor.findOne({
      where: { id: req.params.id, published: true },
    });
    if (!mentor || mentor.UserId === req.user.id)
      return fail(res, 404, "not_found");
    const message = clean(req.body.message, 1000);
    if (message.length < 10) return fail(res, 400, "invalid_message");
    // Prevent duplicate outstanding requests from the same member.
    const prior = await MentorRequest.findOne({
      where: { MentorId: mentor.id, UserId: req.user.id },
    });
    if (prior) return fail(res, 409, "request_exists");
    const r = await MentorRequest.create({
      MentorId: mentor.id,
      UserId: req.user.id,
      message,
    });
    await notify(
      mentor.UserId,
      "mentor_request",
      `${req.user.name} requested mentorship`,
      "/mentorship",
    );
    res.status(201).json({ id: r.id, status: r.status });
  } catch (e) {
    next(e);
  }
});
app.post("/api/v1/mentors", auth, requireVerified, async (req, res, next) => {
  try {
    const expertise = clean(req.body.expertise, 160),
      availability = clean(req.body.availability, 160);
    if (expertise.length < 3) return fail(res, 400, "invalid_expertise");
    const [m] = await Mentor.findOrCreate({
      where: { UserId: req.user.id },
      defaults: { expertise, availability, published: false },
    });
    await m.update({ expertise, availability, published: false });
    res.json({ id: m.id, status: "pending_review" });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/mentorship", auth, async (req, res, next) => {
  try {
    const own = await Mentor.findOne({ where: { UserId: req.user.id } });
    const [sent, incoming] = await Promise.all([
      MentorRequest.findAll({
        where: { UserId: req.user.id },
        include: [
          {
            model: Mentor,
            include: [{ model: User, attributes: ["name", "username"] }],
          },
        ],
        order: [["createdAt", "DESC"]],
      }),
      own
        ? MentorRequest.findAll({
            where: { MentorId: own.id },
            include: [{ model: User, attributes: ["name", "username"] }],
            order: [["createdAt", "DESC"]],
          })
        : [],
    ]);
    res.json({ mentor: own, sent, incoming });
  } catch (e) {
    next(e);
  }
});
app.patch("/api/v1/mentorship/:id", auth, async (req, res, next) => {
  try {
    const r = await MentorRequest.findByPk(req.params.id, { include: Mentor });
    if (!r) return fail(res, 404, "not_found");
    if (r.Mentor.UserId !== req.user.id) return fail(res, 403, "forbidden");
    if (!["accepted", "declined"].includes(req.body.status))
      return fail(res, 400, "invalid_status");
    await r.update({ status: req.body.status });
    await notify(
      r.UserId,
      "mentor_response",
      `Your mentorship request was ${r.status}`,
      "/mentorship",
    );
    res.json({ status: r.status });
  } catch (e) {
    next(e);
  }
});
async function blocked(a, b) {
  return !!(await Block.findOne({
    where: {
      [Op.or]: [
        { UserId: a, BlockedUserId: b },
        { UserId: b, BlockedUserId: a },
      ],
    },
  }));
}
app.put("/api/v1/members/:id/block", auth, async (req, res, next) => {
  try {
    const target = await User.findByPk(req.params.id);
    if (!target || target.id === req.user.id)
      return fail(res, 404, "not_found");
    await Block.findOrCreate({
      where: { UserId: req.user.id, BlockedUserId: target.id },
    });
    await Follow.destroy({
      where: {
        [Op.or]: [
          { FollowerId: req.user.id, FollowingId: target.id },
          { FollowerId: target.id, FollowingId: req.user.id },
        ],
      },
    });
    res.json({ blocked: true });
  } catch (e) {
    next(e);
  }
});
app.delete("/api/v1/members/:id/block", auth, async (req, res, next) => {
  try {
    await Block.destroy({
      where: { UserId: req.user.id, BlockedUserId: req.params.id },
    });
    res.json({ blocked: false });
  } catch (e) {
    next(e);
  }
});
// List the members the current user has blocked (powers the unblock UI).
app.get("/api/v1/me/blocks", auth, async (req, res, next) => {
  try {
    const rows = await Block.findAll({
      where: { UserId: req.user.id },
      include: [
        { model: User, as: "blocked", attributes: ["id", "name", "username"] },
      ],
      order: [["createdAt", "DESC"]],
      limit: 100,
    });
    res.json({
      items: rows
        .filter((b) => b.blocked)
        .map((b) => ({
          id: b.blocked.id,
          name: b.blocked.name,
          username: b.blocked.username,
        })),
    });
  } catch (e) {
    next(e);
  }
});
app.put("/api/v1/members/:id/follow", auth, requireVerified, async (req, res, next) => {
  try {
    const target = await User.findByPk(req.params.id);
    if (
      !target ||
      !target.discoverable ||
      target.id === req.user.id ||
      (await blocked(req.user.id, target.id))
    )
      return fail(res, 404, "not_found");
    const [, created] = await Follow.findOrCreate({
      where: { FollowerId: req.user.id, FollowingId: target.id },
    });
    if (created)
      await notify(
        target.id,
        "follow",
        `${req.user.name} followed your profile`,
        `/members/${req.user.username}`,
      );
    res.json({ following: true });
  } catch (e) {
    next(e);
  }
});
app.delete("/api/v1/members/:id/follow", auth, async (req, res, next) => {
  try {
    await Follow.destroy({
      where: { FollowerId: req.user.id, FollowingId: req.params.id },
    });
    res.json({ following: false });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/me/network", auth, async (req, res, next) => {
  try {
    const rows = await Follow.findAll({
      where: { FollowerId: req.user.id },
      include: [
        {
          model: User,
          as: "following",
          attributes: [
            "id",
            "name",
            "username",
            "persona",
            "bio",
            "location",
            "skills",
            "discoverable",
          ],
        },
      ],
      limit: 100,
    });
    res.json({
      items: rows
        .filter((f) => f.following?.discoverable)
        .map((f) => publicUser(f.following)),
    });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/messages", auth, async (req, res, next) => {
  try {
    const rows = await Conversation.findAll({
      where: {
        [Op.or]: [{ FirstUserId: req.user.id }, { SecondUserId: req.user.id }],
      },
      include: [
        { model: User, as: "first", attributes: ["id", "name", "username"] },
        { model: User, as: "second", attributes: ["id", "name", "username"] },
      ],
      order: [["updatedAt", "DESC"]],
      limit: 50,
    });
    const ids = rows.map((c) => c.id);
    // Last message preview + unread count per conversation (two grouped
    // queries, not 2N).
    const [lastRows, unreadRows] = ids.length
      ? await Promise.all([
          Message.findAll({
            where: { ConversationId: { [Op.in]: ids } },
            attributes: [
              "ConversationId",
              [sequelize.fn("MAX", sequelize.col("createdAt")), "at"],
            ],
            group: ["ConversationId"],
            raw: true,
          }).then((maxes) =>
            maxes.length
              ? Message.findAll({
                  where: {
                    [Op.or]: maxes.map((x) => ({
                      ConversationId: x.ConversationId,
                      createdAt: new Date(x.at),
                    })),
                  },
                  attributes: ["ConversationId", "body", "SenderId", "createdAt"],
                })
              : [],
          ),
          Message.findAll({
            where: {
              ConversationId: { [Op.in]: ids },
              SenderId: { [Op.ne]: req.user.id },
              readAt: null,
            },
            attributes: [
              "ConversationId",
              [sequelize.fn("COUNT", sequelize.col("id")), "n"],
            ],
            group: ["ConversationId"],
            raw: true,
          }),
        ])
      : [[], []];
    const last = new Map();
    for (const m of lastRows) if (!last.has(m.ConversationId)) last.set(m.ConversationId, m);
    const unread = new Map(unreadRows.map((r) => [r.ConversationId, Number(r.n)]));
    res.json({
      items: rows.map((c) => {
        const m = last.get(c.id);
        return {
          id: c.id,
          other: c.FirstUserId === req.user.id ? c.second : c.first,
          updatedAt: c.updatedAt,
          lastMessage: m
            ? { body: m.body.slice(0, 120), mine: m.SenderId === req.user.id, createdAt: m.createdAt }
            : null,
          unread: unread.get(c.id) || 0,
        };
      }),
      unreadTotal: [...unread.values()].reduce((a, b) => a + b, 0),
    });
  } catch (e) {
    next(e);
  }
});
app.post("/api/v1/messages/start", auth, requireVerified, async (req, res, next) => {
  try {
    const target = await User.findOne({
      where: { username: clean(req.body.username, 50) },
    });
    if (
      !target ||
      target.id === req.user.id ||
      !target.discoverable ||
      !target.messagesEnabled ||
      !req.user.messagesEnabled
    )
      return fail(res, 403, "messaging_unavailable");
    if (await blocked(req.user.id, target.id))
      return fail(res, 403, "messaging_unavailable");
    const mine = await Membership.findAll({
      where: { UserId: req.user.id },
      attributes: ["CommunityId"],
    });
    if (
      !mine.length ||
      !(await Membership.findOne({
        where: {
          UserId: target.id,
          CommunityId: { [Op.in]: mine.map((m) => m.CommunityId) },
        },
      }))
    )
      return fail(res, 403, "shared_community_required");
    const pairKey = [req.user.id, target.id].sort().join(":");
    const [c] = await Conversation.findOrCreate({
      where: { pairKey },
      defaults: { FirstUserId: req.user.id, SecondUserId: target.id },
    });
    res.json({ id: c.id });
  } catch (e) {
    next(e);
  }
});
async function ownConversation(req, res) {
  const c = await Conversation.findByPk(req.params.id);
  if (!c || ![c.FirstUserId, c.SecondUserId].includes(req.user.id)) {
    fail(res, 404, "not_found");
    return null;
  }
  if (await blocked(c.FirstUserId, c.SecondUserId)) {
    fail(res, 403, "messaging_unavailable");
    return null;
  }
  return c;
}
app.get("/api/v1/messages/:id", auth, async (req, res, next) => {
  try {
    const c = await ownConversation(req, res);
    if (!c) return;
    const other = await User.findByPk(
      c.FirstUserId === req.user.id ? c.SecondUserId : c.FirstUserId,
      { attributes: ["id", "name", "username"] },
    );
    // Newest page first (previously the OLDEST 100 were returned, so long
    // threads stopped showing new messages). `before` = ISO timestamp cursor
    // for loading older history.
    const PAGE = 50;
    const where = { ConversationId: c.id };
    if (req.query.before) {
      const before = new Date(String(req.query.before));
      if (Number.isNaN(before.getTime())) return fail(res, 400, "invalid_cursor");
      where.createdAt = { [Op.lt]: before };
    }
    const page = await Message.findAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: PAGE + 1,
    });
    const hasMore = page.length > PAGE;
    const items = page.slice(0, PAGE).reverse();
    res.json({
      other,
      items,
      hasMore,
      nextBefore: hasMore ? items[0].createdAt : null,
    });
  } catch (e) {
    next(e);
  }
});
app.post("/api/v1/messages/:id", auth, requireVerified, async (req, res, next) => {
  try {
    const c = await ownConversation(req, res);
    if (!c) return;
    const recipientId =
      c.FirstUserId === req.user.id ? c.SecondUserId : c.FirstUserId;
    const recipient = await User.findByPk(recipientId);
    if (!recipient?.messagesEnabled || !req.user.messagesEnabled)
      return fail(res, 403, "messaging_unavailable");
    const body = clean(req.body.body, 2000);
    if (!body) return fail(res, 400, "invalid_message");
    const m = await Message.create({
      ConversationId: c.id,
      SenderId: req.user.id,
      body,
    });
    await c.update({ updatedAt: new Date() });
    const live = { conversationId: c.id, messageId: m.id, senderId: req.user.id };
    publish(recipientId, "message", live);
    publish(req.user.id, "message", live); // the sender's other tabs
    await notify(
      recipientId,
      "message",
      `New message from ${req.user.name}`,
      `/messages/${c.id}`,
    );
    res.status(201).json({ id: m.id });
  } catch (e) {
    next(e);
  }
});
app.patch("/api/v1/messages/:id/read", auth, async (req, res, next) => {
  try {
    const c = await ownConversation(req, res);
    if (!c) return;
    await Message.update(
      { readAt: new Date() },
      {
        where: {
          ConversationId: c.id,
          SenderId: { [Op.ne]: req.user.id },
          readAt: null,
        },
      },
    );
    // Read receipts: the other participant's open thread can update.
    const otherId = c.FirstUserId === req.user.id ? c.SecondUserId : c.FirstUserId;
    publish(otherId, "read", { conversationId: c.id });
    publish(req.user.id, "read", { conversationId: c.id });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/challenges", async (req, res, next) => {
  try {
    res.json({
      items: await Challenge.findAll({
        where: { status: "published" },
        include: [
          { model: Community, attributes: ["slug", "nameAr", "nameEn"] },
        ],
        order: [["deadline", "ASC"]],
      }),
    });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/challenges/:id", async (req, res, next) => {
  try {
    const c = await Challenge.findOne({
      where: { id: req.params.id, status: "published" },
      include: [Community],
    });
    if (!c) return fail(res, 404, "not_found");
    const mine = req.user
      ? await Submission.findOne({
          where: { ChallengeId: c.id, UserId: req.user.id },
        })
      : null;
    res.json({ item: c, mine });
  } catch (e) {
    next(e);
  }
});
app.post("/api/v1/challenges/:id/submissions", auth, requireVerified, async (req, res, next) => {
  try {
    const c = await Challenge.findOne({
      where: {
        id: req.params.id,
        status: "published",
        deadline: { [Op.gt]: new Date() },
      },
    });
    if (!c) return fail(res, 404, "challenge_closed");
    if (
      !(await Membership.findOne({
        where: { UserId: req.user.id, CommunityId: c.CommunityId },
      }))
    )
      return fail(res, 403, "join_community_first");
    const body = clean(req.body.body, 5000);
    if (body.length < 20) return fail(res, 400, "invalid_submission");
    const [s, created] = await Submission.findOrCreate({
      where: { ChallengeId: c.id, UserId: req.user.id },
      defaults: { body },
    });
    if (!created) {
      if (s.status === "reviewed") return fail(res, 409, "submission_reviewed");
      await s.update({ body });
    }
    res.status(created ? 201 : 200).json({ id: s.id, status: s.status });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/my-submissions", auth, async (req, res, next) => {
  try {
    res.json({
      items: await Submission.findAll({
        where: { UserId: req.user.id },
        include: [Challenge],
        order: [["createdAt", "DESC"]],
      }),
    });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/admin/mentors", auth, admin, async (req, res, next) => {
  try {
    res.json({
      items: await Mentor.findAll({
        where: { published: false },
        include: [{ model: User, attributes: ["name", "username"] }],
      }),
    });
  } catch (e) {
    next(e);
  }
});
app.patch("/api/v1/admin/mentors/:id", auth, admin, async (req, res, next) => {
  try {
    const m = await Mentor.findByPk(req.params.id);
    if (!m) return fail(res, 404, "not_found");
    if (req.body.published !== true) return fail(res, 400, "invalid_status");
    await m.update({ published: true });
    await audit(req, "approve_mentor", "mentor", m.id);
    await notify(
      m.UserId,
      "mentor_review",
      "Your mentor profile is now published",
      "/mentorship",
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
app.post("/api/v1/admin/challenges", auth, admin, async (req, res, next) => {
  try {
    const title = clean(req.body.title, 160),
      description = clean(req.body.description, 4000),
      deadline = new Date(req.body.deadline),
      c = await Community.findOne({ where: { slug: req.body.community } });
    if (
      title.length < 3 ||
      description.length < 15 ||
      !c ||
      isNaN(deadline) ||
      deadline <= new Date()
    )
      return fail(res, 400, "invalid_challenge");
    const x = await Challenge.create({
      title,
      description,
      deadline,
      CommunityId: c.id,
      OrganizerId: req.user.id,
      status: "published",
    });
    await audit(req, "create_challenge", "challenge", x.id);
    res.status(201).json({ id: x.id });
  } catch (e) {
    next(e);
  }
});
app.get(
  "/api/v1/admin/challenges/:id/submissions",
  auth,
  admin,
  async (req, res, next) => {
    try {
      res.json({
        items: await Submission.findAll({
          where: { ChallengeId: req.params.id },
          include: [{ model: User, attributes: ["name", "username"] }],
        }),
      });
    } catch (e) {
      next(e);
    }
  },
);
app.patch(
  "/api/v1/admin/submissions/:id",
  auth,
  admin,
  async (req, res, next) => {
    try {
      const s = await Submission.findByPk(req.params.id);
      if (!s) return fail(res, 404, "not_found");
      await s.update({
        status: "reviewed",
        feedback: clean(req.body.feedback, 1000),
      });
      await audit(req, "review_submission", "submission", s.id);
      await notify(
        s.UserId,
        "submission_review",
        "Your challenge submission was reviewed",
        "/my-submissions",
      );
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  },
);
app.get("/api/v1/members/:username", async (req, res, next) => {
  try {
    const u = await User.findOne({
      where: { username: req.params.username, discoverable: true },
    });
    if (!u || (req.user && (await blocked(req.user.id, u.id))))
      return fail(res, 404, "not_found");
    const following = req.user
      ? !!(await Follow.findOne({
          where: { FollowerId: req.user.id, FollowingId: u.id },
        }))
      : false;
    // Surface published-mentor status so the profile can offer "Request
    // mentorship" (wires POST /mentors/:id/request, previously UI-less).
    const mentorProfile = await Mentor.findOne({
      where: { UserId: u.id, published: true },
    });
    let mentor = null;
    if (mentorProfile) {
      const requested =
        req.user &&
        !!(await MentorRequest.findOne({
          where: { MentorId: mentorProfile.id, UserId: req.user.id },
        }));
      mentor = {
        id: mentorProfile.id,
        expertise: mentorProfile.expertise,
        availability: mentorProfile.availability,
        requested: !!requested,
      };
    }
    res.json({ item: publicUser(u), following, mentor });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/members", async (req, res, next) => {
  try {
    // Directory: only opted-in, active accounts. Optional server-side search
    // (`q` on name/username/location/bio), `persona` filter and pages.
    const where = { discoverable: true, isDeleted: false, status: "active" };
    const q = clean(req.query.q, 80);
    if (q.length >= 2)
      where[Op.or] = [
        { name: contains(q) },
        { username: contains(q) },
        { location: contains(q) },
        { bio: contains(q) },
      ];
    const persona = clean(req.query.persona, 30);
    if (["launchpad", "freelancespace", "hrconnect", "studentzone"].includes(persona))
      where.persona = persona;
    const pageSize = 48;
    const page = Math.max(1, Math.min(1000, Number.parseInt(req.query.page, 10) || 1));
    const rows = await User.findAll({
      where,
      order: [["createdAt", "DESC"]],
      offset: (page - 1) * pageSize,
      attributes: [
        "id",
        "name",
        "username",
        "persona",
        "bio",
        "location",
        "skills",
        "avatarUrl",
        "createdAt",
      ],
      limit: pageSize + 1,
    });
    const hasMore = rows.length > pageSize;
    rows.splice(pageSize);
    const blockedIds = req.user
      ? (
          await Block.findAll({
            where: {
              [Op.or]: [
                { UserId: req.user.id },
                { BlockedUserId: req.user.id },
              ],
            },
          })
        ).flatMap((b) => [b.UserId, b.BlockedUserId])
      : [];
    res.json({
      items: rows.filter((u) => !blockedIds.includes(u.id)).map(publicUser),
      page,
      hasMore,
    });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/search", async (req, res, next) => {
  try {
    const q = clean(req.query.q, 80);
    if (q.length < 2) return res.json({ members: [], posts: [], events: [] });
    const like = contains(q);
    const [members, posts, events] = await Promise.all([
      User.findAll({ where: { discoverable: true, name: like }, limit: 10 }),
      getPosts({ body: like }, req.user, 10),
      Event.findAll({ where: { status: "published", title: like }, limit: 10 }),
    ]);
    const denied = req.user
      ? (
          await Block.findAll({
            where: {
              [Op.or]: [
                { UserId: req.user.id },
                { BlockedUserId: req.user.id },
              ],
            },
          })
        ).flatMap((b) => [b.UserId, b.BlockedUserId])
      : [];
    res.json({
      members: members.filter((m) => !denied.includes(m.id)).map(publicUser),
      posts,
      events,
    });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/notifications", auth, async (req, res, next) => {
  try {
    // Cursor pagination: `before` = createdAt of the last item already shown.
    const PAGE = 30;
    const where = { UserId: req.user.id };
    if (req.query.before) {
      const before = new Date(String(req.query.before));
      if (Number.isNaN(before.getTime())) return fail(res, 400, "invalid_cursor");
      where.createdAt = { [Op.lt]: before };
    }
    const [rows, unreadCount] = await Promise.all([
      Notification.findAll({ where, order: [["createdAt", "DESC"]], limit: PAGE + 1 }),
      Notification.count({ where: { UserId: req.user.id, readAt: null } }),
    ]);
    const hasMore = rows.length > PAGE;
    const items = rows.slice(0, PAGE);
    res.json({
      items,
      unreadCount,
      hasMore,
      nextBefore: hasMore ? items.at(-1).createdAt : null,
    });
  } catch (e) {
    next(e);
  }
});
// Badge counts for the app shell (one cheap call, refreshed on live events).
app.get("/api/v1/me/unread", auth, async (req, res, next) => {
  try {
    const convs = await Conversation.findAll({
      where: { [Op.or]: [{ FirstUserId: req.user.id }, { SecondUserId: req.user.id }] },
      attributes: ["id"],
    });
    const [notifications, messages] = await Promise.all([
      Notification.count({ where: { UserId: req.user.id, readAt: null } }),
      convs.length
        ? Message.count({
            where: {
              ConversationId: { [Op.in]: convs.map((c) => c.id) },
              SenderId: { [Op.ne]: req.user.id },
              readAt: null,
            },
          })
        : 0,
    ]);
    res.json({ notifications, messages });
  } catch (e) {
    next(e);
  }
});
app.patch("/api/v1/notifications/:id/read", auth, async (req, res, next) => {
  try {
    const [count] = await Notification.update(
      { readAt: new Date() },
      { where: { id: req.params.id, UserId: req.user.id } },
    );
    if (!count) return fail(res, 404, "not_found");
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
app.patch("/api/v1/notifications/read-all", auth, async (req, res, next) => {
  try {
    await Notification.update(
      { readAt: new Date() },
      { where: { UserId: req.user.id, readAt: null } },
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/notification-preferences", auth, async (req, res, next) => {
  try {
    const [item] = await NotificationPreference.findOrCreate({
      where: { UserId: req.user.id },
      defaults: { UserId: req.user.id },
    });
    res.json({
      item: {
        inApp: item.inApp,
        email: item.email,
        digest: item.digest,
        kinds: JSON.parse(item.kinds || "[]"),
      },
    });
  } catch (e) {
    next(e);
  }
});
app.put("/api/v1/notification-preferences", auth, async (req, res, next) => {
  try {
    const digest = clean(req.body.digest, 10);
    if (!["off", "daily", "weekly"].includes(digest))
      return fail(res, 400, "invalid_digest");
    const [item] = await NotificationPreference.findOrCreate({
      where: { UserId: req.user.id },
      defaults: { UserId: req.user.id },
    });
    await item.update({
      inApp: req.body.inApp !== false,
      email: req.body.email === true,
      digest,
      kinds: JSON.stringify(
        Array.isArray(req.body.kinds)
          ? req.body.kinds
              .slice(0, 20)
              .map((x) => clean(x, 40))
              .filter(Boolean)
          : [],
      ),
    });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.get("/api/v1/saved-searches", auth, async (req, res, next) => {
  try {
    res.json({
      items: await SavedSearch.findAll({
        where: { UserId: req.user.id },
        order: [["createdAt", "DESC"]],
        limit: 20,
      }),
    });
  } catch (e) {
    next(e);
  }
});
app.post("/api/v1/saved-searches", auth, requireFlag("saved_searches"), async (req, res, next) => {
  try {
    const label = clean(req.body.label, 100),
      query = clean(req.body.query, 80);
    if (label.length < 2 || query.length < 2)
      return fail(res, 400, "invalid_saved_search");
    if ((await SavedSearch.count({ where: { UserId: req.user.id } })) >= 20)
      return fail(res, 409, "saved_search_limit");
    const item = await SavedSearch.create({
      UserId: req.user.id,
      label,
      query,
      filters: JSON.stringify(
        req.body.filters && typeof req.body.filters === "object"
          ? req.body.filters
          : {},
      ),
    });
    res.status(201).json({ id: item.id });
  } catch (e) {
    next(e);
  }
});
app.delete("/api/v1/saved-searches/:id", auth, async (req, res, next) => {
  try {
    const count = await SavedSearch.destroy({
      where: { id: req.params.id, UserId: req.user.id },
    });
    if (!count) return fail(res, 404, "not_found");
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

app.get("/api/v1/groups", async (req, res, next) => {
  try {
    const items = await Group.findAll({
      where: { status: "published" },
      include: [
        { model: Community, attributes: ["slug", "nameAr", "nameEn"] },
        { model: GroupMembership, attributes: ["UserId", "status", "role"] },
      ],
      order: [["createdAt", "ASC"]],
    });
    res.json({
      items: items.map((g) => ({
        ...g.toJSON(),
        membership: req.user
          ? g.GroupMemberships.find((m) => m.UserId === req.user.id) || null
          : null,
        GroupMemberships: undefined,
      })),
    });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/me/groups", auth, async (req, res, next) => {
  try {
    res.json({
      items: await GroupMembership.findAll({
        where: {
          UserId: req.user.id,
          status: { [Op.in]: ["pending", "active"] },
        },
        include: [{ model: Group, include: [Community] }],
        order: [["createdAt", "DESC"]],
      }),
    });
  } catch (e) {
    next(e);
  }
});
app.post("/api/v1/groups/:id/join", auth, requireVerified, async (req, res, next) => {
  try {
    const group = await Group.findOne({
      where: { id: req.params.id, status: "published" },
    });
    if (!group) return fail(res, 404, "not_found");
    if (
      !(await Membership.findOne({
        where: { UserId: req.user.id, CommunityId: group.CommunityId },
      }))
    )
      return fail(res, 403, "join_community_first");
    const status = group.visibility === "private" ? "pending" : "active";
    const [item] = await GroupMembership.findOrCreate({
      where: { GroupId: group.id, UserId: req.user.id },
      defaults: { status },
    });
    if (item.status === "left" || item.status === "rejected")
      await item.update({ status });
    res.json({ status: item.status });
  } catch (e) {
    next(e);
  }
});
app.delete("/api/v1/groups/:id/join", auth, async (req, res, next) => {
  try {
    const item = await GroupMembership.findOne({
      where: { GroupId: req.params.id, UserId: req.user.id },
    });
    if (!item) return fail(res, 404, "not_found");
    await item.update({ status: "left" });
    res.json({ status: "left" });
  } catch (e) {
    next(e);
  }
});

app.get("/api/v1/curated-rooms", async (req, res, next) => {
  try {
    const items = await Room.findAll({
      where: { status: { [Op.in]: ["open", "completed"] } },
      include: [{ model: Community, attributes: ["slug", "nameAr", "nameEn"] }],
      order: [
        ["startsAt", "ASC"],
        ["createdAt", "ASC"],
      ],
    });
    const ids = items.map((r) => r.id);
    // Only the CALLER's own applications (with the fields the UI needs to act
    // on them) plus an aggregate seat count; never other members' rows.
    const [mine, accepted] = await Promise.all([
      req.user && ids.length
        ? RoomApplication.findAll({
            where: { UserId: req.user.id, RoomId: { [Op.in]: ids } },
            attributes: ["id", "RoomId", "status", "checkedInAt", "rating"],
          })
        : [],
      ids.length
        ? RoomApplication.findAll({
            where: { RoomId: { [Op.in]: ids }, status: "accepted" },
            attributes: [
              "RoomId",
              [sequelize.fn("COUNT", sequelize.col("id")), "n"],
            ],
            group: ["RoomId"],
            raw: true,
          })
        : [],
    ]);
    const seats = Object.fromEntries(accepted.map((a) => [a.RoomId, Number(a.n)]));
    res.json({
      items: items.map((room) => ({
        ...room.toJSON(),
        seatsTaken: seats[room.id] || 0,
        application: mine.find((x) => x.RoomId === room.id) || null,
      })),
    });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/me/room-applications", auth, async (req, res, next) => {
  try {
    res.json({
      items: await RoomApplication.findAll({
        where: { UserId: req.user.id },
        include: [{ model: Room, include: [Community] }],
        order: [["createdAt", "DESC"]],
      }),
    });
  } catch (e) {
    next(e);
  }
});
app.post(
  "/api/v1/curated-rooms/:id/applications",
  auth, requireVerified, requireFlag("rooms_applications"),
  async (req, res, next) => {
    try {
      const room = await Room.findOne({
          where: { id: req.params.id, status: "open" },
        }),
        motivation = clean(req.body.motivation, 1200);
      if (!room) return fail(res, 404, "room_unavailable");
      if (motivation.length < 20) return fail(res, 400, "invalid_motivation");
      if (
        !(await Membership.findOne({
          where: { UserId: req.user.id, CommunityId: room.CommunityId },
        }))
      )
        return fail(res, 403, "join_community_first");
      const [item, created] = await RoomApplication.findOrCreate({
        where: { RoomId: room.id, UserId: req.user.id },
        defaults: { motivation, status: "pending" },
      });
      if (!created) {
        if (!["cancelled", "rejected"].includes(item.status))
          return fail(res, 409, "application_exists");
        await item.update({
          motivation,
          status: "pending",
          feedback: null,
          rating: null,
          checkedInAt: null,
        });
      }
      await audit(req, "apply_room", "room_application", item.id, room.id);
      res
        .status(created ? 201 : 200)
        .json({ id: item.id, status: item.status });
    } catch (e) {
      next(e);
    }
  },
);
app.patch("/api/v1/room-applications/:id", auth, async (req, res, next) => {
  try {
    const item = await RoomApplication.findOne({
      where: { id: req.params.id, UserId: req.user.id },
    });
    if (!item) return fail(res, 404, "not_found");
    // A member may withdraw while pending, or release an accepted seat they
    // won't use (before check-in) so it isn't blocked for others.
    if (
      req.body.action === "cancel" &&
      ["pending", "accepted"].includes(item.status) &&
      !item.checkedInAt
    ) {
      await item.update({ status: "cancelled" });
      return res.json({ status: item.status });
    }
    if (
      req.body.action === "feedback" &&
      item.status === "accepted" &&
      item.checkedInAt
    ) {
      const rating = Number(req.body.rating),
        feedback = clean(req.body.feedback, 1500);
      if (rating < 1 || rating > 5 || feedback.length < 10)
        return fail(res, 400, "invalid_feedback");
      await item.update({ rating, feedback });
      return res.json({ ok: true });
    }
    return fail(res, 409, "invalid_transition");
  } catch (e) {
    next(e);
  }
});

app.get("/api/v1/partnerships/mine", auth, async (req, res, next) => {
  try {
    res.json({
      items: await Partnership.findAll({
        where: { UserId: req.user.id },
        order: [["createdAt", "DESC"]],
      }),
    });
  } catch (e) {
    next(e);
  }
});
app.post("/api/v1/partnerships", auth, requireVerified, requireFlag("partnership_requests"), async (req, res, next) => {
  try {
    const organizationName = clean(req.body.organizationName, 160),
      contactEmail = clean(req.body.contactEmail, 254).toLowerCase(),
      objective = clean(req.body.objective, 3000);
    if (
      organizationName.length < 2 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail) ||
      objective.length < 30
    )
      return fail(res, 400, "invalid_partnership");
    const item = await Partnership.create({
      UserId: req.user.id,
      organizationName,
      contactEmail,
      objective,
    });
    await audit(req, "request_partnership", "partnership", item.id);
    res.status(201).json({ id: item.id, status: item.status });
  } catch (e) {
    next(e);
  }
});

// Owner, active team admin, or platform admin.
async function canManageOrg(org, user) {
  if (!org || !user) return false;
  if (org.OwnerId === user.id || hasRole(user, "admin")) return true;
  return !!(await OrganizationMember.findOne({
    where: { OrganizationId: org.id, UserId: user.id, role: "admin", status: "active" },
  }));
}
// Team analytics for managers: real counts from the team's own activity
// (membership changes, posts, event attendance, community spread). Nothing is
// estimated; periods are rolling windows ending now.
app.get("/api/v1/organizations/:id/analytics", auth, async (req, res, next) => {
  try {
    const org = await Organization.findByPk(req.params.id);
    if (!org) return fail(res, 404, "not_found");
    if (!(await canManageOrg(org, req.user))) return fail(res, 403, "forbidden");
    const rows = await OrganizationMember.findAll({
      where: { OrganizationId: org.id },
      attributes: ["UserId", "role", "status", "createdAt", "updatedAt"],
    });
    const active = rows.filter((r) => r.status === "active");
    const ids = [...new Set([org.OwnerId, ...active.map((r) => r.UserId)])];
    const since30 = new Date(Date.now() - 30 * 86400_000);
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setUTCDate(1);
      d.setUTCHours(0, 0, 0, 0);
      d.setUTCMonth(d.getUTCMonth() - i);
      months.push(d);
    }
    const [posts30, comments30, registrations30, checkIns30, memberships] = await Promise.all([
      Post.count({ where: { UserId: { [Op.in]: ids }, status: "published", createdAt: { [Op.gte]: since30 } } }),
      Comment.count({ where: { UserId: { [Op.in]: ids }, createdAt: { [Op.gte]: since30 } } }),
      Registration.count({ where: { UserId: { [Op.in]: ids }, status: "registered", createdAt: { [Op.gte]: since30 } } }),
      Registration.count({ where: { UserId: { [Op.in]: ids }, checkedInAt: { [Op.gte]: since30 } } }),
      Membership.findAll({ where: { UserId: { [Op.in]: ids } }, attributes: ["CommunityId"], raw: true }),
    ]);
    const slugs = new Map(
      (await Community.findAll({ attributes: ["id", "slug"], raw: true })).map((c) => [c.id, c.slug]),
    );
    const byCommunity = {};
    for (const m of memberships) {
      const k = slugs.get(m.CommunityId);
      if (k) byCommunity[k] = (byCommunity[k] || 0) + 1;
    }
    const activePosters = ids.length
      ? (
          await Post.findAll({
            where: { UserId: { [Op.in]: ids }, status: "published", createdAt: { [Op.gte]: since30 } },
            attributes: ["UserId"],
            group: ["UserId"],
            raw: true,
          })
        ).length
      : 0;
    res.json({
      organization: { id: org.id, name: org.name, status: org.status },
      team: {
        size: ids.length, // owner + active members
        admins: active.filter((r) => r.role === "admin").length,
        members: active.filter((r) => r.role === "member").length,
        removed: rows.filter((r) => r.status === "removed").length,
        joinedLast30Days: active.filter((r) => r.createdAt >= since30).length,
        growthByMonth: months.map((start, i) => {
          const end = months[i + 1] || new Date(8.64e15);
          return {
            month: start.toISOString().slice(0, 7),
            joined: rows.filter((r) => r.createdAt >= start && r.createdAt < end).length,
          };
        }),
      },
      engagementLast30Days: {
        posts: posts30,
        comments: comments30,
        activePosters,
        eventRegistrations: registrations30,
        eventCheckIns: checkIns30,
      },
      communities: byCommunity,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/organizations/mine", auth, async (req, res, next) => {
  try {
    // Organizations I own OR belong to (active team member). `myRole` tells
    // the UI what I may do; only managers (owner / team admin) get the full
    // team list.
    const memberships = await OrganizationMember.findAll({
      where: { UserId: req.user.id, status: "active" },
      attributes: ["OrganizationId", "role"],
    });
    const roleByOrg = new Map(memberships.map((m) => [m.OrganizationId, m.role]));
    const orgs = await Organization.findAll({
      where: {
        [Op.or]: [
          { OwnerId: req.user.id },
          ...(roleByOrg.size ? [{ id: { [Op.in]: [...roleByOrg.keys()] } }] : []),
        ],
      },
      include: [
        {
          model: OrganizationMember,
          include: [
            // No email: team owners don't need members' contact details.
            { model: User, attributes: ["id", "name", "username"] },
          ],
        },
      ],
      order: [["createdAt", "ASC"]],
    });
    res.json({
      items: orgs.map((o) => {
        const myRole = o.OwnerId === req.user.id ? "owner" : roleByOrg.get(o.id) || null;
        const json = o.toJSON();
        if (!["owner", "admin"].includes(myRole))
          json.OrganizationMembers = json.OrganizationMembers.filter(
            (m) => m.status === "active",
          ).map((m) => ({ id: m.id, role: m.role, status: m.status, User: m.User }));
        return { ...json, myRole };
      }),
    });
  } catch (e) {
    next(e);
  }
});
app.post("/api/v1/organizations/:id/team", auth, requireVerified, async (req, res, next) => {
  try {
    const org = await Organization.findByPk(req.params.id);
    if (!org) return fail(res, 404, "not_found");
    if (!(await canManageOrg(org, req.user))) return fail(res, 403, "forbidden");
    if (org.status !== "approved")
      return fail(res, 409, "organization_not_approved");
    // Only the owner (or platform admin) may grant the team-admin role.
    if (
      clean(req.body.role, 20) === "admin" &&
      org.OwnerId !== req.user.id &&
      !hasRole(req.user, "admin")
    )
      return fail(res, 403, "owner_required_for_admin_role");
    const member = await User.findOne({
        where: { username: clean(req.body.username, 50) },
      }),
      role = clean(req.body.role, 20);
    if (!member || !["admin", "member"].includes(role))
      return fail(res, 400, "invalid_member");
    const [item] = await OrganizationMember.findOrCreate({
      where: { OrganizationId: org.id, UserId: member.id },
      defaults: { role, status: "active" },
    });
    await item.update({ role, status: "active" });
    await notify(
      member.id,
      "organization_team",
      `You were added to ${org.name}`,
      "/participation",
    );
    await audit(
      req,
      "add_organization_member",
      "organization",
      org.id,
      member.id,
    );
    res.status(201).json({ id: item.id });
  } catch (e) {
    next(e);
  }
});
app.patch(
  "/api/v1/organizations/:id/team/:memberId",
  auth,
  async (req, res, next) => {
    try {
      const org = await Organization.findByPk(req.params.id);
      if (!org) return fail(res, 403, "forbidden");
      const item = await OrganizationMember.findOne({
        where: { id: req.params.memberId, OrganizationId: org.id },
      });
      const self = item && item.UserId === req.user.id;
      // A member may always leave; changing others needs manager rights.
      if (!self && !(await canManageOrg(org, req.user))) return fail(res, 403, "forbidden");
      if (!item) return fail(res, 404, "not_found");
      const isOwner = org.OwnerId === req.user.id || hasRole(req.user, "admin");
      const role = clean(req.body?.role, 20);
      if (role) {
        // Role change (member <-> admin): owner / platform admin only.
        if (!["admin", "member"].includes(role)) return fail(res, 400, "invalid_role");
        if (!isOwner) return fail(res, 403, "owner_required_for_admin_role");
        if (item.status !== "active") return fail(res, 409, "member_not_active");
        await item.update({ role });
        await audit(req, "change_organization_role", "organization", org.id, `${item.UserId}:${role}`);
        return res.json({ ok: true, role });
      }
      // Team admins cannot remove other admins; only the owner can.
      if (!self && item.role === "admin" && !isOwner)
        return fail(res, 403, "owner_required_for_admin_role");
      await item.update({ status: "removed" });
      await audit(
        req,
        self ? "leave_organization" : "remove_organization_member",
        "organization",
        org.id,
        item.UserId,
      );
      if (!self)
        await notify(item.UserId, "organization_team", `You were removed from ${org.name}`, "/participation");
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  },
);

app.get("/api/v1/events/:id/ticket", auth, async (req, res, next) => {
  try {
    const item = await Registration.findOne({
      where: {
        EventId: req.params.id,
        UserId: req.user.id,
        status: "registered",
      },
      include: [Event],
    });
    if (!item) return fail(res, 404, "ticket_not_found");
    if (!item.ticketCode)
      await item.update({
        ticketCode: crypto.randomBytes(10).toString("hex").toUpperCase(),
      });
    res.json({
      ticket: {
        code: item.ticketCode,
        checkedInAt: item.checkedInAt,
        event: item.Event,
      },
    });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/platform-config", async (req, res, next) => {
  try {
    const [flags, entries] = await Promise.all([
      FeatureFlag.findAll({ attributes: ["key", "enabled"] }),
      CmsEntry.findAll({
        where: {
          status: "published",
          locale: ["ar", "en"].includes(req.query.locale)
            ? req.query.locale
            : "en",
        },
        attributes: ["key", "value"],
      }),
    ]);
    res.json({
      flags: Object.fromEntries(flags.map((x) => [x.key, x.enabled])),
      content: Object.fromEntries(entries.map((x) => [x.key, x.value])),
    });
  } catch (e) {
    next(e);
  }
});

app.post("/api/v1/reports", auth, async (req, res, next) => {
  try {
    const reason = clean(req.body.reason, 400),
      PostId = clean(req.body.postId, 60);
    if (reason.length < 8 || !(await Post.findByPk(PostId)))
      return fail(res, 400, "invalid_report");
    const r = await Report.create({ UserId: req.user.id, PostId, reason });
    res.status(201).json({ id: r.id });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/admin/groups", auth, admin, async (req, res, next) => {
  try {
    res.json({
      items: await Group.findAll({
        include: [
          Community,
          {
            model: GroupMembership,
            include: [{ model: User, attributes: ["id", "name", "username"] }],
          },
        ],
        order: [["createdAt", "DESC"]],
      }),
    });
  } catch (e) {
    next(e);
  }
});
app.post("/api/v1/admin/groups", auth, admin, async (req, res, next) => {
  try {
    const community = await Community.findOne({
        where: { slug: clean(req.body.community, 64) },
      }),
      slug = clean(req.body.slug, 80)
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-"),
      type = clean(req.body.type, 20),
      visibility = clean(req.body.visibility, 20),
      nameAr = clean(req.body.nameAr, 140),
      nameEn = clean(req.body.nameEn, 140);
    if (
      !community ||
      slug.length < 3 ||
      !["group", "chapter"].includes(type) ||
      !["public", "private"].includes(visibility) ||
      nameAr.length < 2 ||
      nameEn.length < 2
    )
      return fail(res, 400, "invalid_group");
    const item = await Group.create({
      CommunityId: community.id,
      slug,
      type,
      visibility,
      nameAr,
      nameEn,
      description: clean(req.body.description, 2000),
      status: "published",
    });
    await audit(req, "create_group", "group", item.id);
    res.status(201).json({ id: item.id });
  } catch (e) {
    next(e);
  }
});
app.patch(
  "/api/v1/admin/group-memberships/:id",
  auth,
  admin,
  async (req, res, next) => {
    try {
      const item = await GroupMembership.findByPk(req.params.id);
      if (!item) return fail(res, 404, "not_found");
      if (!["active", "rejected"].includes(req.body.status))
        return fail(res, 400, "invalid_status");
      await item.update({ status: req.body.status });
      await notify(
        item.UserId,
        "group_review",
        `Your group request was ${item.status}`,
        "/participation",
      );
      await audit(
        req,
        "review_group_membership",
        "group_membership",
        item.id,
        item.status,
      );
      res.json({ status: item.status });
    } catch (e) {
      next(e);
    }
  },
);

app.get("/api/v1/admin/curated-rooms", auth, admin, async (req, res, next) => {
  try {
    res.json({
      items: await Room.findAll({
        include: [
          Community,
          {
            model: RoomApplication,
            include: [{ model: User, attributes: ["id", "name", "username"] }],
          },
        ],
        order: [["createdAt", "DESC"]],
      }),
    });
  } catch (e) {
    next(e);
  }
});
app.post("/api/v1/admin/curated-rooms", auth, admin, async (req, res, next) => {
  try {
    const community = await Community.findOne({
        where: { slug: clean(req.body.community, 64) },
      }),
      title = clean(req.body.title, 160),
      capacity = Number(req.body.capacity);
    if (!community || title.length < 3 || capacity < 2 || capacity > 100)
      return fail(res, 400, "invalid_room");
    const item = await Room.create({
      CommunityId: community.id,
      title,
      description: clean(req.body.description, 3000),
      startsAt: req.body.startsAt ? new Date(req.body.startsAt) : null,
      capacity,
      status: "open",
    });
    await audit(req, "create_room", "room", item.id);
    res.status(201).json({ id: item.id });
  } catch (e) {
    next(e);
  }
});
app.patch(
  "/api/v1/admin/room-applications/:id",
  auth,
  admin,
  async (req, res, next) => {
    try {
      const item = await RoomApplication.findByPk(req.params.id, {
        include: Room,
      });
      if (!item) return fail(res, 404, "not_found");
      if (req.body.action === "checkin") {
        if (item.status !== "accepted")
          return fail(res, 409, "application_not_accepted");
        await item.update({ checkedInAt: new Date() });
        await audit(req, "checkin_room", "room_application", item.id);
        return res.json({ checkedInAt: item.checkedInAt });
      }
      if (!["accepted", "rejected"].includes(req.body.status))
        return fail(res, 400, "invalid_status");
      if (
        req.body.status === "accepted" &&
        (await RoomApplication.count({
          where: { RoomId: item.RoomId, status: "accepted" },
        })) >= item.Room.capacity
      )
        return fail(res, 409, "room_full");
      await item.update({ status: req.body.status });
      await notify(
        item.UserId,
        "room_review",
        `Your room application was ${item.status}`,
        "/participation",
      );
      await audit(
        req,
        "review_room_application",
        "room_application",
        item.id,
        item.status,
      );
      res.json({ status: item.status });
    } catch (e) {
      next(e);
    }
  },
);

app.get("/api/v1/admin/partnerships", auth, admin, async (req, res, next) => {
  try {
    res.json({
      items: await Partnership.findAll({
        include: [
          { model: User, attributes: ["id", "name", "username", "email"] },
        ],
        order: [["createdAt", "DESC"]],
      }),
    });
  } catch (e) {
    next(e);
  }
});
app.patch(
  "/api/v1/admin/partnerships/:id",
  auth,
  admin,
  async (req, res, next) => {
    try {
      const item = await Partnership.findByPk(req.params.id);
      if (!item) return fail(res, 404, "not_found");
      const nextStatus = clean(req.body.status, 30),
        allowed = {
          requested: ["reviewing", "declined"],
          reviewing: ["approved", "declined"],
          approved: ["active", "declined"],
          active: ["completed", "renewal_due"],
          renewal_due: ["active", "completed"],
          completed: [],
          declined: [],
        };
      if (!allowed[item.status]?.includes(nextStatus))
        return fail(res, 409, "invalid_transition");
      await item.update({
        status: nextStatus,
        report: clean(req.body.report, 4000) || item.report,
        renewalAt: req.body.renewalAt
          ? new Date(req.body.renewalAt)
          : item.renewalAt,
      });
      await notify(
        item.UserId,
        "partnership_review",
        `Partnership status: ${item.status}`,
        "/participation",
      );
      await audit(
        req,
        "transition_partnership",
        "partnership",
        item.id,
        item.status,
      );
      res.json({ status: item.status });
    } catch (e) {
      next(e);
    }
  },
);

app.get("/api/v1/admin/feature-flags", auth, admin, async (req, res, next) => {
  try {
    res.json({ items: await FeatureFlag.findAll({ order: [["key", "ASC"]] }) });
  } catch (e) {
    next(e);
  }
});
app.put(
  "/api/v1/admin/feature-flags/:key",
  auth,
  admin,
  async (req, res, next) => {
    try {
      if (typeof req.body.enabled !== "boolean")
        return fail(res, 400, "invalid_flag");
      const key = clean(req.params.key, 80);
      const [item] = await FeatureFlag.findOrCreate({
        where: { key },
        defaults: {
          description: clean(req.body.description, 240),
          enabled: req.body.enabled,
        },
      });
      await item.update({
        enabled: req.body.enabled,
        description: clean(req.body.description, 240) || item.description,
      });
      await audit(
        req,
        "update_feature_flag",
        "feature_flag",
        item.id,
        `${key}:${item.enabled}`,
      );
      res.json({ key, enabled: item.enabled });
    } catch (e) {
      next(e);
    }
  },
);
app.get("/api/v1/admin/cms", auth, admin, async (req, res, next) => {
  try {
    res.json({
      items: await CmsEntry.findAll({
        order: [
          ["key", "ASC"],
          ["locale", "ASC"],
        ],
      }),
    });
  } catch (e) {
    next(e);
  }
});
app.put(
  "/api/v1/admin/cms/:key/:locale",
  auth,
  admin,
  async (req, res, next) => {
    try {
      const key = clean(req.params.key, 100),
        locale = clean(req.params.locale, 2),
        value = clean(req.body.value, 10000),
        status = clean(req.body.status, 20);
      if (
        !["ar", "en"].includes(locale) ||
        !["draft", "published"].includes(status) ||
        !key ||
        !value
      )
        return fail(res, 400, "invalid_cms_entry");
      const [item] = await CmsEntry.findOrCreate({
        where: { key, locale },
        defaults: { value, status },
      });
      await item.update({ value, status });
      await audit(
        req,
        "update_cms",
        "cms_entry",
        item.id,
        `${key}:${locale}:${status}`,
      );
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  },
);
// Admin event list: every status, with seat counts and paid-ticket revenue.
app.get("/api/v1/admin/events", auth, admin, async (req, res, next) => {
  try {
    const events = await Event.findAll({
      include: [{ model: Community, attributes: ["slug", "nameEn", "nameAr"] }],
      order: [["startsAt", "DESC"]],
      limit: 200,
    });
    const views = await eventViews(events, null);
    const ids = events.map((e) => e.id);
    const paid = ids.length
      ? await PaymentAttempt.findAll({
          where: { status: { [Op.in]: ["paid", "refunded"] }, RegistrationId: { [Op.ne]: null } },
          include: [{ model: Registration, attributes: ["EventId"], where: { EventId: { [Op.in]: ids } } }],
          attributes: ["amountEgp", "refundedAmountEgp", "status"],
        })
      : [];
    const revenue = new Map();
    for (const p of paid) {
      const k = p.Registration.EventId;
      revenue.set(k, (revenue.get(k) || 0) + p.amountEgp - (p.refundedAmountEgp || 0));
    }
    res.json({
      items: views.map((v) => ({ ...v, netRevenueEgp: revenue.get(v.id) || 0 })),
    });
  } catch (e) {
    next(e);
  }
});
// Edit or cancel an event. Cancelling notifies every registrant; for a paid
// event each ticket is refunded through the payment provider (results are
// returned per ticket so a failed refund is visible, never silent).
app.patch("/api/v1/admin/events/:id", auth, admin, async (req, res, next) => {
  try {
    const e = await Event.findByPk(req.params.id);
    if (!e) return fail(res, 404, "not_found");
    const updates = {};
    if (req.body.title !== undefined) {
      const title = clean(req.body.title, 160);
      if (title.length < 3) return fail(res, 400, "invalid_event");
      updates.title = title;
    }
    if (req.body.description !== undefined) updates.description = clean(req.body.description, 3000);
    if (req.body.venue !== undefined) updates.venue = clean(req.body.venue, 200);
    if (req.body.startsAt !== undefined) {
      const d = new Date(req.body.startsAt);
      if (isNaN(d)) return fail(res, 400, "invalid_event");
      updates.startsAt = d;
    }
    if (req.body.capacity !== undefined) {
      const capacity = Number(req.body.capacity);
      const registered = await Registration.count({ where: { EventId: e.id, status: "registered" } });
      if (!Number.isInteger(capacity) || capacity < Math.max(1, registered) || capacity > 100000)
        return fail(res, 400, "capacity_below_registrations");
      updates.capacity = capacity;
    }
    const status = req.body.status;
    if (status !== undefined && !["published", "cancelled", "draft"].includes(status))
      return fail(res, 400, "invalid_status");
    if (e.status === "cancelled" && status && status !== "cancelled")
      return fail(res, 409, "event_cancelled");
    if (status) updates.status = status;
    await e.update(updates);
    const refunds = [];
    if (status === "cancelled") {
      const regs = await Registration.findAll({
        where: { EventId: e.id, status: { [Op.in]: ["registered", "waitlisted", "pending_payment"] } },
      });
      for (const r of regs) {
        await notify(r.UserId, "event_cancelled", `${e.title} was cancelled`, `/events/${e.id}`);
      }
      if (e.priceType === "paid") {
        const attempts = await PaymentAttempt.findAll({
          where: { RegistrationId: { [Op.in]: regs.map((r) => r.id) }, status: "paid" },
        });
        for (const a of attempts) {
          const out = await routeDeps.issueRefund(a, a.amountEgp - (a.refundedAmountEgp || 0), req);
          refunds.push({ paymentAttemptId: a.id, ok: out.ok, error: out.error || null });
        }
        await PaymentAttempt.update(
          { status: "canceled" },
          { where: { RegistrationId: { [Op.in]: regs.map((r) => r.id) }, status: { [Op.in]: ["created", "pending"] } } },
        );
      }
      // Refunded tickets were already cancelled by issueRefund; release the rest.
      await Registration.update(
        { status: "cancelled" },
        { where: { EventId: e.id, status: { [Op.in]: ["waitlisted", "pending_payment"] } } },
      );
      if (e.priceType !== "paid")
        await Registration.update({ status: "cancelled" }, { where: { EventId: e.id, status: "registered" } });
    }
    await audit(req, status === "cancelled" ? "cancel_event" : "update_event", "event", e.id, JSON.stringify(Object.keys(updates)));
    res.json({ ok: true, status: e.status, refunds });
  } catch (err) {
    next(err);
  }
});
app.post(
  "/api/v1/admin/events/check-in",
  auth,
  admin,
  async (req, res, next) => {
    try {
      const code = clean(req.body.ticketCode, 32).toUpperCase(),
        item = await Registration.findOne({
          where: { ticketCode: code, status: "registered" },
          include: [Event, User],
        });
      if (!item) return fail(res, 404, "ticket_not_found");
      if (item.checkedInAt)
        return res.json({
          ok: true,
          alreadyCheckedIn: true,
          checkedInAt: item.checkedInAt,
        });
      await item.update({ checkedInAt: new Date() });
      await audit(req, "event_checkin", "registration", item.id, item.EventId);
      res.json({
        ok: true,
        checkedInAt: item.checkedInAt,
        event: item.Event?.title,
        member: item.User?.name,
      });
    } catch (e) {
      next(e);
    }
  },
);
app.get("/api/v1/admin/overview", auth, admin, async (req, res, next) => {
  try {
    const [
      members,
      posts,
      events,
      openReports,
      pendingOrganizations,
      openContacts,
      pendingSubscriptions,
      pendingGroupRequests,
      pendingRoomApplications,
      pendingPartnerships,
      pendingPerkApplications,
    ] = await Promise.all([
      User.count(),
      Post.count({ where: { status: "published" } }),
      Event.count({ where: { status: "published" } }),
      Report.count({ where: { status: "open" } }),
      Organization.count({ where: { status: "pending" } }),
      ContactRequest.count({ where: { status: "open" } }),
      Subscription.count({ where: { status: "pending_payment" } }),
      GroupMembership.count({ where: { status: "pending" } }),
      RoomApplication.count({ where: { status: "pending" } }),
      Partnership.count({
        where: { status: { [Op.in]: ["requested", "reviewing"] } },
      }),
      PerkApplication.count({
        where: { status: { [Op.in]: ["submitted", "reviewing", "info_requested"] } },
      }),
    ]);
    res.json({
      members,
      posts,
      events,
      openReports,
      pendingOrganizations,
      openContacts,
      pendingSubscriptions,
      pendingGroupRequests,
      pendingRoomApplications,
      pendingPartnerships,
      pendingPerkApplications,
    });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/admin/perks", auth, admin, async (req, res, next) => {
  try {
    res.json({ items: await Perk.findAll({ order: [["createdAt", "ASC"]] }) });
  } catch (e) {
    next(e);
  }
});
// Perk catalog management: admins control what is offered without a deploy.
// Only operational fields are editable (visibility, availability, featured);
// partner/terms text stays in the seeded catalog source of truth.
app.patch("/api/v1/admin/perks/:id", auth, admin, async (req, res, next) => {
  try {
    const perk = await Perk.findByPk(req.params.id);
    if (!perk) return fail(res, 404, "not_found");
    const patch = {};
    if (req.body.status !== undefined) {
      if (!["draft", "published", "archived"].includes(req.body.status))
        return fail(res, 400, "invalid_status");
      patch.status = req.body.status;
    }
    if (req.body.availability !== undefined) {
      if (!["available", "pilot", "assisted", "targeted", "paused"].includes(req.body.availability))
        return fail(res, 400, "invalid_availability");
      patch.availability = req.body.availability;
    }
    if (req.body.featured !== undefined) {
      if (typeof req.body.featured !== "boolean") return fail(res, 400, "invalid_featured");
      patch.featured = req.body.featured;
    }
    if (!Object.keys(patch).length) return fail(res, 400, "nothing_to_update");
    await perk.update(patch);
    await audit(req, "update_perk", "perk", perk.id, JSON.stringify(patch));
    res.json({ ok: true, perk: { id: perk.id, status: perk.status, availability: perk.availability, featured: perk.featured } });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/admin/perk-applications", auth, admin, async (req, res, next) => {
  try {
    // T-21: oldest first, 50 a page, no silent cap at 200.
    const page = await keysetPage(PerkApplication, {}, req, {
      oldestFirst: true,
      include: [Perk, { model: User, attributes: ["id", "name", "username", "email"] }],
    });
    if (!page) return fail(res, 400, "invalid_cursor");
    res.json(page);
  } catch (e) {
    next(e);
  }
});
app.patch(
  "/api/v1/admin/perk-applications/:id",
  auth,
  admin,
  async (req, res, next) => {
    try {
      const item = await PerkApplication.findByPk(req.params.id, { include: [Perk] });
      if (!item) return fail(res, 404, "not_found");
      const status = clean(req.body.status, 40),
        allowed = {
          submitted: ["reviewing", "info_requested", "rejected"],
          reviewing: ["info_requested", "submitted_to_partner", "approved", "rejected"],
          info_requested: ["reviewing", "rejected"],
          submitted_to_partner: ["approved", "rejected"],
          approved: [],
          rejected: [],
          withdrawn: [],
        };
      if (!allowed[item.status]?.includes(status))
        return fail(res, 409, "invalid_transition");
      await item.update({
        status,
        adminNote: clean(req.body.adminNote, 2500) || item.adminNote,
      });
      await notify(
        item.UserId,
        "perk_review",
        `${item.Perk?.provider || "Perk"} application: ${status}`,
        "/perks",
      );
      await audit(req, "review_perk_application", "perk_application", item.id, status);
      res.json({ status: item.status });
    } catch (e) {
      next(e);
    }
  },
);
app.get("/api/v1/admin/subscriptions", auth, admin, async (req, res, next) => {
  try {
    // T-21: oldest first, 50 a page, no silent cap at 100.
    const page = await keysetPage(Subscription, { status: "pending_payment" }, req, {
      oldestFirst: true,
      include: [{ model: User, attributes: ["id", "name", "email"] }, { model: Plan }],
    });
    if (!page) return fail(res, 400, "invalid_cursor");
    res.json({
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
      items: page.items.map((x) => ({
        id: x.id,
        status: x.status,
        billingCycle: x.billingCycle,
        amountEgp: x.amountEgp,
        createdAt: x.createdAt,
        user: x.User,
        plan: publicPlan(x.Plan),
      })),
    });
  } catch (e) {
    next(e);
  }
});
app.patch(
  "/api/v1/admin/subscriptions/:id/activate",
  auth,
  admin,
  async (req, res, next) => {
    try {
      // Break-glass path. Once the real payment provider is live, only a
      // super_admin may bypass it (the action is audited either way).
      if (paymob.isConfigured() && !hasRole(req.user, "super_admin"))
        return fail(res, 403, "super_admin_required");
      const item = await Subscription.findByPk(req.params.id, {
        include: [Plan],
      });
      if (!item) return fail(res, 404, "not_found");
      if (item.status !== "pending_payment" || req.body.confirmed !== true)
        return fail(res, 409, "payment_confirmation_required");
      // Two-person rule: this only files a request. A different super_admin
      // approves it in /admin/approvals (server/approvals.js).
      await routeDeps.requestApproval(req, res, {
        action: "activate_subscription",
        targetType: "subscription",
        targetId: item.id,
        payload: {
          planCode: item.Plan?.code,
          billingCycle: item.billingCycle,
          amountEgp: item.amountEgp,
          memberId: item.UserId,
        },
      });
    } catch (e) {
      next(e);
    }
  },
);
app.get("/api/v1/admin/contact", auth, admin, async (req, res, next) => {
  try {
    const page = await keysetPage(ContactRequest, { status: "open" }, req);
    if (!page) return fail(res, 400, "invalid_cursor");
    res.json(page);
  } catch (e) {
    next(e);
  }
});
app.patch("/api/v1/admin/contact/:id", auth, admin, async (req, res, next) => {
  try {
    const item = await ContactRequest.findByPk(req.params.id);
    if (!item) return fail(res, 404, "not_found");
    if (req.body.status !== "closed") return fail(res, 400, "invalid_status");
    await item.update({ status: "closed" });
    await audit(req, "close_contact", "contact", item.id);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/admin/reports", auth, moderator, async (req, res, next) => {
  try {
    const page = await keysetPage(Report, { status: "open" }, req);
    if (!page) return fail(res, 400, "invalid_cursor");
    res.json(page);
  } catch (e) {
    next(e);
  }
});
app.patch("/api/v1/admin/reports/:id", auth, moderator, async (req, res, next) => {
  try {
    const r = await Report.findByPk(req.params.id);
    if (!r) return fail(res, 404, "not_found");
    const status = req.body.status;
    if (!["resolved", "dismissed"].includes(status))
      return fail(res, 400, "invalid_status");
    await r.update({ status });
    await audit(req, "review_report", "report", r.id, status);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});
app.get("/api/v1/admin/organizations", auth, admin, async (req, res, next) => {
  try {
    res.json({
      items: await Organization.findAll({ where: { status: "pending" } }),
    });
  } catch (e) {
    next(e);
  }
});
app.patch(
  "/api/v1/admin/organizations/:id",
  auth,
  admin,
  async (req, res, next) => {
    try {
      const o = await Organization.findByPk(req.params.id);
      if (!o) return fail(res, 404, "not_found");
      if (!["approved", "rejected"].includes(req.body.status))
        return fail(res, 400, "invalid_status");
      await o.update({ status: req.body.status });
      await audit(
        req,
        "review_organization",
        "organization",
        o.id,
        req.body.status,
      );
      await notify(
        o.OwnerId,
        "organization_review",
        `Organization ${o.name}: ${o.status}`,
        "/organizations",
      );
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  },
);
app.post("/api/v1/admin/events", auth, admin, async (req, res, next) => {
  try {
    const title = clean(req.body.title, 160),
      startsAt = new Date(req.body.startsAt),
      capacity = Number(req.body.capacity),
      paid = req.body.priceType === "paid",
      priceEgp = paid ? Number(req.body.priceEgp) : 0;
    if (
      title.length < 3 ||
      isNaN(startsAt) ||
      !Number.isInteger(capacity) ||
      capacity < 1 ||
      capacity > 100000 ||
      !["free", "paid", undefined].includes(req.body.priceType) ||
      (paid && (!Number.isInteger(priceEgp) || priceEgp < 1 || priceEgp > 100000))
    )
      return fail(res, 400, "invalid_event");
    const c = await Community.findOne({ where: { slug: req.body.community } });
    if (!c) return fail(res, 400, "invalid_community");
    const e = await Event.create({
      title,
      startsAt,
      capacity,
      description: clean(req.body.description, 3000),
      venue: clean(req.body.venue, 200),
      CommunityId: c.id,
      OrganizerId: req.user.id,
      status: "published",
      priceType: paid ? "paid" : "free",
      priceEgp,
    });
    await audit(req, "create_event", "event", e.id, paid ? `paid:${priceEgp}` : "free");
    res.status(201).json({ id: e.id });
  } catch (e) {
    next(e);
  }
});
app.post("/api/v1/admin/offers", auth, admin, async (req, res, next) => {
  try {
    const title = clean(req.body.title, 160),
      quantity = Number(req.body.quantity);
    if (title.length < 3 || quantity < 1 || quantity > 100000)
      return fail(res, 400, "invalid_offer");
    const o = await Offer.create({
      title,
      quantity,
      description: clean(req.body.description, 2000),
      terms: clean(req.body.terms, 1000),
      code: clean(req.body.code, 100),
      status: "published",
    });
    await audit(req, "create_offer", "offer", o.id);
    res.status(201).json({ id: o.id });
  } catch (e) {
    next(e);
  }
});
// ---- Register modular route groups (identity, payments, media, account) --
// These are defined in separate modules for readability but share the same
// middleware/helpers so behavior and the error envelope stay identical.
const routeDeps = {
  express,
  app,
  sequelize,
  Op,
  // models
  User,
  Session,
  VerificationToken,
  OutboxMessage,
  WebhookEvent,
  Plan,
  Subscription,
  PaymentAttempt,
  Notification,
  AuditLog,
  Registration,
  Event,
  MediaAsset,
  Coupon,
  CouponRedemption,
  ApprovalRequest,
  hasRole,
  // middleware + helpers
  auth,
  admin,
  moderator,
  superAdmin,
  requireVerified,
  fail,
  clean,
  audit,
  notify,
  authLimit,
  paidAccess,
  publicUser,
  publicPlan,
  bcrypt,
  tokenHash,
  contains,
};
registerIdentityRoutes(app, routeDeps);
registerMfaRoutes(app, routeDeps);
registerGoogleRoutes(app, routeDeps);
registerCouponRoutes(app, routeDeps);
registerAnalyticsRoutes(app, routeDeps);
registerRealtimeRoutes(app, routeDeps);
registerPaymentRoutes(app, routeDeps);
registerApprovalRoutes(app, routeDeps);
registerMediaRoutes(app, routeDeps);
registerAccountRoutes(app, routeDeps);

app.use("/api", (req, res) => fail(res, 404, "not_found"));
const dist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist",
);
app.use(
  express.static(dist, {
    index: false,
    setHeaders(res, filePath) {
      // Vite fingerprints everything under /assets, so it can be cached
      // forever; HTML must always revalidate so a deploy takes effect at once.
      if (filePath.includes(`${path.sep}assets${path.sep}`))
        res.set("Cache-Control", "public, max-age=31536000, immutable");
      else if (filePath.endsWith(".html")) res.set("Cache-Control", "no-cache");
      else res.set("Cache-Control", "public, max-age=3600");
    },
  }),
);
app.get("/{*path}", (req, res) => {
  res.set("Cache-Control", "no-cache");
  res.sendFile(path.join(dist, "index.html"));
});
app.use((err, req, res, next) => {
  // Body-parser errors carry raw parser text ("Unexpected token 'n' in JSON…")
  // that must not reach clients; map them to stable machine-readable codes.
  if (err.type === "entity.parse.failed")
    return res.status(400).json({ error: "invalid_json" });
  if (err.type === "entity.too.large")
    return res.status(413).json({ error: "payload_too_large" });
  // Safety net: Sequelize throws when a `where` value is `undefined` (an absent
  // JSON field passed straight through) or when a value fails model validation.
  // Both are client input errors, never a server fault.
  // Postgres class 22 = data exception (22P02 invalid text/uuid syntax, 22001
  // value too long, 22003 out of range): bad client input arriving via a body
  // or query value rather than a path param.
  if (err.name === "SequelizeDatabaseError" && /^22/.test(String(err.parent?.code || "")))
    return res.status(400).json({ error: "invalid_request" });
  if (
    err.name === "SequelizeValidationError" ||
    err.name === "SequelizeUniqueConstraintError" ||
    (err.name === "Error" && /WHERE parameter .* has invalid "undefined" value/.test(err.message || ""))
  ) {
    return res.status(err.name === "SequelizeUniqueConstraintError" ? 409 : 400).json({
      error: err.name === "SequelizeUniqueConstraintError" ? "already_exists" : "invalid_request",
    });
  }
  if (!err.status) logger.error("api.unhandled_error", { path: req.path, error: String(err && err.stack ? err.stack : err) });
  res
    .status(err.status || 500)
    .json({ error: err.status ? err.message : "internal_error" });
});
async function boot() {
  const portArgument = process.argv.indexOf("--port");
  const port = Number(
    portArgument >= 0 ? process.argv[portArgument + 1] : config.port,
  );

  if (config.isProduction) {
    // Fail fast / warn loudly on misconfiguration.
    const check = assertProductionConfig();
    (check.warnings || []).forEach((w) => logger.warn("config.warning", { w }));
    if (!check.ok) {
      (check.errors || []).forEach((e) =>
        logger.error("config.error", { e }),
      );
      throw new Error("invalid_production_config");
    }
    // Production: schema owned by migrations (never sync); then seed + connect.
    // deploy.sh already runs `migrate up` (after a backup) BEFORE switching
    // releases, so on a single node this is a no-op safety net. When running
    // several instances set MIGRATE_ON_BOOT=false so only the deploy step
    // migrates and concurrent boots cannot race each other.
    if (process.env.MIGRATE_ON_BOOT !== "false") await migrateUp();
    await initDb({ bootstrap: false, seed: true });
  } else {
    // Dev: sync disposable schema + seed.
    await initDb();
  }

  registerScheduled("payment_maintenance", 15 * 60_000, () =>
    runPaymentMaintenance(routeDeps),
  );
  registerScheduled("notification_digests", 60 * 60_000, () =>
    runNotificationDigests({ User, Notification, NotificationPreference }),
  );
  registerScheduled("housekeeping", 24 * 3600_000, () =>
    runHousekeeping({
      Session,
      VerificationToken,
      OutboxMessage,
      WebhookEvent,
      Notification,
      MediaAsset,
      User,
      models: sequelize.models,
    }),
  );
  startWorker();

  const server = app.listen(port, "0.0.0.0", () =>
    logger.info("server.listening", { port, env: config.env }),
  );

  // Graceful shutdown (systemd stop/restart, deploys): stop taking new
  // connections, stop the background worker, let in-flight requests finish,
  // then close the DB pool. A hard timeout guarantees we never hang a deploy.
  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info("server.shutdown_start", { signal });
    stopWorker();
    closeAllStreams(); // SSE connections never go idle on their own
    const force = setTimeout(() => {
      logger.error("server.shutdown_forced", {});
      process.exit(1);
    }, 25_000);
    force.unref();
    server.close(async () => {
      try {
        await sequelize.close();
      } catch (err) {
        logger.error("server.shutdown_db_close_failed", { error: String(err) });
      }
      logger.info("server.shutdown_complete", {});
      process.exit(0);
    });
    server.closeIdleConnections?.();
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// Last-resort visibility: an exception that escapes every handler must be
// logged as structured JSON (so a CloudWatch alarm can fire) before exiting
// so systemd restarts a clean process rather than leaving a corrupt one.
if (process.env.NODE_ENV !== "test") {
  process.on("unhandledRejection", (reason) => {
    logger.error("process.unhandled_rejection", { error: String(reason && reason.stack ? reason.stack : reason) });
  });
  process.on("uncaughtException", (err) => {
    logger.error("process.uncaught_exception", { error: String(err && err.stack ? err.stack : err) });
    process.exit(1);
  });
}

if (process.env.NODE_ENV !== "test") {
  boot().catch((err) => {
    logger.error("server.boot_failed", { error: String(err && err.stack ? err.stack : err) });
    process.exitCode = 1;
  });
}
export default app;
