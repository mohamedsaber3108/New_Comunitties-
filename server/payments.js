// -------------------------------------------------------------------------
// Payment routes (Paymob). Registered onto the existing app.
//
// Design:
//   - The existing POST /subscriptions keeps working: free plans activate
//     instantly; paid plans create a pending_payment Subscription + a
//     PaymentAttempt (idempotent via Idempotency-Key). That is untouched.
//   - NEW: POST /payments/checkout/:attemptId initializes a live Paymob
//     hosted checkout for an existing pending PaymentAttempt and returns the
//     iframe URL. If Paymob is not configured it returns a clear, honest
//     "not configured" response (never a fake success).
//   - NEW: POST /payments/webhook/paymob receives Paymob callbacks, verifies
//     the HMAC, dedupes by transaction id (WebhookEvent), and on a successful
//     transaction activates the subscription in a transaction.
//   - NEW: POST /admin/payments/:id/refund records a refund (and calls Paymob
//     when configured). Admin only.
//
// Money is stored in whole EGP on our side; Paymob works in piasters (×100),
// converted only inside server/paymob.js.
// -------------------------------------------------------------------------
import paymob from "./paymob.js";
import { config } from "./config.js";
import { logger } from "./logger.js";
import { enqueueEmail } from "./jobs.js";
import crypto from "node:crypto";
import { markCouponRedeemed } from "./coupons.js";

// Paymob sends boolean-ish fields inconsistently across endpoints/webhooks
// (observed as both JSON booleans and the strings "true"/"false").
const truthy = (v) => v === true || v === "true";

