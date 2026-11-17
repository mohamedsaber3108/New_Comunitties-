import { Sequelize, DataTypes } from "sequelize";
import fs from "node:fs";
import { perksCatalog } from "../src/perks-data.js";

// -------------------------------------------------------------------------
// Multi-dialect connection factory
// -------------------------------------------------------------------------
// Supported dialects (via DB_DIALECT):
//   - "sqlite"   : local development + automated tests (default)
//   - "mysql"    : legacy production target (retained for compatibility)
//   - "postgres" : production target (AWS RDS PostgreSQL)
//
// A full DATABASE_URL is honored first when present (preferred on RDS/Heroku-
// style platforms); otherwise discrete DB_* variables are used. SQLite stays
// the default so dev and CI never touch a networked database.
// -------------------------------------------------------------------------
export const DB_DIALECT = (process.env.DB_DIALECT || "sqlite").toLowerCase();
export const isMysql = DB_DIALECT === "mysql";
export const isPostgres = DB_DIALECT === "postgres" || DB_DIALECT === "postgresql";
export const isSqlite = !isMysql && !isPostgres;

function buildSslOption() {
  // Explicit CA bundle (e.g. the RDS global bundle) enables strict verification.
  if (process.env.DB_SSL_CA) {
    return {
      ssl: {
        ca: fs.readFileSync(process.env.DB_SSL_CA, "utf8"),
        rejectUnauthorized: true,
      },
    };
  }
  // DB_SSL=true without a CA enables TLS (managed RDS endpoints speak TLS);
  // rejectUnauthorized is relaxed only because managed CAs are not always on
  // the box. Provide DB_SSL_CA in production for full verification.
  if (process.env.DB_SSL === "true") {
    return { ssl: { require: true, rejectUnauthorized: false } };
  }
  return {};
}

const poolConfig = {
  max: Number(process.env.DB_POOL_MAX || 10),
  min: Number(process.env.DB_POOL_MIN || 0),
  acquire: Number(process.env.DB_POOL_ACQUIRE || 30000),
  idle: Number(process.env.DB_POOL_IDLE || 10000),
};

function createSequelize() {
  const logging =
    process.env.DB_LOGGING === "true" ? (msg) => console.log(msg) : false;

  if (isSqlite) {
    return new Sequelize({
      dialect: "sqlite",
      storage: process.env.SQLITE_PATH || "./data/usam.sqlite",
      logging,
      pool: poolConfig,
    });
  }

  const dialect = isPostgres ? "postgres" : "mysql";
  const common = {
    dialect,
    logging,
    pool: poolConfig,
    define: isPostgres
      ? {}
      : { charset: "utf8mb4", collate: "utf8mb4_unicode_ci" },
    dialectOptions: isPostgres
      ? { ...buildSslOption() }
      : { charset: "utf8mb4", ...buildSslOption() },
  };

  if (process.env.DATABASE_URL) {
    return new Sequelize(process.env.DATABASE_URL, common);
  }

  return new Sequelize(
    process.env.DB_NAME || "usam_hub",
    process.env.DB_USER || "usam",
    process.env.DB_PASSWORD || "",
    {
      host: process.env.DB_HOST || "127.0.0.1",
      port: Number(process.env.DB_PORT || (isPostgres ? 5432 : 3306)),
      ...common,
    },
  );
}

export const sequelize = createSequelize();

