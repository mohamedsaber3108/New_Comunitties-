// -------------------------------------------------------------------------
// Coupons / promo codes.
//
//   POST /api/v1/coupons/quote             (member) price preview for a code
//   GET  /api/v1/admin/coupons             (admin)  list + live usage + totals
//   POST /api/v1/admin/coupons             (admin)  create
//   PATCH /api/v1/admin/coupons/:id        (admin)  activate/deactivate, limits, dates
//   GET  /api/v1/admin/coupons/:id/redemptions (admin)
//
// Used by POST /subscriptions and paid event registration (index.js) through
// quoteCoupon() + reserveCoupon(), and by payment confirmation (payments.js)
// through markCouponRedeemed().
//
// Rules:
//   - discount computed server-side from the coupon + the server-side price
//   - limits (total + per member) count "redeemed" uses plus "reserved" uses
//     whose payment is still open, checked inside a transaction with the
//     coupon row locked, so parallel checkouts cannot over-redeem
//   - a code that would make a paid item free (100%) activates directly
//     (no payment provider involved) and is recorded as redeemed
//   - codes are case-insensitive; guessing is rate limited
// -------------------------------------------------------------------------
import { createLimiter } from "./ratelimit.js";
import { config } from "./config.js";

// Guardrails (P-05). A full grant (final price 0) is a scholarship and is
// allowed; any discount that still leaves something to pay must stay within
// the cap and keep the price at or above the floor.
export function checkGuardrails(baseAmount, discountEgp) {
  const finalEgp = baseAmount - discountEgp;
  if (finalEgp <= 0) return null;
  const { maxDiscountPct, priceFloorEgp } = config.coupons;
  if (discountEgp * 100 > baseAmount * maxDiscountPct) return "coupon_above_cap";
  if (discountEgp > 0 && finalEgp < priceFloorEgp) return "coupon_below_floor";
  return null;
}

const CODE_RE = /^[A-Z0-9][A-Z0-9_-]{2,39}$/;
export const normalizeCode = (v) => String(v || "").trim().toUpperCase();

// Live usage for one or more coupons: { total, byUser } maps.
async function usage(models, couponIds, userId, transaction) {
  const { CouponRedemption, PaymentAttempt, Op } = models;
  const rows = await CouponRedemption.findAll({
    where: { CouponId: { [Op.in]: couponIds } },
    include: [{ model: PaymentAttempt, attributes: ["status"], required: false }],
    attributes: ["CouponId", "UserId", "status", "PaymentAttemptId", "discountEgp"],
    transaction,
  });
  const live = rows.filter(
    (r) =>
      r.status === "redeemed" ||
      (r.status === "reserved" && ["created", "pending"].includes(r.PaymentAttempt?.status)),
  );
  const total = new Map(), mine = new Map(), redeemed = new Map(), discount = new Map();
  for (const r of live) {
    total.set(r.CouponId, (total.get(r.CouponId) || 0) + 1);
    if (userId && r.UserId === userId) mine.set(r.CouponId, (mine.get(r.CouponId) || 0) + 1);
  }
  for (const r of rows.filter((x) => x.status === "redeemed")) {
    redeemed.set(r.CouponId, (redeemed.get(r.CouponId) || 0) + 1);
    discount.set(r.CouponId, (discount.get(r.CouponId) || 0) + r.discountEgp);
  }
  return { total, mine, redeemed, discount };
}

