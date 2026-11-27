// -------------------------------------------------------------------------
// Account / platform-management routes:
//   - GET  /users/me/export       self-service data export (privacy/GDPR-style)
//   - Admin plan CRUD             dynamic pricing/benefits (no code changes)
//   - Admin user management       list, suspend, reinstate, role change
//   - Admin outbox inspection     view/retry background jobs & email delivery
//
// Plan CRUD makes pricing, billing periods, features and limits fully
// data-driven. Role changes are restricted so only a super_admin can mint
// admins/super_admins (admins can manage members/moderators only).
// -------------------------------------------------------------------------
import { logger } from "./logger.js";

export function registerAccountRoutes(app, deps) {
  const {
    sequelize,
    Op,
    User,
    Session,
    Subscription,
    Plan,
    PaymentAttempt,
    AuditLog,
    OutboxMessage,
    Notification,
    auth,
    admin,
    superAdmin,
    fail,
    clean,
    audit,
    publicPlan,
    publicUser,
    contains,
  } = deps;

  // ---- Self-service data export -----------------------------------------
  app.get("/api/v1/users/me/export", auth, async (req, res, next) => {
    try {
      const uid = req.user.id;
      const [subscriptions, payments, notifications] = await Promise.all([
        Subscription.findAll({ where: { UserId: uid }, include: [Plan] }),
        PaymentAttempt.findAll({ where: { UserId: uid } }),
        Notification.findAll({ where: { UserId: uid }, limit: 500 }),
      ]);
      res.setHeader(
        "Content-Disposition",
        'attachment; filename="usam-data-export.json"',
      );
      res.json({
        exportedAt: new Date().toISOString(),
        profile: publicUser(req.user),
        email: req.user.email,
        subscriptions: subscriptions.map((s) => ({
          status: s.status,
          billingCycle: s.billingCycle,
          amountEgp: s.amountEgp,
          plan: s.Plan ? s.Plan.code : null,
          startsAt: s.startsAt,
          endsAt: s.endsAt,
        })),
        payments: payments.map((p) => ({
          amountEgp: p.amountEgp,
          status: p.status,
          createdAt: p.createdAt,
        })),
        notifications: notifications.map((n) => ({
          kind: n.kind,
          text: n.text,
          createdAt: n.createdAt,
        })),
      });
    } catch (e) {
      next(e);
    }
  });

  // ---- Admin: plan management (dynamic pricing) -------------------------
  app.get("/api/v1/admin/plans", auth, admin, async (req, res, next) => {
    try {
      const items = await Plan.findAll({ order: [["monthlyEgp", "ASC"]] });
      res.json({
        items: items.map((p) => ({
          ...publicPlan(p),
          active: p.active,
          createdAt: p.createdAt,
        })),
      });
    } catch (e) {
      next(e);
    }
  });

  const parsePlanBody = (body) => {
    const featuresAr = Array.isArray(body.featuresAr) ? body.featuresAr : [];
    const featuresEn = Array.isArray(body.featuresEn) ? body.featuresEn : [];
    return {
      nameAr: clean(body.nameAr, 80),
      nameEn: clean(body.nameEn, 80),
      audience: ["individual", "organization"].includes(body.audience)
        ? body.audience
        : "individual",
      monthlyEgp: Math.max(0, Math.round(Number(body.monthlyEgp) || 0)),
      yearlyEgp: Math.max(0, Math.round(Number(body.yearlyEgp) || 0)),
      descriptionAr: clean(body.descriptionAr, 2000),
      descriptionEn: clean(body.descriptionEn, 2000),
      featuresAr: JSON.stringify(featuresAr.map((f) => String(f).slice(0, 200))),
      featuresEn: JSON.stringify(featuresEn.map((f) => String(f).slice(0, 200))),
      featured: !!body.featured,
      active: body.active !== false,
    };
  };

  app.post("/api/v1/admin/plans", auth, admin, async (req, res, next) => {
    try {
      const code = clean(req.body.code, 32).toLowerCase();
      if (!/^[a-z0-9_-]{2,32}$/.test(code))
        return fail(res, 400, "invalid_plan_code");
      if (await Plan.findOne({ where: { code } }))
        return fail(res, 409, "plan_exists");
      const data = parsePlanBody(req.body);
      if (data.nameAr.length < 2 || data.nameEn.length < 2)
        return fail(res, 400, "invalid_plan");
      const plan = await Plan.create({ code, ...data });
      await audit(req, "create_plan", "plan", plan.id, code);
      res.status(201).json({ id: plan.id, code });
    } catch (e) {
      next(e);
    }
  });

  app.patch("/api/v1/admin/plans/:id", auth, admin, async (req, res, next) => {
    try {
      const plan = await Plan.findByPk(req.params.id);
      if (!plan) return fail(res, 404, "not_found");
      const data = parsePlanBody({ ...plan.toJSON(), ...req.body, featuresAr: req.body.featuresAr, featuresEn: req.body.featuresEn });
      // Preserve existing features if not supplied.
      if (!Array.isArray(req.body.featuresAr)) data.featuresAr = plan.featuresAr;
      if (!Array.isArray(req.body.featuresEn)) data.featuresEn = plan.featuresEn;
      await plan.update(data);
      await audit(req, "update_plan", "plan", plan.id, plan.code);
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  // ---- Admin: user management -------------------------------------------
  app.get("/api/v1/admin/users", auth, admin, async (req, res, next) => {
    try {
      const q = clean(req.query.q, 80);
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
      const where = q
        ? {
            [Op.or]: [
              { name: contains(q) },
              { email: contains(q) },
              { username: contains(q) },
            ],
          }
        : {};
      const { rows, count } = await User.findAndCountAll({
        where,
        order: [["createdAt", "DESC"]],
        limit: pageSize,
        offset: (page - 1) * pageSize,
        attributes: [
          "id",
          "name",
          "email",
          "username",
          "role",
          "status",
          "emailVerified",
          "isDeleted",
          "createdAt",
          "lastLoginAt",
        ],
      });
      res.json({
        items: rows,
        page,
        pageSize,
        total: count,
        totalPages: Math.ceil(count / pageSize),
      });
    } catch (e) {
      next(e);
    }
  });

  app.patch("/api/v1/admin/users/:id", auth, admin, async (req, res, next) => {
    try {
      const target = await User.findByPk(req.params.id);
      if (!target) return fail(res, 404, "not_found");
      if (target.id === req.user.id)
        return fail(res, 400, "cannot_modify_self");

      const action = clean(req.body.action, 30);
      // Only a super_admin may act on an admin or super_admin account at all
      // (suspend, reinstate or role change); an admin manages members and
      // moderators only.
      if (["admin", "super_admin"].includes(target.role) && req.user.role !== "super_admin")
        return fail(res, 403, "super_admin_required");
      if (action === "suspend") {
        await target.update({
          status: "suspended",
          suspendedAt: new Date(),
          suspensionReason: clean(req.body.reason, 400),
        });
        const revoked = await Session.destroy({ where: { UserId: target.id } });
        await audit(req, "user_sessions_revoked", "user", target.id, `suspend sessions:${revoked}`);
      } else if (action === "reinstate") {
        await target.update({
          status: "active",
          suspendedAt: null,
          suspensionReason: "",
        });
      } else if (action === "set_role") {
        const role = clean(req.body.role, 20);
        if (!["member", "moderator", "admin", "super_admin"].includes(role))
          return fail(res, 400, "invalid_role");
        // Only a super_admin may grant admin/super_admin.
        if (
          ["admin", "super_admin"].includes(role) &&
          req.user.role !== "super_admin"
        )
          return fail(res, 403, "super_admin_required");
        // An admin cannot demote another admin/super_admin.
        if (
          ["admin", "super_admin"].includes(target.role) &&
          req.user.role !== "super_admin"
        )
          return fail(res, 403, "super_admin_required");
        await target.update({ role });
        // A role change signs the target out everywhere (server-side delete).
        const revoked = await Session.destroy({ where: { UserId: target.id } });
        await audit(req, "user_sessions_revoked", "user", target.id, `role:${role} sessions:${revoked}`);
      } else {
        return fail(res, 400, "invalid_action");
      }
      await audit(req, `user_${action}`, "user", target.id, req.body.role || "");
      res.json({ ok: true });
    } catch (e) {
      next(e);
    }
  });

  // ---- Admin: background jobs / outbox inspection -----------------------
  app.get("/api/v1/admin/outbox", auth, admin, async (req, res, next) => {
    try {
      // Allow-listed, not just length-capped: an arbitrary string against an
      // ENUM column throws at the SQL level on Postgres (SQLite silently
      // returns no rows instead) - found by the robustness sweep.
      const status = ["pending", "processing", "sent", "failed", "dead"].includes(req.query.status)
        ? req.query.status
        : null;
      const where = status ? { status } : {};
      const items = await OutboxMessage.findAll({
        where,
        order: [["createdAt", "DESC"]],
        limit: 100,
        attributes: [
          "id",
          "kind",
          "status",
          "attempts",
          "maxAttempts",
          "nextAttemptAt",
          "lastError",
          "createdAt",
        ],
      });
      res.json({ items });
    } catch (e) {
      next(e);
    }
  });

  app.post(
    "/api/v1/admin/outbox/:id/retry",
    auth,
    admin,
    async (req, res, next) => {
      try {
        const row = await OutboxMessage.findByPk(req.params.id);
        if (!row) return fail(res, 404, "not_found");
        if (!["failed", "dead"].includes(row.status))
          return fail(res, 409, "not_retryable");
        await row.update({
          status: "pending",
          nextAttemptAt: new Date(),
          attempts: 0,
          lastError: "",
        });
        await audit(req, "retry_job", "outbox", row.id, row.kind);
        res.json({ ok: true });
      } catch (e) {
        next(e);
      }
    },
  );

  // ---- Admin: audit log viewer ------------------------------------------
  app.get("/api/v1/admin/audit", auth, admin, async (req, res, next) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 50));
      const { rows, count } = await AuditLog.findAndCountAll({
        order: [["createdAt", "DESC"]],
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      res.json({
        items: rows,
        page,
        pageSize,
        total: count,
        totalPages: Math.ceil(count / pageSize),
      });
    } catch (e) {
      next(e);
    }
  });
}

export default { registerAccountRoutes };