const common = {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
};
export const User = sequelize.define("User", {
  ...common,
  name: { type: DataTypes.STRING(100), allowNull: false },
  username: { type: DataTypes.STRING(50), allowNull: false, unique: true },
  email: { type: DataTypes.STRING(254), allowNull: false, unique: true },
  passwordHash: { type: DataTypes.STRING, allowNull: false },
  role: {
    type: DataTypes.ENUM("member", "moderator", "admin", "super_admin"),
    defaultValue: "member",
  },
  persona: {
    type: DataTypes.ENUM(
      "launchpad",
      "freelancespace",
      "hrconnect",
      "studentzone",
    ),
    defaultValue: "launchpad",
  },
  bio: { type: DataTypes.STRING(400), defaultValue: "" },
  location: { type: DataTypes.STRING(100), defaultValue: "" },
  skills: { type: DataTypes.TEXT, defaultValue: "[]" },
  avatarUrl: { type: DataTypes.STRING(500), defaultValue: "" },
  discoverable: { type: DataTypes.BOOLEAN, defaultValue: false },
  messagesEnabled: { type: DataTypes.BOOLEAN, defaultValue: false },
  language: { type: DataTypes.ENUM("ar", "en"), defaultValue: "ar" },
  // --- Identity / email verification -----------------------------------
  emailVerified: { type: DataTypes.BOOLEAN, defaultValue: false },
  emailVerifiedAt: { type: DataTypes.DATE },
  // --- Account lifecycle / soft delete ---------------------------------
  status: {
    type: DataTypes.ENUM("active", "suspended", "deleted"),
    defaultValue: "active",
  },
  isDeleted: { type: DataTypes.BOOLEAN, defaultValue: false },
  deletedAt: { type: DataTypes.DATE },
  suspendedAt: { type: DataTypes.DATE },
  suspensionReason: { type: DataTypes.STRING(400), defaultValue: "" },
  // --- Security tracking -----------------------------------------------
  lastLoginAt: { type: DataTypes.DATE },
  failedLoginCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  lockedUntil: { type: DataTypes.DATE },
  passwordChangedAt: { type: DataTypes.DATE },
  // --- Two-factor auth (TOTP) -------------------------------------------
  // mfaSecretEnc: AES-GCM ciphertext of the base32 secret (pending until
  // mfaEnabledAt is set). mfaRecoveryHashes: JSON array of SHA-256 hashes of
  // unused single-use recovery codes. mfaLastStep: last accepted TOTP time
  // step (blocks code replay).
  mfaSecretEnc: { type: DataTypes.TEXT },
  mfaEnabledAt: { type: DataTypes.DATE },
  mfaRecoveryHashes: { type: DataTypes.TEXT },
  mfaLastStep: { type: DataTypes.BIGINT },
  // --- Future SSO (nullable now; no behavior change) -------------------
  googleId: { type: DataTypes.STRING(64) },
  authProvider: {
    type: DataTypes.ENUM("password", "google"),
    defaultValue: "password",
  },
});
export const Session = sequelize.define("Session", {
  ...common,
  tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  // Device/session metadata for the "sessions & devices" management UI.
  ip: { type: DataTypes.STRING(64), defaultValue: "" },
  userAgent: { type: DataTypes.STRING(400), defaultValue: "" },
  lastSeenAt: { type: DataTypes.DATE },
  revokedAt: { type: DataTypes.DATE },
});
// -------------------------------------------------------------------------
// Identity tokens: email verification + password reset.
// Only SHA-256 hashes of tokens are stored; raw tokens live only in the
// email link. Single-use (consumedAt) with expiry.
// -------------------------------------------------------------------------
export const VerificationToken = sequelize.define("VerificationToken", {
  ...common,
  purpose: {
    type: DataTypes.ENUM("email_verify", "password_reset"),
    allowNull: false,
  },
  tokenHash: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  expiresAt: { type: DataTypes.DATE, allowNull: false },
  consumedAt: { type: DataTypes.DATE },
});
// -------------------------------------------------------------------------
// Outbox: durable record of asynchronous work (emails, webhooks, jobs).
// A background worker claims rows, processes them, and records attempts so
// delivery can be retried with backoff and inspected. No work is silently
// "fire and forget".
// -------------------------------------------------------------------------
export const OutboxMessage = sequelize.define(
  "OutboxMessage",
  {
    ...common,
    kind: { type: DataTypes.STRING(60), allowNull: false },
    payload: { type: DataTypes.TEXT, defaultValue: "{}" },
    status: {
      type: DataTypes.ENUM("pending", "processing", "sent", "failed", "dead"),
      defaultValue: "pending",
    },
    attempts: { type: DataTypes.INTEGER, defaultValue: 0 },
    maxAttempts: { type: DataTypes.INTEGER, defaultValue: 6 },
    nextAttemptAt: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    lastError: { type: DataTypes.TEXT, defaultValue: "" },
    lockedAt: { type: DataTypes.DATE },
  },
  {
    indexes: [
      { fields: ["status", "nextAttemptAt"] },
      { fields: ["kind"] },
    ],
  },
);
export const Community = sequelize.define("Community", {
  ...common,
  slug: { type: DataTypes.STRING(64), allowNull: false, unique: true },
  nameAr: DataTypes.STRING,
  nameEn: DataTypes.STRING,
  descriptionAr: DataTypes.TEXT,
  descriptionEn: DataTypes.TEXT,
  accent: DataTypes.STRING(16),
  isOfficial: { type: DataTypes.BOOLEAN, defaultValue: true },
});
export const Membership = sequelize.define(
  "Membership",
  { ...common },
  { indexes: [{ unique: true, fields: ["UserId", "CommunityId"] }] },
);
export const Post = sequelize.define("Post", {
  ...common,
  body: { type: DataTypes.TEXT, allowNull: false },
  status: {
    type: DataTypes.ENUM("published", "hidden"),
    defaultValue: "published",
  },
});
export const Comment = sequelize.define("Comment", {
  ...common,
  body: { type: DataTypes.TEXT, allowNull: false },
});
export const Reaction = sequelize.define(
  "Reaction",
  { ...common },
  { indexes: [{ unique: true, fields: ["UserId", "PostId"] }] },
);
export const Bookmark = sequelize.define(
  "Bookmark",
  { ...common },
  { indexes: [{ unique: true, fields: ["UserId", "PostId"] }] },
);
export const Event = sequelize.define("Event", {
  ...common,
  title: { type: DataTypes.STRING(160), allowNull: false },
  description: DataTypes.TEXT,
  startsAt: { type: DataTypes.DATE, allowNull: false },
  endsAt: DataTypes.DATE,
  timezone: { type: DataTypes.STRING(60), defaultValue: "Africa/Cairo" },
  venue: DataTypes.STRING(200),
  capacity: { type: DataTypes.INTEGER, allowNull: false },
  status: {
    type: DataTypes.ENUM("draft", "published", "cancelled"),
    defaultValue: "draft",
  },
  priceType: { type: DataTypes.ENUM("free", "paid"), defaultValue: "free" },
});
export const Registration = sequelize.define(
  "Registration",
  {
    ...common,
    status: {
      type: DataTypes.ENUM("registered", "waitlisted", "cancelled"),
      defaultValue: "registered",
    },
    ticketCode: { type: DataTypes.STRING(32), unique: true },
    checkedInAt: DataTypes.DATE,
  },
  { indexes: [{ unique: true, fields: ["UserId", "EventId"] }] },
);
export const Offer = sequelize.define("Offer", {
  ...common,
  title: DataTypes.STRING(160),
  description: DataTypes.TEXT,
  terms: DataTypes.TEXT,
  code: DataTypes.STRING(100),
  quantity: { type: DataTypes.INTEGER, defaultValue: 0 },
  claimedCount: { type: DataTypes.INTEGER, defaultValue: 0 },
  expiresAt: DataTypes.DATE,
  status: { type: DataTypes.ENUM("draft", "published"), defaultValue: "draft" },
});
export const Claim = sequelize.define(
  "Claim",
  { ...common, claimCode: { type: DataTypes.STRING(30), unique: true } },
  { indexes: [{ unique: true, fields: ["UserId", "OfferId"] }] },
);
export const Organization = sequelize.define("Organization", {
  ...common,
  name: DataTypes.STRING(160),
  description: DataTypes.TEXT,
  sector: DataTypes.STRING(100),
  status: {
    type: DataTypes.ENUM("pending", "approved", "rejected"),
    defaultValue: "pending",
  },
});
export const Mentor = sequelize.define("Mentor", {
  ...common,
  expertise: DataTypes.STRING(160),
  availability: DataTypes.STRING(160),
  published: { type: DataTypes.BOOLEAN, defaultValue: false },
});
export const MentorRequest = sequelize.define("MentorRequest", {
  ...common,
  message: DataTypes.TEXT,
  status: {
    type: DataTypes.ENUM("pending", "accepted", "declined"),
    defaultValue: "pending",
  },
});
export const Conversation = sequelize.define("Conversation", {
  ...common,
  pairKey: { type: DataTypes.STRING(75), allowNull: false, unique: true },
});
export const Message = sequelize.define("Message", {
  ...common,
  body: { type: DataTypes.TEXT, allowNull: false },
  readAt: DataTypes.DATE,
});
export const Follow = sequelize.define(
  "Follow",
  { ...common },
  { indexes: [{ unique: true, fields: ["FollowerId", "FollowingId"] }] },
);
export const Block = sequelize.define(
  "Block",
  { ...common },
  { indexes: [{ unique: true, fields: ["UserId", "BlockedUserId"] }] },
);
export const Challenge = sequelize.define("Challenge", {
  ...common,
  title: { type: DataTypes.STRING(160), allowNull: false },
  description: DataTypes.TEXT,
  deadline: { type: DataTypes.DATE, allowNull: false },
  status: {
    type: DataTypes.ENUM("draft", "published", "closed"),
    defaultValue: "draft",
  },
});
export const Submission = sequelize.define(
  "Submission",
  {
    ...common,
    body: { type: DataTypes.TEXT, allowNull: false },
    status: {
      type: DataTypes.ENUM("submitted", "reviewed"),
      defaultValue: "submitted",
    },
    feedback: DataTypes.TEXT,
  },
  { indexes: [{ unique: true, fields: ["ChallengeId", "UserId"] }] },
);
export const Notification = sequelize.define("Notification", {
  ...common,
  kind: DataTypes.STRING(60),
  text: DataTypes.STRING(240),
  href: DataTypes.STRING(200),
  readAt: DataTypes.DATE,
});
export const Report = sequelize.define("Report", {
  ...common,
  PostId: { type: DataTypes.UUID, allowNull: false },
  reason: DataTypes.STRING(400),
  status: {
    type: DataTypes.ENUM("open", "resolved", "dismissed"),
    defaultValue: "open",
  },
});
export const AuditLog = sequelize.define("AuditLog", {
  ...common,
  action: DataTypes.STRING(80),
  subjectType: DataTypes.STRING(80),
  subjectId: DataTypes.STRING(80),
  details: DataTypes.TEXT,
});
export const ContactRequest = sequelize.define("ContactRequest", {
  ...common,
  name: { type: DataTypes.STRING(100), allowNull: false },
  email: { type: DataTypes.STRING(254), allowNull: false },
  topic: {
    type: DataTypes.ENUM("general", "partnership", "support", "privacy"),
    allowNull: false,
  },
  message: { type: DataTypes.TEXT, allowNull: false },
  status: { type: DataTypes.ENUM("open", "closed"), defaultValue: "open" },
});
export const Plan = sequelize.define("Plan", {
  ...common,
  code: { type: DataTypes.STRING(32), allowNull: false, unique: true },
  nameAr: { type: DataTypes.STRING(80), allowNull: false },
  nameEn: { type: DataTypes.STRING(80), allowNull: false },
  audience: {
    type: DataTypes.ENUM("individual", "organization"),
    defaultValue: "individual",
  },
  monthlyEgp: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  yearlyEgp: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  descriptionAr: DataTypes.TEXT,
  descriptionEn: DataTypes.TEXT,
  featuresAr: { type: DataTypes.TEXT, defaultValue: "[]" },
  featuresEn: { type: DataTypes.TEXT, defaultValue: "[]" },
  featured: { type: DataTypes.BOOLEAN, defaultValue: false },
  active: { type: DataTypes.BOOLEAN, defaultValue: true },
});
export const Subscription = sequelize.define("Subscription", {
  ...common,
  billingCycle: { type: DataTypes.ENUM("monthly", "yearly"), allowNull: false },
  status: {
    type: DataTypes.ENUM(
      "free",
      "pending_payment",
      "active",
      "past_due",
      "canceled",
      "expired",
    ),
    allowNull: false,
  },
  amountEgp: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  provider: { type: DataTypes.STRING(40), defaultValue: "manual" },
  providerReference: DataTypes.STRING(160),
  startsAt: DataTypes.DATE,
  endsAt: DataTypes.DATE,
  canceledAt: DataTypes.DATE,
  // Set when the pre-expiry reminder email was queued (sent once per term).
  renewalReminderSentAt: DataTypes.DATE,
});
export const PaymentAttempt = sequelize.define("PaymentAttempt", {
  ...common,
  idempotencyKey: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
  },
  amountEgp: { type: DataTypes.INTEGER, allowNull: false },
  currency: { type: DataTypes.STRING(3), defaultValue: "EGP" },
  status: {
    type: DataTypes.ENUM(
      "created",
      "pending",
      "paid",
      "failed",
      "refunded",
      "canceled",
    ),
    defaultValue: "created",
  },
  provider: { type: DataTypes.STRING(40), defaultValue: "paymob" },
  providerReference: { type: DataTypes.STRING(160), unique: true },
  failureCode: DataTypes.STRING(100),
  // --- Paymob transaction linkage + refund tracking --------------------
  providerOrderId: { type: DataTypes.STRING(64) },
  providerTransactionId: { type: DataTypes.STRING(64) },
  merchantOrderId: { type: DataTypes.STRING(100), unique: true },
  refundedAmountEgp: { type: DataTypes.INTEGER, defaultValue: 0 },
  refundedAt: { type: DataTypes.DATE },
  // JSON array of provider refund transaction ids already applied, so a
  // refund webhook for a refund WE issued is not double-counted.
  refundTransactionIds: { type: DataTypes.TEXT, defaultValue: "[]" },
  rawResult: { type: DataTypes.TEXT, defaultValue: "" },
});
// -------------------------------------------------------------------------
// WebhookEvent: idempotent ledger of inbound provider callbacks. A unique
// (provider, eventId) guarantees a replayed webhook is processed once.
// -------------------------------------------------------------------------
export const WebhookEvent = sequelize.define(
  "WebhookEvent",
  {
    ...common,
    provider: { type: DataTypes.STRING(40), allowNull: false },
    eventId: { type: DataTypes.STRING(120), allowNull: false },
    type: { type: DataTypes.STRING(60), defaultValue: "" },
    status: {
      type: DataTypes.ENUM("received", "processed", "ignored", "error"),
      defaultValue: "received",
    },
    payload: { type: DataTypes.TEXT, defaultValue: "{}" },
    error: { type: DataTypes.TEXT, defaultValue: "" },
  },
  { indexes: [{ unique: true, fields: ["provider", "eventId"] }] },
);
export const Group = sequelize.define("Group", {
  ...common,
  slug: { type: DataTypes.STRING(80), allowNull: false, unique: true },
  type: { type: DataTypes.ENUM("group", "chapter"), defaultValue: "group" },
  nameAr: { type: DataTypes.STRING(140), allowNull: false },
  nameEn: { type: DataTypes.STRING(140), allowNull: false },
  description: { type: DataTypes.TEXT, defaultValue: "" },
  visibility: {
    type: DataTypes.ENUM("public", "private"),
    defaultValue: "public",
  },
  status: {
    type: DataTypes.ENUM("draft", "published", "archived"),
    defaultValue: "draft",
  },
});
export const GroupMembership = sequelize.define(
  "GroupMembership",
  {
    ...common,
    status: {
      type: DataTypes.ENUM("pending", "active", "rejected", "left"),
      defaultValue: "pending",
    },
    role: {
      type: DataTypes.ENUM("member", "manager", "moderator"),
      defaultValue: "member",
    },
  },
  { indexes: [{ unique: true, fields: ["GroupId", "UserId"] }] },
);
export const Room = sequelize.define("Room", {
  ...common,
  title: { type: DataTypes.STRING(160), allowNull: false },
  description: { type: DataTypes.TEXT, defaultValue: "" },
  startsAt: DataTypes.DATE,
  timezone: { type: DataTypes.STRING(60), defaultValue: "Africa/Cairo" },
  capacity: { type: DataTypes.INTEGER, defaultValue: 12 },
  status: {
    type: DataTypes.ENUM("draft", "open", "closed", "completed"),
    defaultValue: "draft",
  },
});
export const RoomApplication = sequelize.define(
  "RoomApplication",
  {
    ...common,
    motivation: { type: DataTypes.TEXT, allowNull: false },
    status: {
      type: DataTypes.ENUM("pending", "accepted", "rejected", "cancelled"),
      defaultValue: "pending",
    },
    checkedInAt: DataTypes.DATE,
    feedback: DataTypes.TEXT,
    rating: { type: DataTypes.INTEGER, validate: { min: 1, max: 5 } },
  },
  { indexes: [{ unique: true, fields: ["RoomId", "UserId"] }] },
);
export const SavedSearch = sequelize.define("SavedSearch", {
  ...common,
  label: { type: DataTypes.STRING(100), allowNull: false },
  query: { type: DataTypes.STRING(80), allowNull: false },
  filters: { type: DataTypes.TEXT, defaultValue: "{}" },
});
export const NotificationPreference = sequelize.define(
  "NotificationPreference",
  {
    ...common,
    inApp: { type: DataTypes.BOOLEAN, defaultValue: true },
    email: { type: DataTypes.BOOLEAN, defaultValue: false },
    digest: {
      type: DataTypes.ENUM("off", "daily", "weekly"),
      defaultValue: "weekly",
    },
    kinds: { type: DataTypes.TEXT, defaultValue: "[]" },
    lastDigestAt: { type: DataTypes.DATE },
  },
);
export const Partnership = sequelize.define("Partnership", {
  ...common,
  organizationName: { type: DataTypes.STRING(160), allowNull: false },
  contactEmail: { type: DataTypes.STRING(254), allowNull: false },
  objective: { type: DataTypes.TEXT, allowNull: false },
  status: {
    type: DataTypes.ENUM(
      "requested",
      "reviewing",
      "approved",
      "active",
      "declined",
      "completed",
      "renewal_due",
    ),
    defaultValue: "requested",
  },
  report: DataTypes.TEXT,
  renewalAt: DataTypes.DATE,
});
export const OrganizationMember = sequelize.define(
  "OrganizationMember",
  {
    ...common,
    role: {
      type: DataTypes.ENUM("owner", "admin", "member"),
      defaultValue: "member",
    },
    status: {
      type: DataTypes.ENUM("active", "removed"),
      defaultValue: "active",
    },
  },
  { indexes: [{ unique: true, fields: ["OrganizationId", "UserId"] }] },
);
export const FeatureFlag = sequelize.define("FeatureFlag", {
  ...common,
  key: { type: DataTypes.STRING(80), allowNull: false, unique: true },
  description: { type: DataTypes.STRING(240), defaultValue: "" },
  enabled: { type: DataTypes.BOOLEAN, defaultValue: false },
});
export const CmsEntry = sequelize.define(
  "CmsEntry",
  {
    ...common,
    key: { type: DataTypes.STRING(100), allowNull: false },
    locale: { type: DataTypes.ENUM("ar", "en"), allowNull: false },
    value: { type: DataTypes.TEXT, allowNull: false },
    status: {
      type: DataTypes.ENUM("draft", "published"),
      defaultValue: "draft",
    },
  },
  { indexes: [{ unique: true, fields: ["key", "locale"] }] },
);
export const Perk = sequelize.define("Perk", {
  ...common,
  slug: { type: DataTypes.STRING(100), allowNull: false, unique: true },
  provider: { type: DataTypes.STRING(120), allowNull: false },
  providerGroup: {
    type: DataTypes.ENUM("usam", "ecosystem"),
    allowNull: false,
  },
  product: { type: DataTypes.STRING(160), allowNull: false },
  category: { type: DataTypes.STRING(60), allowNull: false },
  titleAr: { type: DataTypes.STRING(200), allowNull: false },
  titleEn: { type: DataTypes.STRING(200), allowNull: false },
  summaryAr: { type: DataTypes.TEXT, allowNull: false },
  summaryEn: { type: DataTypes.TEXT, allowNull: false },
  termsAr: { type: DataTypes.TEXT, defaultValue: "" },
  termsEn: { type: DataTypes.TEXT, defaultValue: "" },
  valueMinUsd: { type: DataTypes.INTEGER, defaultValue: 0 },
  valueMaxUsd: { type: DataTypes.INTEGER, defaultValue: 0 },
  availability: {
    type: DataTypes.ENUM(
      "available",
      "pilot",
      "assisted",
      "targeted",
      "paused",
    ),
    defaultValue: "available",
  },
  featured: { type: DataTypes.BOOLEAN, defaultValue: false },
  status: {
    type: DataTypes.ENUM("draft", "published", "archived"),
    defaultValue: "published",
  },
  requiresPaid: { type: DataTypes.BOOLEAN, defaultValue: true },
});
export const PerkApplication = sequelize.define(
  "PerkApplication",
  {
    ...common,
    startupName: { type: DataTypes.STRING(160), allowNull: false },
    website: { type: DataTypes.STRING(300), defaultValue: "" },
    stage: { type: DataTypes.STRING(60), allowNull: false },
    useCase: { type: DataTypes.TEXT, allowNull: false },
    status: {
      type: DataTypes.ENUM(
        "submitted",
        "reviewing",
        "info_requested",
        "submitted_to_partner",
        "approved",
        "rejected",
        "withdrawn",
      ),
      defaultValue: "submitted",
    },
    adminNote: { type: DataTypes.TEXT, defaultValue: "" },
  },
  { indexes: [{ unique: true, fields: ["PerkId", "UserId"] }] },
);

