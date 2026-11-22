// -------------------------------------------------------------------------
// Platform analytics for admins: GET /api/v1/admin/analytics?days=30
//
// Every number is a count or sum over real rows; nothing is estimated or
// sampled. Periods are rolling windows ending now. Bucketing by day is done
// in JS over the (bounded) rows of the window so the same code is correct on
// SQLite and PostgreSQL.
//
//   growth      new members per day, total / verified / active members
//   revenue     net paid (minus refunds) per day + by source (plans, events),
//               discount given through coupons, refunds
//   engagement  posts, comments, messages, event registrations, check-ins;
//               active members (did anything in the window)
//   segments    members by community, by persona, by current plan, by role
//   funnel      signed up -> verified -> joined a community -> posted -> paid
// -------------------------------------------------------------------------
export function registerAnalyticsRoutes(app, deps) {
  const { sequelize, Op, auth, admin, fail } = deps;
  const M = () => sequelize.models;

  app.get("/api/v1/admin/analytics", auth, admin, async (req, res, next) => {
    try {
      const days = Number.parseInt(req.query.days, 10);
      if (![7, 30, 90].includes(days)) return fail(res, 400, "invalid_period");
      const { User, Post, Comment, Message, Registration, PaymentAttempt, Subscription, Plan, Membership, Community, CouponRedemption } = M();
      const since = new Date(Date.now() - days * 86400_000);
      const inWindow = { createdAt: { [Op.gte]: since } };
      const liveUser = { isDeleted: false };

      const dayKeys = [];
      for (let i = days - 1; i >= 0; i--) dayKeys.push(new Date(Date.now() - i * 86400_000).toISOString().slice(0, 10));
      const bucket = (rows, valueOf = () => 1, dateOf = (r) => r.createdAt) => {
        const m = new Map(dayKeys.map((k) => [k, 0]));
        for (const r of rows) {
          const k = new Date(dateOf(r)).toISOString().slice(0, 10);
          if (m.has(k)) m.set(k, m.get(k) + valueOf(r));
        }
        return dayKeys.map((k) => ({ day: k, value: m.get(k) }));
      };

      const [
        totalMembers, verifiedMembers, newUsers,
        posts, comments, messages, registrations, checkIns,
        paidAttempts, couponRows,
        memberships, communities, activeSubs, roleRows, personaRows,
        joinedIds, postedIds, paidIds,
      ] = await Promise.all([
        User.count({ where: liveUser }),
        User.count({ where: { ...liveUser, emailVerified: true } }),
        User.findAll({ where: { ...liveUser, ...inWindow }, attributes: ["id", "createdAt", "emailVerified"], raw: true }),
        Post.findAll({ where: { ...inWindow, status: "published" }, attributes: ["UserId", "createdAt"], raw: true }),
        Comment.findAll({ where: inWindow, attributes: ["UserId", "createdAt"], raw: true }),
        Message.findAll({ where: inWindow, attributes: ["SenderId", "createdAt"], raw: true }),
        Registration.findAll({ where: { ...inWindow, status: "registered" }, attributes: ["UserId", "createdAt"], raw: true }),
        Registration.count({ where: { checkedInAt: { [Op.gte]: since } } }),
        PaymentAttempt.findAll({
          where: { status: { [Op.in]: ["paid", "refunded"] }, updatedAt: { [Op.gte]: since } },
          attributes: ["amountEgp", "refundedAmountEgp", "SubscriptionId", "RegistrationId", "updatedAt", "UserId"],
          raw: true,
        }),
        CouponRedemption
          ? CouponRedemption.findAll({ where: { ...inWindow, status: "redeemed" }, attributes: ["discountEgp", "createdAt"], raw: true })
          : [],
        Membership.findAll({ attributes: ["CommunityId", "UserId"], raw: true }),
        Community.findAll({ attributes: ["id", "slug", "nameEn", "nameAr"], raw: true }),
        Subscription.findAll({
          where: { status: { [Op.in]: ["active", "free"] }, [Op.or]: [{ endsAt: null }, { endsAt: { [Op.gt]: new Date() } }] },
          include: [{ model: Plan, attributes: ["code"] }],
          attributes: ["UserId", "status"],
        }),
        User.findAll({ where: liveUser, attributes: ["role", [sequelize.fn("COUNT", sequelize.col("id")), "n"]], group: ["role"], raw: true }),
        User.findAll({ where: liveUser, attributes: ["persona", [sequelize.fn("COUNT", sequelize.col("id")), "n"]], group: ["persona"], raw: true }),
        Membership.findAll({ attributes: ["UserId"], group: ["UserId"], raw: true }),
        Post.findAll({ attributes: ["UserId"], group: ["UserId"], raw: true }),
        PaymentAttempt.findAll({ where: { status: "paid" }, attributes: ["UserId"], group: ["UserId"], raw: true }),
      ]);

      const net = (p) => p.amountEgp - (p.refundedAmountEgp || 0);
      const planRevenue = paidAttempts.filter((p) => p.SubscriptionId).reduce((s, p) => s + net(p), 0);
      const eventRevenue = paidAttempts.filter((p) => p.RegistrationId).reduce((s, p) => s + net(p), 0);
      const refunds = paidAttempts.reduce((s, p) => s + (p.refundedAmountEgp || 0), 0);

      const active = new Set([
        ...posts.map((r) => r.UserId),
        ...comments.map((r) => r.UserId),
        ...messages.map((r) => r.SenderId),
        ...registrations.map((r) => r.UserId),
      ]);

      const slugOf = new Map(communities.map((c) => [c.id, c.slug]));
      const byCommunity = {};
      for (const m of memberships) {
        const s = slugOf.get(m.CommunityId);
        if (s) byCommunity[s] = (byCommunity[s] || 0) + 1;
      }
      const byPlan = {};
      const withPlan = new Set();
      for (const s of activeSubs) {
        const code = s.Plan?.code || "unknown";
        byPlan[code] = (byPlan[code] || 0) + 1;
        withPlan.add(s.UserId);
      }
      byPlan.none = Math.max(0, totalMembers - withPlan.size);

      res.json({
        periodDays: days,
        since: since.toISOString(),
        generatedAt: new Date().toISOString(),
        growth: {
          totalMembers,
          verifiedMembers,
          newMembers: newUsers.length,
          newMembersByDay: bucket(newUsers),
        },
        revenue: {
          currency: "EGP",
          netEgp: planRevenue + eventRevenue,
          plansEgp: planRevenue,
          eventsEgp: eventRevenue,
          refundsEgp: refunds,
          couponDiscountEgp: couponRows.reduce((s, r) => s + r.discountEgp, 0),
          payingMembers: new Set(paidAttempts.filter((p) => net(p) > 0).map((p) => p.UserId)).size,
          netByDay: bucket(paidAttempts, net, (p) => p.updatedAt),
        },
        engagement: {
          activeMembers: active.size,
          posts: posts.length,
          comments: comments.length,
          messages: messages.length,
          eventRegistrations: registrations.length,
          eventCheckIns: checkIns,
          postsByDay: bucket(posts),
        },
        segments: {
          byCommunity,
          byPersona: Object.fromEntries(personaRows.map((r) => [r.persona, Number(r.n)])),
          byPlan,
          byRole: Object.fromEntries(roleRows.map((r) => [r.role, Number(r.n)])),
        },
        funnel: {
          signedUp: totalMembers,
          verified: verifiedMembers,
          joinedCommunity: joinedIds.length,
          posted: postedIds.length,
          paid: paidIds.length,
        },
      });
    } catch (e) {
      next(e);
    }
  });
}

export default { registerAnalyticsRoutes };