export function registerPaymentRoutes(app, deps) {
  const {
    sequelize,
    Op,
    User,
    Plan,
    Subscription,
    PaymentAttempt,
    WebhookEvent,
    Registration,
    Event,
    Coupon,
    CouponRedemption,
    auth,
    admin,
    fail,
    clean,
    audit,
    notify,
    publicPlan,
  } = deps;

  // Initialize (or re-initialize) the Paymob checkout for an attempt. Safe to
  // call repeatedly: the merchant order id is stable and an already-created
  // Paymob order is reused, so a retry never creates a duplicate order.
  async function initCheckoutForAttempt(attempt, user) {
    const merchantOrderId = attempt.merchantOrderId || `usam-${attempt.id}`;
    const checkout = await paymob.initCheckout({
      amountEgp: attempt.amountEgp,
      merchantOrderId,
      existingOrderId: attempt.providerOrderId || undefined,
      billing: {
        email: user.email,
        firstName: user.name?.split(" ")[0],
        lastName: user.name?.split(" ").slice(1).join(" "),
      },
      items: [
        {
          name: attempt.Registration?.Event
            ? `ticket: ${attempt.Registration.Event.title}`.slice(0, 100)
            : attempt.Subscription?.Plan?.code || "membership",
          amount_cents: Math.round(attempt.amountEgp * 100),
          quantity: 1,
        },
      ],
    });
    await attempt.update({
      merchantOrderId,
      providerOrderId: String(checkout.orderId),
      status: "pending",
    });
    return checkout;
  }
  // Exposed to server/index.js (POST /subscriptions) via the shared deps bag.
  deps.initCheckoutForAttempt = initCheckoutForAttempt;

  // Billing history for the signed-in member.
  app.get("/api/v1/payments/mine", auth, async (req, res, next) => {
    try {
      const rows = await PaymentAttempt.findAll({
        where: { UserId: req.user.id },
        include: [
          { model: Subscription, include: [Plan] },
          { model: Registration, include: [{ model: Event, attributes: ["id", "title", "startsAt"] }] },
          { model: CouponRedemption, include: [{ model: Coupon, attributes: ["code"] }], required: false },
        ],
        order: [["createdAt", "DESC"]],
        limit: 50,
      });
      res.json({
        items: rows.map((p) => ({
          coupon: p.CouponRedemption
            ? {
                code: p.CouponRedemption.Coupon?.code,
                originalEgp: p.CouponRedemption.originalEgp,
                discountEgp: p.CouponRedemption.discountEgp,
              }
            : null,
          event: p.Registration?.Event
            ? { id: p.Registration.Event.id, title: p.Registration.Event.title, startsAt: p.Registration.Event.startsAt }
            : null,
          id: p.id,
          amountEgp: p.amountEgp,
          currency: p.currency,
          status: p.status,
          refundedAmountEgp: p.refundedAmountEgp,
          createdAt: p.createdAt,
          plan: p.Subscription?.Plan
            ? { code: p.Subscription.Plan.code, nameAr: p.Subscription.Plan.nameAr, nameEn: p.Subscription.Plan.nameEn }
            : null,
          billingCycle: p.Subscription?.billingCycle || null,
        })),
      });
    } catch (e) {
      next(e);
    }
  });

  // Admin: paginated payment ledger with optional status filter.
  app.get("/api/v1/admin/payments", auth, admin, async (req, res, next) => {
    try {
      const page = Math.max(1, Number(req.query.page) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize) || 25));
      // Allow-listed against the real ENUM values (see the matching note in
      // account.js's /admin/outbox - same class of bug, same fix).
      const status = ["created", "pending", "paid", "failed", "refunded", "canceled"].includes(req.query.status)
        ? req.query.status
        : null;
      const where = status ? { status } : {};
      const { rows, count } = await PaymentAttempt.findAndCountAll({
        where,
        include: [
          { model: User, attributes: ["id", "name", "email"] },
          { model: Subscription, include: [Plan] },
          { model: Registration, include: [{ model: Event, attributes: ["id", "title"] }] },
        ],
        order: [["createdAt", "DESC"]],
        limit: pageSize,
        offset: (page - 1) * pageSize,
      });
      res.json({
        items: rows.map((p) => ({
          id: p.id,
          amountEgp: p.amountEgp,
          status: p.status,
          failureCode: p.failureCode,
          refundedAmountEgp: p.refundedAmountEgp,
          providerTransactionId: p.providerTransactionId,
          merchantOrderId: p.merchantOrderId,
          createdAt: p.createdAt,
          user: p.User,
          plan: p.Subscription?.Plan ? publicPlan(p.Subscription.Plan) : null,
          event: p.Registration?.Event ? { id: p.Registration.Event.id, title: p.Registration.Event.title } : null,
        })),
        page,
        pageSize,
        total: count,
        totalPages: Math.ceil(count / pageSize),
      });
    } catch (e) {
      next(e);
    }
  });

  // Expose provider configuration state so the frontend can show the right UI.
  app.get("/api/v1/payments/config", (req, res) => {
    res.json({
      provider: "paymob",
      configured: paymob.isConfigured(),
      currency: config.paymob.currency,
      iframeId: config.paymob.iframeId || null,
    });
  });

  // Initialize a live checkout for an existing pending PaymentAttempt.
  app.post(
    "/api/v1/payments/checkout/:attemptId",
    auth,
    async (req, res, next) => {
      try {
        const attempt = await PaymentAttempt.findOne({
          where: { id: req.params.attemptId, UserId: req.user.id },
          include: [
            { model: Subscription, include: [Plan] },
            { model: Registration, include: [Event] },
          ],
        });
        if (!attempt) return fail(res, 404, "payment_attempt_not_found");
        if (!["created", "pending"].includes(attempt.status))
          return fail(res, 409, "payment_not_pending");
        if (
          attempt.RegistrationId &&
          (attempt.Registration?.status !== "pending_payment" ||
            !(attempt.Registration.paymentExpiresAt > new Date()))
        )
          return fail(res, 409, "seat_hold_expired");

        if (!paymob.isConfigured()) {
          // Honest response: we do not fake a checkout.
          return res.status(202).json({
            configured: false,
            status: attempt.status,
            message: "payment_provider_activation_required",
          });
        }

        const checkout = await initCheckoutForAttempt(attempt, req.user);
        await audit(req, "init_checkout", "payment_attempt", attempt.id, attempt.merchantOrderId);
        res.json({
          configured: true,
          checkoutUrl: checkout.checkoutUrl,
          orderId: checkout.orderId,
        });
      } catch (e) {
        if (e.code === "not_configured")
          return res.status(202).json({
            configured: false,
            message: "payment_provider_activation_required",
          });
        logger.error("payments.checkout_failed", { error: String(e) });
        return fail(res, 502, "payment_initialization_failed");
      }
    },
  );

  // Paymob server-to-server webhook. Verifies HMAC, dedupes, activates.
  app.post("/api/v1/payments/webhook/paymob", async (req, res, next) => {
    try {
      const providedHmac = req.query.hmac || req.body?.hmac;
      const valid = paymob.verifyHmac(req.body, providedHmac);
      if (!valid) {
        logger.warn("payments.webhook_bad_hmac", {});
        return fail(res, 400, "invalid_signature");
      }
      const txn = req.body.obj || req.body;
      const eventId = String(txn.id || "");
      if (!eventId) return fail(res, 400, "missing_transaction_id");

      // Idempotent dedupe: unique (provider, eventId).
      const [event, created] = await WebhookEvent.findOrCreate({
        where: { provider: "paymob", eventId },
        defaults: {
          type: txn.success ? "transaction.success" : "transaction.failed",
          payload: JSON.stringify(req.body).slice(0, 60000),
          status: "received",
        },
      });
      if (!created && event.status === "processed") {
        return res.json({ ok: true, deduped: true });
      }

      const merchantOrderId =
        txn.order?.merchant_order_id || txn.merchant_order_id;
      const attempt = merchantOrderId
        ? await PaymentAttempt.findOne({
            where: { merchantOrderId },
            include: [Subscription, { model: Registration, include: [Event] }],
          })
        : null;

      if (!attempt) {
        await event.update({ status: "ignored", error: "no_matching_attempt" });
        return res.json({ ok: true, matched: false });
      }

      // A refund/void callback must never be treated as a fresh successful
      // payment (that would re-activate a subscription Paymob is telling us
      // was refunded). Record it and cancel locally if not already done.
      const isRefundOrVoid = truthy(txn.is_refunded) || truthy(txn.is_voided);
      if (isRefundOrVoid) {
        const ids = JSON.parse(attempt.refundTransactionIds || "[]");
        if (!ids.includes(eventId)) {
          ids.push(eventId);
          await attempt.update({
            status: "refunded",
            refundedAmountEgp: attempt.amountEgp,
            refundedAt: new Date(),
            refundTransactionIds: JSON.stringify(ids),
          });
          if (attempt.SubscriptionId)
            await Subscription.update(
              { status: "canceled", canceledAt: new Date() },
              { where: { id: attempt.SubscriptionId } },
            );
          if (attempt.RegistrationId)
            await Registration.update(
              { status: "cancelled" },
              { where: { id: attempt.RegistrationId } },
            );
        }
        await event.update({ status: "processed", type: "transaction.refunded" });
        return res.json({ ok: true, refunded: true });
      }

      // Non-final callbacks (e.g. awaiting 3DS/bank): no state change yet.
      if (truthy(txn.pending) && !truthy(txn.success)) {
        await event.update({ status: "ignored", error: "pending" });
        return res.json({ ok: true, pending: true });
      }

      if (truthy(txn.success)) {
        // Never trust that a "success" is for the right amount. A signed
        // webhook proves Paymob sent it, not that it matches this order, so
        // verify amount + currency against what we asked to charge. On a
        // mismatch we refuse to activate and flag the attempt for review.
        const expectedCents = Math.round(attempt.amountEgp * 100);
        if (
          Number(txn.amount_cents) !== expectedCents ||
          String(txn.currency || "").toUpperCase() !== config.paymob.currency
        ) {
          logger.error("payments.amount_mismatch", {
            attemptId: attempt.id,
            expectedCents,
            gotCents: Number(txn.amount_cents),
            currency: txn.currency,
          });
          await attempt.update({
            failureCode: "amount_mismatch",
            providerTransactionId: eventId,
            rawResult: JSON.stringify(txn).slice(0, 8000),
          });
          await event.update({ status: "error", error: "amount_mismatch" });
          return res.json({ ok: true, flagged: "amount_mismatch" });
        }
        await activateFromPayment(
          deps,
          attempt,
          txn,
        );
        await event.update({ status: "processed" });
        // Event tickets notify inside confirmTicketFromPayment.
        if (attempt.SubscriptionId) try {
          const user = await User.findByPk(attempt.UserId);
          const sub = await Subscription.findByPk(attempt.SubscriptionId, {
            include: [Plan],
          });
          if (user)
            await enqueueEmail(user.email, "subscriptionActive", {
              name: user.name,
              planName: sub?.Plan?.nameEn || "membership",
              endsAt: sub?.endsAt,
            });
          if (user) await notify(user.id, "subscription_active", "Your USAM membership is active", "/billing");
        } catch (notifyErr) {
          logger.warn("payments.notify_failed", { error: String(notifyErr) });
        }
      } else {
        // A failure callback for an already-paid attempt (e.g. a late/duplicate
        // retry) must not clobber a confirmed payment.
        if (attempt.status !== "paid") {
          await attempt.update({
            status: "failed",
            failureCode: String(txn.data?.message || txn.error_occured || "declined").slice(0, 100),
            providerTransactionId: eventId,
            rawResult: JSON.stringify(txn).slice(0, 8000),
          });
        }
        await event.update({ status: "processed" });
        try {
          const user = await User.findByPk(attempt.UserId);
          const sub = attempt.SubscriptionId
            ? await Subscription.findByPk(attempt.SubscriptionId, { include: [Plan] })
            : null;
          const ev = attempt.Registration?.Event;
          if (user)
            await enqueueEmail(user.email, "paymentFailed", {
              name: user.name,
              planName: ev ? `ticket: ${ev.title}` : sub?.Plan?.nameEn || "membership",
            });
        } catch {}
      }
      res.json({ ok: true });
    } catch (e) {
      logger.error("payments.webhook_error", { error: String(e) });
      next(e);
    }
  });

  // Admin: refund a paid attempt. Records the refund; calls Paymob when live.
  app.post(
    "/api/v1/admin/payments/:id/refund",
    auth,
    admin,
    async (req, res, next) => {
      try {
        const attempt = await PaymentAttempt.findByPk(req.params.id, {
          include: [Subscription],
        });
        if (!attempt) return fail(res, 404, "not_found");
        if (attempt.status !== "paid")
          return fail(res, 409, "attempt_not_refundable");
        const amount = Number(req.body.amountEgp) || attempt.amountEgp;
        if (amount <= 0 || amount > attempt.amountEgp - attempt.refundedAmountEgp)
          return fail(res, 400, "invalid_refund_amount");
        // Two-person rule: this only files a request; a different admin
        // approves it in /admin/approvals (server/approvals.js).
        await deps.requestApproval(req, res, {
          action: "refund_payment",
          targetType: "payment_attempt",
          targetId: attempt.id,
          payload: { amountEgp: amount, paidEgp: attempt.amountEgp, memberId: attempt.UserId },
        });
      } catch (e) {
        next(e);
      }
    },
  );

  // Refund `amount` EGP of a paid attempt: provider first (when live), then
  // local bookkeeping in one transaction, then the member email + audit.
  // Shared by the admin refund route and event cancellation.
  async function issueRefund(attempt, amount, req) {
    // Call the real Paymob refund API when configured. If it fails, the
    // whole request fails — we never record a refund we did not actually
    // issue with the provider. If Paymob is not configured there was
    // never a real charge to refund, so proceed with the local-only
    // bookkeeping path (keeps the sandbox/manual-activation flow usable).
    let providerResult = null;
    if (paymob.isConfigured() && attempt.providerTransactionId) {
      try {
        providerResult = await paymob.refundTransaction({
          transactionId: attempt.providerTransactionId,
          amountEgp: amount,
        });
        if (providerResult?.success === false) {
          return { ok: false, error: "provider_refund_rejected" };
        }
      } catch (err) {
        logger.error("payments.refund_failed", { error: String(err), attemptId: attempt.id });
        return { ok: false, error: "provider_refund_failed" };
      }
    }

    const refundIds = JSON.parse(attempt.refundTransactionIds || "[]");
    if (providerResult?.id) refundIds.push(String(providerResult.id));
    const refundedTotal = attempt.refundedAmountEgp + amount;
    const fullyRefunded = refundedTotal >= attempt.amountEgp;
    await sequelize.transaction(async (t) => {
      await attempt.update(
        {
          refundedAmountEgp: refundedTotal,
          status: fullyRefunded ? "refunded" : "paid",
          refundedAt: new Date(),
          refundTransactionIds: JSON.stringify(refundIds),
        },
        { transaction: t },
      );
      // Only a FULL refund revokes membership; a partial refund (e.g. a
      // goodwill credit) leaves the subscription active.
      if (fullyRefunded && attempt.SubscriptionId) {
        await Subscription.update(
          { status: "canceled", canceledAt: new Date() },
          { where: { id: attempt.SubscriptionId }, transaction: t },
        );
      }
      // A fully refunded event ticket releases the seat.
      if (fullyRefunded && attempt.RegistrationId) {
        await Registration.update(
          { status: "cancelled" },
          { where: { id: attempt.RegistrationId }, transaction: t },
        );
      }
    });
    try {
      const member = await User.findByPk(attempt.UserId);
      if (member)
        await enqueueEmail(member.email, "refundIssued", {
          name: member.name,
          amountEgp: amount,
        });
    } catch (mailErr) {
      logger.warn("payments.refund_email_failed", { error: String(mailErr) });
    }
    await audit(
      req,
      "refund_payment",
      "payment_attempt",
      attempt.id,
      `${amount}${providerResult ? ":provider_confirmed" : ":local_only"}`,
    );
    return {
      ok: true,
      refundedAmountEgp: refundedTotal,
      providerConfirmed: !!providerResult,
    };
  }
  deps.issueRefund = issueRefund;

  // Reconciliation: re-check a pending attempt directly with Paymob. Covers
  // a webhook that never arrived (network blip, Paymob retry exhaustion).
  // Admin-triggered for now; safe to also run on a schedule later.
  app.post(
    "/api/v1/admin/payments/:id/reconcile",
    auth,
    admin,
    async (req, res, next) => {
      try {
        const attempt = await PaymentAttempt.findByPk(req.params.id, {
          include: [Subscription],
        });
        if (!attempt) return fail(res, 404, "not_found");
        if (!paymob.isConfigured())
          return res.status(202).json({ configured: false });
        if (!attempt.merchantOrderId)
          return fail(res, 409, "no_provider_order");

        const txn = await paymob.inquireByMerchantOrderId(attempt.merchantOrderId);
        if (!txn) return res.json({ ok: true, found: false });

        const reconSuccess = truthy(txn.success) && !truthy(txn.is_refunded) && !truthy(txn.is_voided);
        if (reconSuccess && attempt.status !== "paid") {
          // Same safeguard as the webhook: never activate on a mismatch.
          if (
            Number(txn.amount_cents) !== Math.round(attempt.amountEgp * 100) ||
            String(txn.currency || "").toUpperCase() !== config.paymob.currency
          ) {
            await attempt.update({ failureCode: "amount_mismatch" });
            return fail(res, 409, "amount_mismatch");
          }
          await activateFromPayment(
            deps,
            attempt,
            txn,
          );
        } else if (txn.success === false && attempt.status === "pending") {
          await attempt.update({
            status: "failed",
            providerTransactionId: String(txn.id || ""),
            rawResult: JSON.stringify(txn).slice(0, 8000),
          });
        }
        await audit(req, "reconcile_payment", "payment_attempt", attempt.id, String(txn.success));
        res.json({ ok: true, found: true, providerStatus: txn.success, localStatus: attempt.status });
      } catch (e) {
        logger.error("payments.reconcile_failed", { error: String(e) });
        next(e);
      }
    },
  );
}