User.hasMany(Session);
Session.belongsTo(User);
User.hasMany(VerificationToken);
VerificationToken.belongsTo(User);
User.belongsToMany(Community, { through: Membership });
Community.belongsToMany(User, { through: Membership });
User.hasMany(Post);
Post.belongsTo(User);
Community.hasMany(Post);
Post.belongsTo(Community);
Post.hasMany(Comment);
Comment.belongsTo(Post);
Comment.belongsTo(User);
Post.hasMany(Reaction);
Reaction.belongsTo(Post);
Reaction.belongsTo(User);
Post.hasMany(Bookmark);
Bookmark.belongsTo(Post);
Bookmark.belongsTo(User);
Community.hasMany(Event);
Event.belongsTo(Community);
Event.belongsTo(User, { as: "organizer", foreignKey: "OrganizerId" });
Event.hasMany(Registration);
Registration.belongsTo(Event);
Registration.belongsTo(User);
Offer.hasMany(Claim);
Claim.belongsTo(Offer);
Claim.belongsTo(User);
Organization.belongsTo(User, { as: "owner", foreignKey: "OwnerId" });
Mentor.belongsTo(User);
MentorRequest.belongsTo(Mentor);
MentorRequest.belongsTo(User);
Conversation.belongsTo(User, { as: "first", foreignKey: "FirstUserId" });
Conversation.belongsTo(User, { as: "second", foreignKey: "SecondUserId" });
Conversation.hasMany(Message);
Message.belongsTo(Conversation);
Message.belongsTo(User, { as: "sender", foreignKey: "SenderId" });
Block.belongsTo(User);
Block.belongsTo(User, { as: "blocked", foreignKey: "BlockedUserId" });
Follow.belongsTo(User, { as: "follower", foreignKey: "FollowerId" });
Follow.belongsTo(User, { as: "following", foreignKey: "FollowingId" });
Challenge.belongsTo(Community);
Challenge.belongsTo(User, { as: "organizer", foreignKey: "OrganizerId" });
Challenge.hasMany(Submission);
Submission.belongsTo(Challenge);
Submission.belongsTo(User);
Notification.belongsTo(User);
Report.belongsTo(User);
AuditLog.belongsTo(User);
User.hasMany(Subscription);
Subscription.belongsTo(User);
Plan.hasMany(Subscription);
Subscription.belongsTo(Plan);
User.hasMany(PaymentAttempt);
PaymentAttempt.belongsTo(User);
Subscription.hasMany(PaymentAttempt);
PaymentAttempt.belongsTo(Subscription);
Community.hasMany(Group);
Group.belongsTo(Community);
User.belongsToMany(Group, { through: GroupMembership });
Group.belongsToMany(User, { through: GroupMembership });
Group.hasMany(GroupMembership);
GroupMembership.belongsTo(Group);
GroupMembership.belongsTo(User);
Community.hasMany(Room);
Room.belongsTo(Community);
User.hasMany(RoomApplication);
RoomApplication.belongsTo(User);
Room.hasMany(RoomApplication);
RoomApplication.belongsTo(Room);
User.hasMany(SavedSearch);
SavedSearch.belongsTo(User);
User.hasOne(NotificationPreference);
NotificationPreference.belongsTo(User);
User.hasMany(Partnership);
Partnership.belongsTo(User);
Organization.hasMany(OrganizationMember);
OrganizationMember.belongsTo(Organization);
OrganizationMember.belongsTo(User);
Perk.hasMany(PerkApplication);
PerkApplication.belongsTo(Perk);
User.hasMany(PerkApplication);
PerkApplication.belongsTo(User);