// target: { kind: "subscription", planCode, cycle } | { kind: "event", eventId }
// Returns { ok:true, coupon, originalEgp, discountEgp, finalEgp } or { ok:false, error }.
export async function quoteCoupon(models, { code, user, target, baseAmount }, transaction) {
  const { Coupon } = models;
  const normalized = normalizeCode(code);
  if (!CODE_RE.test(normalized)) return { ok: false, error: "coupon_invalid" };
  const coupon = await Coupon.findOne({
    where: { code: normalized },
    transaction,
    ...(transaction ? { lock: transaction.LOCK.UPDATE } : {}),
  });
  if (!coupon || !coupon.active) return { ok: false, error: "coupon_invalid" };
  const now = new Date();
  if (coupon.startsAt && coupon.startsAt > now) return { ok: false, error: "coupon_not_started" };
  if (coupon.expiresAt && coupon.expiresAt <= now) return { ok: false, error: "coupon_expired" };
  if (coupon.appliesTo !== "any" && coupon.appliesTo !== target.kind)
    return { ok: false, error: "coupon_not_applicable" };
  if (target.kind === "subscription") {
    const plans = JSON.parse(coupon.planCodes || "[]");
    if (plans.length && !plans.includes(target.planCode)) return { ok: false, error: "coupon_not_applicable" };
    if (coupon.billingCycle !== "any" && coupon.billingCycle !== target.cycle)
      return { ok: false, error: "coupon_not_applicable" };
  }
  if (!(baseAmount > 0)) return { ok: false, error: "coupon_not_applicable" };
  const u = await usage(models, [coupon.id], user.id, transaction);
  if (coupon.maxRedemptions != null && (u.total.get(coupon.id) || 0) >= coupon.maxRedemptions)
    return { ok: false, error: "coupon_exhausted" };
  if ((u.mine.get(coupon.id) || 0) >= (coupon.perUserLimit || 1))
    return { ok: false, error: "coupon_already_used" };
  const discountEgp =
    coupon.discountType === "percent"
      ? Math.min(baseAmount, Math.floor((baseAmount * coupon.value) / 100))
      : Math.min(baseAmount, coupon.value);
  // Checked at every quote and again inside the checkout transaction, so a
  // code created before the cap, or a price change, cannot slip past it.
  const guard = checkGuardrails(baseAmount, discountEgp);
  if (guard) return { ok: false, error: guard };
  return {
    ok: true,
    coupon,
    originalEgp: baseAmount,
    discountEgp,
    finalEgp: baseAmount - discountEgp,
  };
}

// Record the use inside the caller's transaction.
export async function reserveCoupon(models, quote, { user, target, paymentAttemptId, subscriptionId, registrationId, redeemed }, transaction) {
  return models.CouponRedemption.create(
    {
      CouponId: quote.coupon.id,
      UserId: user.id,
      status: redeemed ? "redeemed" : "reserved",
      target: target.kind,
      originalEgp: quote.originalEgp,
      discountEgp: quote.discountEgp,
      finalEgp: quote.finalEgp,
      PaymentAttemptId: paymentAttemptId || null,
      SubscriptionId: subscriptionId || null,
      RegistrationId: registrationId || null,
    },
    { transaction },
  );
}

// Payment confirmed -> the reserved use becomes a redemption.
export async function markCouponRedeemed(models, paymentAttemptId, transaction) {
  if (!models.CouponRedemption) return;
  await models.CouponRedemption.update(
    { status: "redeemed" },
    { where: { PaymentAttemptId: paymentAttemptId, status: "reserved" }, transaction },
  );
}

const quoteLimiter = createLimiter({
  windowMs: 10 * 60_000,
  max: Number(process.env.RATE_LIMIT_COUPON_PER_10MIN || 30),
  name: "coupon",
  // Per member (the route requires sign-in), so a shared office IP is not
  // throttled as one person, while one account cannot brute-force codes.
  key: (req) => req.user?.id || req.ip,
});

const publicCoupon = (c, u) => ({
  id: c.id,
  code: c.code,
  description: c.description,
  discountType: c.discountType,
  value: c.value,
  appliesTo: c.appliesTo,
  planCodes: JSON.parse(c.planCodes || "[]"),
  billingCycle: c.billingCycle,
  maxRedemptions: c.maxRedemptions,
  perUserLimit: c.perUserLimit,
  startsAt: c.startsAt,
  expiresAt: c.expiresAt,
  active: c.active,
  createdAt: c.createdAt,
  ...(u
    ? {
        uses: u.total.get(c.id) || 0,
        redeemed: u.redeemed.get(c.id) || 0,
        discountGivenEgp: u.discount.get(c.id) || 0,
      }
    : {}),
});