// Activate the subscription linked to a paid attempt. Idempotent: if the
// attempt is already paid, do nothing.
async function activateFromPayment(deps, attempt, txn) {
  const { sequelize, Subscription, PaymentAttempt, Op } = deps;
  if (attempt.RegistrationId) return confirmTicketFromPayment(deps, attempt, txn);
  // Idempotent, and never resurrect a refunded payment.
  if (attempt.status === "paid" || attempt.status === "refunded") return;
  const sub = await Subscription.findByPk(attempt.SubscriptionId);
  if (!sub) return;
  const endsAt = new Date();
  endsAt.setMonth(endsAt.getMonth() + (sub.billingCycle === "yearly" ? 12 : 1));
  await sequelize.transaction(async (t) => {
    // Cancel any other active subscription for this user.
    await Subscription.update(
      { status: "canceled", canceledAt: new Date() },
      {
        where: {
          UserId: sub.UserId,
          status: "active",
          id: { [Op.ne]: sub.id },
        },
        transaction: t,
      },
    );
    await sub.update(
      { status: "active", startsAt: new Date(), endsAt, provider: "paymob" },
      { transaction: t },
    );
    await attempt.update(
      {
        status: "paid",
        providerTransactionId: String(txn.id || ""),
        rawResult: JSON.stringify(txn).slice(0, 8000),
      },
      { transaction: t },
    );
    await markCouponRedeemed(deps, attempt.id, t);
  });
}