// -------------------------------------------------------------------------
// Performance indexes.
//
// PostgreSQL does NOT index foreign-key columns automatically, and the model
// definitions only declare a few UNIQUE pairs. Without these, "comments for a
// post", "newest posts in a community", "my notifications" etc. are sequential
// scans that slow down as tables grow. Each entry is [Model, [columns...]]:
// the column names are checked against the real model attributes, so a typo
// fails loudly instead of silently creating nothing.
//
// Applied by ensureIndexes(): after sync() in dev/test, and by the versioned
// migration 0002_performance_indexes in production. Idempotent (IF NOT EXISTS).
// -------------------------------------------------------------------------
export const PERFORMANCE_INDEXES = [
  [Post, ["status", "createdAt"]],
  [Post, ["CommunityId", "status", "createdAt"]],
  [Post, ["UserId", "createdAt"]],
  [Comment, ["PostId", "createdAt"]],
  [Comment, ["UserId"]],
  [Reaction, ["PostId"]],
  [Bookmark, ["PostId"]],
  [Notification, ["UserId", "createdAt"]],
  [Notification, ["UserId", "readAt"]],
  [Message, ["ConversationId", "createdAt"]],
  [Conversation, ["FirstUserId"]],
  [Conversation, ["SecondUserId"]],
  [Session, ["UserId"]],
  [Session, ["expiresAt"]],
  [Event, ["status", "startsAt"]],
  [Registration, ["EventId", "status"]],
  [Follow, ["FollowingId"]],
  [Block, ["BlockedUserId"]],
  [Membership, ["CommunityId"]],
  [Subscription, ["UserId", "status"]],
  [Subscription, ["status", "endsAt"]],
  [PaymentAttempt, ["UserId", "createdAt"]],
  [PaymentAttempt, ["SubscriptionId"]],
  [PaymentAttempt, ["status", "createdAt"]],
  [AuditLog, ["createdAt"]],
  [AuditLog, ["UserId"]],
  [VerificationToken, ["UserId", "purpose"]],
  [GroupMembership, ["UserId"]],
  [RoomApplication, ["UserId"]],
  [User, ["status"]],
  [User, ["role"]],
];

