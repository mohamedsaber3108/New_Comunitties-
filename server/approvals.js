// Two-person rule (A-02 part 1): manual subscription activation and refunds
// do not act when requested. They create a pending ApprovalRequest; a
// DIFFERENT signed-in admin approves or rejects it.
//   GET  /api/v1/admin/approvals                 admin+   (?status=pending|approved|rejected|expired)
//   POST /api/v1/admin/approvals/:id/approve     activate_subscription: super_admin only; refund_payment: admin+
//   POST /api/v1/admin/approvals/:id/reject      same roles, a note is required
// Rules enforced here, in server code: decider != requester, request is
// pending and not expired, the status change is claimed with a conditional
// UPDATE so a double approve acts once.

import { logger } from "./logger.js";

const TTL_MS = 24 * 60 * 60 * 1000;
const STATUSES = ["pending", "approved", "rejected", "expired", "needs_review"];
const stale = () => Object.assign(new Error("request_stale"), { status: 409 });

export function registerApprovalRoutes(app, deps) {
  const { sequelize, Op, User, Plan, Subscription, PaymentAttempt, ApprovalRequest, auth, admin, fail, audit, notify, hasRole } = deps;

  const text = (v) => (typeof v === "string" ? v.trim() : "");

  // Used by the activation and refund routes after they validated the target.
  deps.requestApproval = async (req, res, { action, targetType, targetId, payload }) => {
    const reason = text(req.body?.reason);
    if (reason.length < 10 || reason.length > 500) return fail(res, 400, "reason_required");
    // An earlier request for the same target that may already have acted
    // (needs_review, or approved without executedAt) blocks a new one.
    const unresolved = await ApprovalRequest.findOne({
      where: {
        action,
        targetId: String(targetId),
        [Op.or]: [{ status: "needs_review" }, { status: "approved", executedAt: null }],
      },
    });
    if (unresolved)
      return fail(res, 409, action === "refund_payment" ? "refund_review_pending" : "request_review_pending");
    const dup = await ApprovalRequest.findOne({
      where: { action, targetId: String(targetId), status: "pending", expiresAt: { [Op.gt]: new Date() } },
    });
    if (dup) return fail(res, 409, "request_already_pending");
    const item = await ApprovalRequest.create({
      action,
      targetType,
      targetId: String(targetId),
      payload: JSON.stringify(payload || {}),
      reason,
      requestedById: req.user.id,
      expiresAt: new Date(Date.now() + TTL_MS),
    });
    await audit(req, `request_${action}`, targetType, String(targetId), `request:${item.id}`);
    return res.status(201).json({ id: item.id, status: item.status, expiresAt: item.expiresAt });
  };

  const expireOld = () =>
    ApprovalRequest.update({ status: "expired" }, { where: { status: "pending", expiresAt: { [Op.lte]: new Date() } } });

  app.get("/api/v1/admin/approvals", auth, admin, async (req, res, next) => {
    try {
      await expireOld();
      const status = STATUSES.includes(req.query.status) ? req.query.status : "pending";
      // needs_review: super_admin only. Includes approved rows whose action never ran.
      if (status === "needs_review" && !hasRole(req.user, "super_admin")) return fail(res, 403, "super_admin_required");
      const where =
        status === "needs_review"
          ? { [Op.or]: [{ status: "needs_review" }, { status: "approved", executedAt: null }] }
          : { status };
      const rows = await ApprovalRequest.findAll({
        where,
        order: [["createdAt", "ASC"]],
        limit: 100,
      });
      const ids = [...new Set(rows.flatMap((r) => [r.requestedById, r.decidedById]).filter(Boolean))];
      const users = ids.length ? await User.findAll({ where: { id: { [Op.in]: ids } }, attributes: ["id", "name", "email"] }) : [];
      const byId = new Map(users.map((u) => [u.id, { id: u.id, name: u.name, email: u.email }]));
      res.json({
        items: rows.map((r) => ({
          id: r.id,
          action: r.action,
          targetType: r.targetType,
          targetId: r.targetId,
          payload: JSON.parse(r.payload || "{}"),
          reason: r.reason,
          status: r.status,
          requestedBy: byId.get(r.requestedById) || null,
          decidedBy: byId.get(r.decidedById) || null,
          decidedAt: r.decidedAt,
          executedAt: r.executedAt,
          needsReview: r.status === "needs_review" || (r.status === "approved" && !r.executedAt),
          decisionNote: r.decisionNote,
          createdAt: r.createdAt,
          expiresAt: r.expiresAt,
        })),
      });
    } catch (e) {
      next(e);
    }
  });

  // Shared checks. Returns the request, or null after sending the error.
  async function loadForDecision(req, res) {
    const r = await ApprovalRequest.findByPk(req.params.id);
    if (!r) return fail(res, 404, "not_found"), null;
    if (r.action === "activate_subscription" && !hasRole(req.user, "super_admin"))
      return fail(res, 403, "super_admin_required"), null;
    if (r.requestedById === req.user.id) return fail(res, 403, "self_approval_forbidden"), null;
    if (r.status !== "pending") return fail(res, 409, "request_not_pending"), null;
    if (r.expiresAt <= new Date()) {
      await ApprovalRequest.update({ status: "expired" }, { where: { id: r.id, status: "pending" } });
      return fail(res, 409, "request_expired"), null;
    }
    return r;
  }

  // Conditional claim: only one caller can move a request out of "pending".
  const claim = (r, status, req, note, t) =>
    ApprovalRequest.update(
      { status, decidedById: req.user.id, decidedAt: new Date(), decisionNote: note || null },
      { where: { id: r.id, status: "pending", expiresAt: { [Op.gt]: new Date() } }, transaction: t },
    );

  const details = (r, req) => `request:${r.id}:requester:${r.requestedById}:approver:${req.user.id}`;

  app.post("/api/v1/admin/approvals/:id/reject", auth, admin, async (req, res, next) => {
    try {
      const r = await loadForDecision(req, res);
      if (!r) return;
      const note = text(req.body?.note);
      if (note.length < 3 || note.length > 500) return fail(res, 400, "note_required");
      const [n] = await claim(r, "rejected", req, note);
      if (!n) return fail(res, 409, "request_not_pending");
      await audit(req, "reject_request", r.targetType, r.targetId, details(r, req));
      res.json({ id: r.id, status: "rejected" });
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/v1/admin/approvals/:id/approve", auth, admin, async (req, res, next) => {
    try {
      const r = await loadForDecision(req, res);
      if (!r) return;
      const note = text(req.body?.note).slice(0, 500);
      if (r.action === "activate_subscription") {
        let plan, userId, endsAt;
        try {
          await sequelize.transaction(async (t) => {
            const [n] = await claim(r, "approved", req, note, t);
            if (!n) throw Object.assign(new Error("request_not_pending"), { status: 409 });
            const item = await Subscription.findByPk(r.targetId, { include: [Plan], transaction: t });
            if (!item) throw Object.assign(new Error("not_found"), { status: 404 });
            if (item.status !== "pending_payment")
              throw Object.assign(new Error("payment_confirmation_required"), { status: 409 });
            const p = JSON.parse(r.payload || "{}");
            if (
              p.planCode !== item.Plan?.code ||
              p.billingCycle !== item.billingCycle ||
              p.amountEgp !== item.amountEgp ||
              p.memberId !== item.UserId
            )
              throw stale();
            endsAt = new Date();
            endsAt.setMonth(endsAt.getMonth() + (item.billingCycle === "yearly" ? 12 : 1));
            await Subscription.update(
              { status: "canceled", canceledAt: new Date() },
              { where: { UserId: item.UserId, status: "active", id: { [Op.ne]: item.id } }, transaction: t },
            );
            await item.update({ status: "active", startsAt: new Date(), endsAt }, { transaction: t });
            await PaymentAttempt.update(
              { status: "paid" },
              { where: { SubscriptionId: item.id, status: "pending" }, transaction: t },
            );
            plan = item.Plan;
            userId = item.UserId;
            // Audit rows and executedAt share the transaction: all or nothing.
            await audit(req, "activate_paid_subscription", "subscription", r.targetId, `${plan.code}:${details(r, req)}`, t);
            await ApprovalRequest.update({ executedAt: new Date() }, { where: { id: r.id }, transaction: t });
          });
        } catch (e) {
          if (e.status) return fail(res, e.status, e.message);
          throw e;
        }
        await notify(userId, "subscription_active", "Your USAM Communities subscription is active", "/billing");
        return res.json({ id: r.id, status: "approved", subscriptionStatus: "active", endsAt });
      }

      // refund_payment: the provider call cannot sit inside a DB transaction,
      // so claim first, then act. The request goes back to pending ONLY when
      // we know no money moved: a failed pre-check, or issueRefund returning
      // ok:false (it does that before/at the provider call). Any throw out of
      // issueRefund may be after the provider refund, so it is never undone:
      // the request becomes needs_review and is logged.
      const [n] = await claim(r, "approved", req, note);
      if (!n) return fail(res, 409, "request_not_pending");
      const undo = () =>
        ApprovalRequest.update({ status: "pending", decidedById: null, decidedAt: null, decisionNote: null }, { where: { id: r.id } });
      const attempt = await PaymentAttempt.findByPk(r.targetId, { include: [Subscription] }).catch(async (e) => {
        await undo();
        throw e;
      });
      if (!attempt) return await undo(), fail(res, 404, "not_found");
      if (attempt.status !== "paid") return await undo(), fail(res, 409, "attempt_not_refundable");
      const p = JSON.parse(r.payload || "{}");
      if (p.paidEgp !== attempt.amountEgp || p.memberId !== attempt.UserId) return await undo(), fail(res, 409, "request_stale");
      const amount = Number(p.amountEgp) || attempt.amountEgp;
      if (amount <= 0 || amount > attempt.amountEgp - attempt.refundedAmountEgp)
        return await undo(), fail(res, 400, "invalid_refund_amount");
      let out;
      try {
        out = await deps.issueRefund(attempt, amount, req);
      } catch (e) {
        logger.error("approvals.refund_failed_after_claim", { requestId: r.id, attemptId: attempt.id, error: String(e) });
        await ApprovalRequest.update({ status: "needs_review" }, { where: { id: r.id } }).catch((e2) =>
          logger.error("approvals.needs_review_mark_failed", { requestId: r.id, error: String(e2) }),
        );
        throw e;
      }
      if (!out.ok && out.error === "provider_unknown") {
        // Ambiguous provider answer (timeout, network, 5xx): money may have
        // moved, so never reopen. A super_admin checks it by hand.
        logger.error("approvals.refund_provider_unknown", { requestId: r.id, attemptId: attempt.id });
        await ApprovalRequest.update({ status: "needs_review" }, { where: { id: r.id } }).catch((e2) =>
          logger.error("approvals.needs_review_mark_failed", { requestId: r.id, error: String(e2) }),
        );
        return fail(res, 502, "provider_unknown");
      }
      if (!out.ok) return await undo(), fail(res, 502, out.error);
      // Money moved. From here nothing may undo the request.
      try {
        await ApprovalRequest.update({ executedAt: new Date() }, { where: { id: r.id } });
        await audit(req, "approve_request", r.targetType, r.targetId, details(r, req));
      } catch (e) {
        logger.error("approvals.post_refund_bookkeeping_failed", { requestId: r.id, attemptId: attempt.id, error: String(e) });
      }
      return res.json({ id: r.id, status: "approved", refundedAmountEgp: out.refundedAmountEgp, providerConfirmed: out.providerConfirmed });
    } catch (e) {
      next(e);
    }
  });
}