export function registerCouponRoutes(app, deps) {
  const { sequelize, Op, Plan, Event, Coupon, CouponRedemption, PaymentAttempt, User, auth, admin, requireVerified, fail, clean, audit } = deps;
  const models = { Coupon, CouponRedemption, PaymentAttempt, Op };

  app.post("/api/v1/coupons/quote", auth, requireVerified, quoteLimiter, async (req, res, next) => {
    try {
      let target, baseAmount;
      if (req.body.eventId) {
        const ev = await Event.findOne({ where: { id: String(req.body.eventId), status: "published", priceType: "paid" } }).catch(() => null);
        if (!ev) return fail(res, 404, "event_unavailable");
        target = { kind: "event", eventId: ev.id };
        baseAmount = ev.priceEgp;
      } else {
        const plan = await Plan.findOne({ where: { code: clean(req.body.planCode, 32), active: true } });
        const cycle = clean(req.body.billingCycle, 12);
        if (!plan || !["monthly", "yearly"].includes(cycle)) return fail(res, 400, "invalid_plan");
        target = { kind: "subscription", planCode: plan.code, cycle };
        baseAmount = cycle === "yearly" ? plan.yearlyEgp : plan.monthlyEgp;
      }
      const q = await quoteCoupon(models, { code: req.body.code, user: req.user, target, baseAmount });
      if (!q.ok) return fail(res, 400, q.error);
      res.json({
        code: q.coupon.code,
        description: q.coupon.description,
        originalEgp: q.originalEgp,
        discountEgp: q.discountEgp,
        finalEgp: q.finalEgp,
      });
    } catch (e) {
      next(e);
    }
  });

  // ---- Admin ---------------------------------------------------------------
  // A percent code above the cap is refused at creation, except 100%
  // (a scholarship grant). Fixed codes are checked against the real price
  // at quote time by checkGuardrails.
  const percentAboveCap = (type, value) =>
    type === "percent" && value < 100 && value > config.coupons.maxDiscountPct;

  function parseCouponBody(body, { partial }) {
    const out = {};
    const errors = [];
    if (!partial || body.code !== undefined) {
      const code = normalizeCode(body.code);
      if (!CODE_RE.test(code)) errors.push("code");
      out.code = code;
    }
    if (!partial || body.discountType !== undefined) {
      if (!["percent", "fixed"].includes(body.discountType)) errors.push("discountType");
      out.discountType = body.discountType;
    }
    if (!partial || body.value !== undefined) {
      const v = Number(body.value);
      const type = out.discountType || body.discountType;
      if (!Number.isInteger(v) || v < 1 || (type === "percent" ? v > 100 : v > 100000)) errors.push("value");
      out.value = v;
    }
    if (body.description !== undefined) out.description = clean(body.description, 240);
    if (body.appliesTo !== undefined || !partial) {
      const a = body.appliesTo ?? "any";
      if (!["any", "subscription", "event"].includes(a)) errors.push("appliesTo");
      out.appliesTo = a;
    }
    if (body.billingCycle !== undefined || !partial) {
      const b = body.billingCycle ?? "any";
      if (!["any", "monthly", "yearly"].includes(b)) errors.push("billingCycle");
      out.billingCycle = b;
    }
    if (body.planCodes !== undefined) {
      const list = Array.isArray(body.planCodes) ? body.planCodes.map((x) => clean(String(x), 32)).filter(Boolean) : null;
      if (!list || list.length > 20) errors.push("planCodes");
      else out.planCodes = JSON.stringify([...new Set(list)]);
    }
    for (const k of ["maxRedemptions", "perUserLimit"]) {
      if (body[k] === undefined) continue;
      if (body[k] === null || body[k] === "") {
        if (k === "perUserLimit") errors.push(k);
        else out[k] = null;
        continue;
      }
      const n = Number(body[k]);
      if (!Number.isInteger(n) || n < 1 || n > 1_000_000) errors.push(k);
      else out[k] = n;
    }
    for (const k of ["startsAt", "expiresAt"]) {
      if (body[k] === undefined) continue;
      if (body[k] === null || body[k] === "") { out[k] = null; continue; }
      const d = new Date(body[k]);
      if (isNaN(d)) errors.push(k);
      else out[k] = d;
    }
    if (body.active !== undefined) {
      if (typeof body.active !== "boolean") errors.push("active");
      else out.active = body.active;
    }
    const s = out.startsAt, e = out.expiresAt;
    if (s && e && e <= s) errors.push("expiresAt");
    return { out, errors };
  }

  app.get("/api/v1/admin/coupons", auth, admin, async (req, res, next) => {
    try {
      const rows = await Coupon.findAll({ order: [["createdAt", "DESC"]], limit: 500 });
      const u = rows.length ? await usage(models, rows.map((c) => c.id), null) : null;
      res.json({ items: rows.map((c) => publicCoupon(c, u)) });
    } catch (e) {
      next(e);
    }
  });

  app.post("/api/v1/admin/coupons", auth, admin, async (req, res, next) => {
    try {
      const { out, errors } = parseCouponBody(req.body, { partial: false });
      if (errors.length) return res.status(400).json({ error: "invalid_coupon", fields: errors });
      if (percentAboveCap(out.discountType, out.value)) return fail(res, 400, "coupon_above_cap");
      if (await Coupon.findOne({ where: { code: out.code } })) return fail(res, 409, "coupon_code_taken");
      const c = await Coupon.create(out);
      await audit(req, "create_coupon", "coupon", c.id, `${c.code}:${c.discountType}:${c.value}`);
      res.status(201).json({ item: publicCoupon(c) });
    } catch (e) {
      next(e);
    }
  });

  app.patch("/api/v1/admin/coupons/:id", auth, admin, async (req, res, next) => {
    try {
      const c = await Coupon.findByPk(req.params.id);
      if (!c) return fail(res, 404, "not_found");
      const { out, errors } = parseCouponBody(
        { ...req.body, discountType: req.body.discountType ?? (req.body.value !== undefined ? c.discountType : undefined) },
        { partial: true },
      );
      if (errors.length) return res.status(400).json({ error: "invalid_coupon", fields: errors });
      // Once a code has been used, its code and value are frozen so past
      // receipts keep matching what the coupon said.
      const used = await CouponRedemption.count({ where: { CouponId: c.id } });
      if (used && (out.code !== undefined || out.discountType !== undefined || out.value !== undefined)) {
        if ((out.code ?? c.code) !== c.code || (out.discountType ?? c.discountType) !== c.discountType || (out.value ?? c.value) !== c.value)
          return fail(res, 409, "coupon_in_use_terms_locked");
      }
      if ((out.value !== undefined || out.discountType !== undefined) && percentAboveCap(out.discountType ?? c.discountType, out.value ?? c.value))
        return fail(res, 400, "coupon_above_cap");
      if (out.code && out.code !== c.code && (await Coupon.findOne({ where: { code: out.code } })))
        return fail(res, 409, "coupon_code_taken");
      const s = out.startsAt !== undefined ? out.startsAt : c.startsAt;
      const e = out.expiresAt !== undefined ? out.expiresAt : c.expiresAt;
      if (s && e && e <= s) return res.status(400).json({ error: "invalid_coupon", fields: ["expiresAt"] });
      await c.update(out);
      await audit(req, "update_coupon", "coupon", c.id, JSON.stringify(Object.keys(out)));
      const u = await usage(models, [c.id], null);
      res.json({ item: publicCoupon(c, u) });
    } catch (e) {
      next(e);
    }
  });

  app.get("/api/v1/admin/coupons/:id/redemptions", auth, admin, async (req, res, next) => {
    try {
      const c = await Coupon.findByPk(req.params.id);
      if (!c) return fail(res, 404, "not_found");
      const rows = await CouponRedemption.findAll({
        where: { CouponId: c.id },
        include: [
          { model: User, attributes: ["id", "name", "email"] },
          { model: PaymentAttempt, attributes: ["status"], required: false },
        ],
        order: [["createdAt", "DESC"]],
        limit: 500,
      });
      res.json({
        items: rows.map((r) => ({
          id: r.id,
          member: r.User,
          target: r.target,
          originalEgp: r.originalEgp,
          discountEgp: r.discountEgp,
          finalEgp: r.finalEgp,
          // reserved + closed payment = the checkout was abandoned/failed
          status:
            r.status === "redeemed"
              ? "redeemed"
              : ["created", "pending"].includes(r.PaymentAttempt?.status)
                ? "reserved"
                : "released",
          createdAt: r.createdAt,
        })),
      });
    } catch (e) {
      next(e);
    }
  });
}

export default { registerCouponRoutes, quoteCoupon, reserveCoupon, markCouponRedeemed, normalizeCode };