const quoteId = (s) => `"${String(s).replace(/"/g, '""')}"`;

export async function ensureIndexes({ log = () => {} } = {}) {
  if (isMysql) return { created: 0, skipped: "mysql" }; // legacy target: no IF NOT EXISTS for indexes
  let created = 0;
  for (const [Model, cols] of PERFORMANCE_INDEXES) {
    const table = Model.getTableName();
    for (const c of cols) {
      if (!Model.rawAttributes[c])
        throw new Error(`index_column_missing:${Model.name}.${c}`);
    }
    const name = `idx_${String(table).toLowerCase()}_${cols.join("_").toLowerCase()}`.slice(0, 60);
    await sequelize.query(
      `CREATE INDEX IF NOT EXISTS ${quoteId(name)} ON ${quoteId(table)} (${cols.map(quoteId).join(", ")})`,
    );
    created++;
  }
  // Trigram indexes make `ILIKE '%term%'` (member/post/user search) use an
  // index instead of scanning every row. PostgreSQL-only, and creating an
  // extension needs privileges the app role may not have (on RDS: rds_superuser),
  // so this is best-effort and reported rather than fatal.
  let trigram = false;
  if (isPostgres) {
    try {
      await sequelize.query("CREATE EXTENSION IF NOT EXISTS pg_trgm");
      for (const [table, col] of [["Users", "name"], ["Users", "email"], ["Posts", "body"], ["Events", "title"]]) {
        await sequelize.query(
          `CREATE INDEX IF NOT EXISTS ${quoteId(`idx_${table.toLowerCase()}_${col}_trgm`)} ON ${quoteId(table)} USING gin (${quoteId(col)} gin_trgm_ops)`,
        );
      }
      trigram = true;
    } catch (err) {
      log(`pg_trgm indexes skipped: ${String(err.message || err)}`);
    }
  }
  return { created, trigram };
}