// Confirm a paid event seat: registration -> registered with a ticket code,
// attempt -> paid. Idempotent. A payment that lands after the seat hold
// expired is still honoured (the member paid), and logged for the organiser.
// Returns the registration on a fresh confirmation, else null.
async function confirmTicketFromPayment(deps, attempt, txn) {
  const { sequelize, PaymentAttempt, Registration, Event, User, notify } = deps;
  if (attempt.status === "paid" || attempt.status === "refunded") return null;
  let confirmed = null;
  await sequelize.transaction(async (t) => {
    const reg = await Registration.findByPk(attempt.RegistrationId, {
      transaction: t,
      lock: t.LOCK.UPDATE,
    });
    if (!reg) return;
    if (reg.status !== "pending_payment" && reg.status !== "registered")
      logger.warn("events.late_payment_honoured", { registrationId: reg.id, was: reg.status });
    const ticketCode = reg.ticketCode || crypto.randomBytes(10).toString("hex").toUpperCase();
    await reg.update(
      { status: "registered", ticketCode, paymentExpiresAt: null },
      { transaction: t },
    );
    await attempt.update(
      {
        status: "paid",
        providerTransactionId: String(txn.id || ""),
        rawResult: JSON.stringify(txn).slice(0, 8000),
      },
      { transaction: t },
    );
    await markCouponRedeemed(deps, attempt.id, t);
    confirmed = reg;
  });
  if (confirmed) {
    try {
      const [user, event] = await Promise.all([
        User.findByPk(confirmed.UserId),
        Event.findByPk(confirmed.EventId),
      ]);
      if (user && event) {
        await enqueueEmail(user.email, "eventTicket", {
          name: user.name,
          eventTitle: event.title,
          startsAt: event.startsAt,
          eventId: event.id,
          ticketCode: confirmed.ticketCode,
        });
        await notify(user.id, "event_ticket", `Your ticket for ${event.title} is confirmed`, `/events/${event.id}`);
      }
    } catch (err) {
      logger.warn("events.ticket_notify_failed", { error: String(err) });
    }
  }
  return confirmed;
}

