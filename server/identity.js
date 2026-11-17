// -------------------------------------------------------------------------
// Identity & account-security routes, registered onto the existing Express
// app. Kept in a module so the monolith stays readable and these flows are
// independently testable. All routes live under /api/v1/auth or /api/v1/users.
//
// Endpoints added:
//   GET  /auth/verify-email/:token          verify an email
//   POST /auth/resend-verification          re-send the verify email (auth)
//   POST /auth/password/forgot              request a reset link (public)
//   POST /auth/password/reset               complete a reset with a token
//   POST /users/me/change-password          change password (auth)
//   GET  /users/me/sessions                 list active sessions/devices (auth)
//   DELETE /users/me/sessions/:id           revoke one session (auth)
//   DELETE /users/me                        soft-delete own account (auth)
//
// Email is always sent through the durable outbox (enqueueEmail), never inline,
// so delivery is retried and never silently dropped.
// -------------------------------------------------------------------------
import { Op } from "sequelize";
import {
  validatePassword,
  hashPassword,
  issueVerificationToken,
  consumeVerificationToken,
  sha256,
  SESSION_COOKIE,
  cookieOptions,
  VERIFY_TTL_MS,
  RESET_TTL_MS,
} from "./security.js";
import { enqueueEmail } from "./jobs.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { forgotLimiter } from "./ratelimit.js";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function registerIdentityRoutes(app, deps) {
  const {
    User,
    Session,
    VerificationToken,
    bcrypt,
    auth,
    fail,
    clean,
    audit,
    authLimit,
    publicUser,
  } = deps;

  // ---- Email verification ------------------------------------------------
  // The frontend page (/verify-email?token=...) completes verification with a
  // POST so mail scanners / link prefetchers that merely GET the URL cannot
  // burn the single-use token. The GET form is kept for API compatibility.
  const verifyEmailHandler = async (req, res, next) => {
    try {
      const raw = clean(req.params.token || req.body?.token, 128);
      const row = await consumeVerificationToken(
        VerificationToken,
        raw,
        "email_verify",
      );
      if (!row) return fail(res, 400, "invalid_or_expired_token");
      const user = await User.findByPk(row.UserId);
      if (!user || user.isDeleted) return fail(res, 404, "not_found");
      if (!user.emailVerified)
        await user.update({ emailVerified: true, emailVerifiedAt: new Date() });
      res.json({ ok: true, verified: true });
    } catch (e) {
      next(e);
    }
  };
  app.get("/api/v1/auth/verify-email/:token", verifyEmailHandler);
  app.post("/api/v1/auth/verify-email", authLimit, verifyEmailHandler);

  app.post(
    "/api/v1/auth/resend-verification",
    auth,
    async (req, res, next) => {
      try {
        if (req.user.emailVerified)
          return res.json({ ok: true, alreadyVerified: true });
        const raw = await issueVerificationToken(
          VerificationToken,
          req.user.id,
          "email_verify",
          VERIFY_TTL_MS,
        );
        await enqueueEmail(req.user.email, "verifyEmail", {
          name: req.user.name,
          link: `${config.frontendUrl}/verify-email?token=${raw}`,
        });
        res.json({ ok: true, sent: true });
      } catch (e) {
        next(e);
      }
    },
  );

  // ---- Password reset (public) ------------------------------------------
  // Always respond 200 to avoid user-enumeration; only send mail if the
  // account exists.
  app.post(
    "/api/v1/auth/password/forgot",
    authLimit,
    forgotLimiter,
    async (req, res, next) => {
      try {
        const email = clean(req.body.email, 254).toLowerCase();
        if (!EMAIL_RE.test(email)) return fail(res, 400, "invalid_email");
        const user = await User.findOne({
          where: { email, isDeleted: false },
        });
        if (user && user.authProvider === "password") {
          const raw = await issueVerificationToken(
            VerificationToken,
            user.id,
            "password_reset",
            RESET_TTL_MS,
          );
          await enqueueEmail(user.email, "passwordReset", {
            name: user.name,
            link: `${config.frontendUrl}/reset-password?token=${raw}`,
          });
        }
        res.json({ ok: true });
      } catch (e) {
        next(e);
      }
    },
  );

  app.post(
    "/api/v1/auth/password/reset",
    authLimit,
    async (req, res, next) => {
      try {
        const token = clean(req.body.token, 128);
        const pw = req.body.password;
        const policy = validatePassword(pw);
        if (!policy.ok) return fail(res, 400, policy.error);
        const row = await consumeVerificationToken(
          VerificationToken,
          token,
          "password_reset",
        );
        if (!row) return fail(res, 400, "invalid_or_expired_token");
        const user = await User.findByPk(row.UserId);
        if (!user) return fail(res, 404, "not_found");
        await user.update({
          passwordHash: await hashPassword(pw),
          passwordChangedAt: new Date(),
          failedLoginCount: 0,
          lockedUntil: null,
          // A verified reset also confirms control of the mailbox.
          emailVerified: true,
          emailVerifiedAt: user.emailVerifiedAt || new Date(),
        });
        // Revoke every existing session after a reset.
        await Session.destroy({ where: { UserId: user.id } });
        await enqueueEmail(user.email, "passwordChanged", { name: user.name });
        logger.info("auth.password_reset", { userId: user.id });
        res.json({ ok: true });
      } catch (e) {
        next(e);
      }
    },
  );

  // ---- Change password (authenticated) ----------------------------------
  app.post(
    "/api/v1/users/me/change-password",
    auth,
    async (req, res, next) => {
      try {
        const current = req.body.currentPassword || "";
        const next_ = req.body.newPassword;
        const match = await bcrypt.compare(current, req.user.passwordHash);
        if (!match) return fail(res, 400, "invalid_current_password");
        const policy = validatePassword(next_);
        if (!policy.ok) return fail(res, 400, policy.error);
        if (await bcrypt.compare(next_, req.user.passwordHash))
          return fail(res, 400, "password_unchanged");
        await req.user.update({
          passwordHash: await hashPassword(next_),
          passwordChangedAt: new Date(),
        });
        // Keep the current session; revoke all others.
        await Session.destroy({
          where: {
            UserId: req.user.id,
            id: { [Op.ne]: req.session?.id || null },
          },
        });
        await enqueueEmail(req.user.email, "passwordChanged", {
          name: req.user.name,
        });
        await audit(req, "change_password", "user", req.user.id);
        res.json({ ok: true });
      } catch (e) {
        next(e);
      }
    },
  );

  // ---- Sessions / devices ------------------------------------------------
  app.get("/api/v1/users/me/sessions", auth, async (req, res, next) => {
    try {
      const rows = await Session.findAll({
        where: { UserId: req.user.id, expiresAt: { [Op.gt]: new Date() } },
        order: [["lastSeenAt", "DESC"]],
        attributes: ["id", "ip", "userAgent", "lastSeenAt", "createdAt"],
      });
      res.json({
        items: rows.map((s) => ({
          id: s.id,
          ip: s.ip,
          userAgent: s.userAgent,
          lastSeenAt: s.lastSeenAt,
          createdAt: s.createdAt,
          current: s.id === req.session?.id,
        })),
      });
    } catch (e) {
      next(e);
    }
  });

  app.delete("/api/v1/users/me/sessions/:id", auth, async (req, res, next) => {
    try {
      const count = await Session.destroy({
        where: { id: req.params.id, UserId: req.user.id },
      });
      if (!count) return fail(res, 404, "not_found");
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  // ---- Account deletion (soft delete) ------------------------------------
  // Soft-delete: anonymize identifiers, mark deleted, revoke sessions. The
  // row is retained for referential integrity and audit; a scheduled job can
  // hard-purge after the retention window.
  app.delete("/api/v1/users/me", auth, async (req, res, next) => {
    try {
      const confirm = clean(req.body?.confirm, 20);
      if (confirm !== "DELETE") return fail(res, 400, "confirmation_required");
      const u = req.user;
      const anonEmail = `deleted+${u.id}@deleted.usam.local`;
      await u.update({
        status: "deleted",
        isDeleted: true,
        deletedAt: new Date(),
        email: anonEmail,
        name: "Deleted member",
        bio: "",
        location: "",
        skills: "[]",
        avatarUrl: "",
        discoverable: false,
        messagesEnabled: false,
      });
      await Session.destroy({ where: { UserId: u.id } });
      await audit(req, "delete_account", "user", u.id);
      logger.info("account.deleted", { userId: u.id });
      res.clearCookie(SESSION_COOKIE, cookieOptions({ maxAge: 0 })).json({
        ok: true,
      });
    } catch (e) {
      next(e);
    }
  });
}

export default { registerIdentityRoutes };