export const PLAN_SEED = [
  {
    code: "free",
    nameAr: "مجاني",
    nameEn: "Free",
    audience: "individual",
    monthlyEgp: 0,
    yearlyEgp: 0,
    featured: false,
    descriptionAr: "للاستكشاف وبناء أول شبكة مهنية داخل مجتمعات USAM.",
    descriptionEn:
      "Explore USAM Communities and start building your professional network.",
    featuresAr: [
      "الانضمام للمجتمعات الأربع",
      "المنشورات والتعليقات والحفظ",
      "الموارد العامة والفعاليات المجانية",
      "ملف عضو أساسي",
    ],
    featuresEn: [
      "Join all four communities",
      "Posts, comments and bookmarks",
      "Public resources and free events",
      "Basic member profile",
    ],
  },
  {
    code: "plus",
    nameAr: "بلس",
    nameEn: "Plus",
    audience: "individual",
    monthlyEgp: 149,
    yearlyEgp: 1490,
    featured: true,
    descriptionAr: "لمن يريد مسارات عملية وغرفًا صغيرة ومزايا أعضاء أعمق.",
    descriptionEn:
      "For members who want practical programs, small rooms and deeper benefits.",
    featuresAr: [
      "كل مزايا المجاني",
      "التقديم على البرامج والغرف المنسقة",
      "أولوية التسجيل في بعض الفعاليات",
      "مزايا وعروض الأعضاء",
      "شارة Plus داخل الملف",
    ],
    featuresEn: [
      "Everything in Free",
      "Apply to programs and curated rooms",
      "Priority access to selected events",
      "Member benefits and offers",
      "Plus profile badge",
    ],
  },
  {
    code: "pro",
    nameAr: "برو",
    nameEn: "Pro",
    audience: "individual",
    monthlyEgp: 349,
    yearlyEgp: 3490,
    featured: false,
    descriptionAr:
      "للمؤسسين والمستقلين والمهنيين الذين يحتاجون دعمًا أقرب وفرص ظهور أكبر.",
    descriptionEn:
      "For founders, freelancers and professionals who need closer support and more visibility.",
    featuresAr: [
      "كل مزايا Plus",
      "جلسة جماعية شهرية مع خبير",
      "أولوية طلب الإرشاد",
      "مراجعة ربع سنوية للملف أو المشروع",
      "دعوات مختارة للقاءات المغلقة",
    ],
    featuresEn: [
      "Everything in Plus",
      "Monthly group expert session",
      "Priority mentorship requests",
      "Quarterly profile or project review",
      "Selected private-event invitations",
    ],
  },
  {
    code: "organization",
    nameAr: "المؤسسات",
    nameEn: "Organization",
    audience: "organization",
    monthlyEgp: 1499,
    yearlyEgp: 14990,
    featured: false,
    descriptionAr:
      "للشركات والجامعات والمجتمعات التي تريد حضورًا منظمًا وتعاونًا مع USAM.",
    descriptionEn:
      "For companies, universities and communities that need an organized USAM presence.",
    featuresAr: [
      "صفحة مؤسسة بعد المراجعة",
      "حتى 10 مقاعد للفريق",
      "نشر فرص أو فعاليات بعد الاعتماد",
      "تقارير تفاعل أساسية",
      "نقطة تواصل للشراكات",
    ],
    featuresEn: [
      "Reviewed organization page",
      "Up to 10 team seats",
      "Approved opportunities or events",
      "Basic engagement reporting",
      "Partnership contact point",
    ],
  },
];