// -------------------------------------------------------------------------
// Scheduled maintenance (called by the in-process scheduler in jobs.js):
//   1. Reconcile pending attempts older than 10 min with Paymob (recovers a
//      missed webhook). Only when Paymob is configured.
//   2. Expire abandoned pending_payment subscriptions after 24h.
//   3. Expire active paid subscriptions whose term has ended (+ email).
//   4. Send one renewal reminder per term, 7 days before the end.
// All steps are idempotent and bounded per run.
// -------------------------------------------------------------------------
export async function runPaymentMaintenance(d) {
  const { sequelize, Op, User, Plan, Subscription, PaymentAttempt, Registration, notify } = d;
  const deps = d;
  const stats = { reconciled: 0, expiredPending: 0, expiredActive: 0, reminders: 0 };
  const now = new Date();

  if (paymob.isConfigured()) {
    const pending = await PaymentAttempt.findAll({
      where: {
        status: "pending",
        merchantOrderId: { [Op.ne]: null },
        createdAt: { [Op.lt]: new Date(Date.now() - 10 * 60_000) },
      },
      include: [Subscription],
      limit: 20,
    });
    for (const attempt of pending) {
      try {
        const txn = await paymob.inquireByMerchantOrderId(attempt.merchantOrderId);
        if (
          txn &&
          truthy(txn.success) &&
          !truthy(txn.is_refunded) &&
          !truthy(txn.is_voided) &&
          Number(txn.amount_cents) === Math.round(attempt.amountEgp * 100) &&
          String(txn.currency || "").toUpperCase() === config.paymob.currency
        ) {
          await activateFromPayment(deps, attempt, txn);
          stats.reconciled++;
        }
      } catch (err) {
        logger.warn("payments.maintenance_reconcile_failed", { attemptId: attempt.id, error: String(err) });
      }
    }
  }

  // Release paid-event seat holds whose checkout window has passed.
  stats.releasedHolds = 0;
  if (Registration) {
    const holds = await Registration.findAll({
      where: { status: "pending_payment", paymentExpiresAt: { [Op.lt]: now } },
      attributes: ["id"],
      limit: 500,
    });
    if (holds.length) {
      const ids = holds.map((r) => r.id);
      await Registration.update({ status: "cancelled" }, { where: { id: { [Op.in]: ids }, status: "pending_payment" } });
      await PaymentAttempt.update(
        { status: "canceled" },
        { where: { RegistrationId: { [Op.in]: ids }, status: { [Op.in]: ["created", "pending"] } } },
      );
      stats.releasedHolds = ids.length;
    }
  }

  const stale = await Subscription.findAll({
    where: { status: "pending_payment", createdAt: { [Op.lt]: new Date(Date.now() - 24 * 3600_000) } },
    attributes: ["id"],
    limit: 200,
  });
  if (stale.length) {
    const ids = stale.map((s) => s.id);
    await Subscription.update({ status: "expired" }, { where: { id: { [Op.in]: ids } } });
    await PaymentAttempt.update(
      { status: "canceled" },
      { where: { SubscriptionId: { [Op.in]: ids }, status: { [Op.in]: ["created", "pending", "failed"] } } },
    );
    stats.expiredPending = ids.length;
  }

  const ended = await Subscription.findAll({
    // Every paid-plan term ends, including ones granted by a 100% coupon.
    where: { status: "active", endsAt: { [Op.lt]: now } },
    include: [Plan, User],
    limit: 200,
  });
  for (const sub of ended) {
    await sub.update({ status: "expired" });
    stats.expiredActive++;
    if (sub.User) {
      await enqueueEmail(sub.User.email, "subscriptionExpired", {
        name: sub.User.name,
        planName: sub.Plan?.nameEn || "membership",
      });
      await notify(sub.User.id, "subscription_expired", "Your USAM membership has ended", "/pricing");
    }
  }

  const soon = await Subscription.findAll({
    where: {
      status: "active",
      renewalReminderSentAt: null,
      endsAt: { [Op.gt]: now, [Op.lt]: new Date(Date.now() + 7 * 86400_000) },
    },
    include: [Plan, User],
    limit: 200,
  });
  for (const sub of soon) {
    await sub.update({ renewalReminderSentAt: now });
    stats.reminders++;
    if (sub.User) {
      await enqueueEmail(sub.User.email, "subscriptionRenewal", {
        name: sub.User.name,
        planName: sub.Plan?.nameEn || "membership",
        endsAt: sub.endsAt,
      });
      await notify(sub.User.id, "subscription_renewal", "Your USAM membership ends soon", "/billing");
    }
  }
  return stats;
}

export default { registerPaymentRoutes, runPaymentMaintenance };