export const COMMUNITY_SEED = [
  [
    "launchpad",
    "LaunchPad",
    "LaunchPad",
    "المؤسسون والمستثمرون",
    "Founders & investors",
    "#d65b39",
  ],
  [
    "freelancespace",
    "FreelanceSpace",
    "FreelanceSpace",
    "المستقلون والعملاء",
    "Freelancers & clients",
    "#4c7295",
  ],
  [
    "hrconnect",
    "HR Connect",
    "HR Connect",
    "أصحاب العمل والتوظيف",
    "Employers & recruiters",
    "#7055a3",
  ],
  [
    "studentzone",
    "StudentZone",
    "StudentZone",
    "الطلاب والمواهب الصاعدة",
    "Students & early talent",
    "#539780",
  ],
];
export const GROUP_SEED = [
  {
    slug: "founder-circle",
    type: "group",
    nameAr: "دائرة المؤسسين",
    nameEn: "Founder Circle",
    description: "نقاشات عملية بين المؤسسين داخل LaunchPad.",
    visibility: "public",
    status: "published",
    community: "launchpad",
  },
  {
    slug: "campus-builders",
    type: "chapter",
    nameAr: "صنّاع المجتمعات الجامعية",
    nameEn: "Campus Builders",
    description: "Chapter للطلاب الذين يبنون مبادرات ومشروعات داخل الجامعات.",
    visibility: "public",
    status: "published",
    community: "studentzone",
  },
];
export const ROOM_SEED = [
  {
    title: "Founder Problem-Solving Room",
    description:
      "جلسة منسقة صغيرة لمناقشة تحدٍ حقيقي وتحديد خطوة متابعة واضحة.",
    capacity: 12,
    status: "open",
    community: "launchpad",
  },
  {
    title: "Portfolio Feedback Room",
    description:
      "مراجعة جماعية منظمة لملفات الأعمال مع موافقة المشاركين على المشاركة.",
    capacity: 10,
    status: "open",
    community: "freelancespace",
  },
];
// Ensure the SQLite data directory exists (no-op for networked dialects).
function ensureSqliteDir() {
  if (isSqlite) {
    const sqlitePath = process.env.SQLITE_PATH || "./data/usam.sqlite";
    // path.dirname resolves the parent correctly on POSIX (/) and Windows (\).
    fs.mkdirSync((sqlitePath.match(/[\\/]/) ? sqlitePath.replace(/[\\/][^\\/]*$/, "") : "."), {
      recursive: true,
    });
  }
}

// Seed reference/catalog data (idempotent via findOrCreate). Safe to run on
// every boot and after migrations; never overwrites existing rows.
export async function seedReferenceData() {
  for (const [
    slug,
    nameAr,
    nameEn,
    descriptionAr,
    descriptionEn,
    accent,
  ] of COMMUNITY_SEED)
      await Community.findOrCreate({
        where: { slug },
        defaults: { nameAr, nameEn, descriptionAr, descriptionEn, accent },
      });
    for (const item of PLAN_SEED)
      await Plan.findOrCreate({
        where: { code: item.code },
        defaults: {
          ...item,
          featuresAr: JSON.stringify(item.featuresAr),
          featuresEn: JSON.stringify(item.featuresEn),
        },
      });
    for (const item of GROUP_SEED) {
      const { community: communitySlug, ...defaults } = item;
      const community = await Community.findOne({
        where: { slug: communitySlug },
      });
      await Group.findOrCreate({
        where: { slug: item.slug },
        defaults: { ...defaults, CommunityId: community.id },
      });
    }
    for (const item of ROOM_SEED) {
      const { community: communitySlug, ...defaults } = item;
      const community = await Community.findOne({
        where: { slug: communitySlug },
      });
      await Room.findOrCreate({
        where: { title: item.title },
        defaults: { ...defaults, CommunityId: community.id },
      });
    }
    for (const item of [
      {
        key: "rooms_applications",
        description: "Curated room applications",
        enabled: true,
      },
      {
        key: "saved_searches",
        description: "Member saved searches",
        enabled: true,
      },
      {
        key: "partnership_requests",
        description: "Partnership request workflow",
        enabled: true,
      },
    ])
      await FeatureFlag.findOrCreate({
        where: { key: item.key },
        defaults: item,
      });
  for (const item of perksCatalog)
    await Perk.findOrCreate({
      where: { slug: item.slug },
      defaults: { ...item, status: "published", requiresPaid: true },
    });
}

// initDb: connect + ensure schema + seed.
//   - Non-production (default): sync() the models (disposable dev/test DBs),
//     then seed reference data.
//   - Production: do NOT sync(); schema is owned by migrations. Still seed
//     reference data (idempotent) so a freshly-migrated prod DB has the four
//     communities, plans, groups, rooms, flags and perks.
// Pass { bootstrap:false } to skip sync+seed entirely (used by migrate CLI).
export async function initDb({
  bootstrap = process.env.NODE_ENV !== "production",
  seed = true,
} = {}) {
  ensureSqliteDir();
  await sequelize.authenticate();
  if (bootstrap) {
    await sequelize.sync();
    // Production gets these through migration 0002; dev/test through here.
    await ensureIndexes();
  }
  if (seed && process.env.SKIP_SEED !== "true") {
    await seedReferenceData();
  }
}
export function publicUser(u) {
  return (
    u && {
      id: u.id,
      name: u.name,
      username: u.username,
      persona: u.persona,
      bio: u.bio,
      location: u.location,
      skills: JSON.parse(u.skills || "[]"),
      avatarUrl: u.avatarUrl || "",
      discoverable: u.discoverable,
      messagesEnabled: u.messagesEnabled,
      language: u.language,
      role: u.role,
      emailVerified: u.emailVerified,
      createdAt: u.createdAt,
    }
  );
}
