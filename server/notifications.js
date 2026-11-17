// -------------------------------------------------------------------------
// Notification digest job.
//
// notify() (server/index.js) sends immediately when a member's preference is
// email=true & digest=off. For digest="daily"/"weekly" members, this job
// runs on a schedule and groups everything created since lastDigestAt into
// one email, respecting the chosen cadence.
// -------------------------------------------------------------------------
import { Op } from "sequelize";
import { enqueueEmail } from "./jobs.js";
import { logger } from "./logger.js";

const CADENCE_MS = { daily: 24 * 3600_000, weekly: 7 * 24 * 3600_000 };

export async function runNotificationDigests({ User, Notification, NotificationPreference }) {
  const now = new Date();
  const stats = { daily: 0, weekly: 0 };
  for (const cadence of ["daily", "weekly"]) {
    const dueBefore = new Date(now.getTime() - CADENCE_MS[cadence]);
    const prefs = await NotificationPreference.findAll({
      where: {
        digest: cadence,
        email: true,
        [Op.or]: [{ lastDigestAt: null }, { lastDigestAt: { [Op.lt]: dueBefore } }],
      },
      include: [{ model: User, attributes: ["id", "name", "email", "isDeleted", "status"] }],
      limit: 500,
    });
    for (const pref of prefs) {
      const member = pref.User;
      if (!member || member.isDeleted || member.status !== "active") continue;
      const since = pref.lastDigestAt || new Date(now.getTime() - CADENCE_MS[cadence]);
      const items = await Notification.findAll({
        where: { UserId: member.id, createdAt: { [Op.gt]: since } },
        order: [["createdAt", "DESC"]],
        limit: 25,
      });
      // Always advance the window, even with nothing to send, so a quiet
      // member doesn't accumulate an ever-growing backlog query.
      await pref.update({ lastDigestAt: now });
      if (!items.length) continue;
      try {
        await enqueueEmail(member.email, "digest", { name: member.name, items });
        stats[cadence]++;
      } catch (err) {
        logger.warn("digest.enqueue_failed", { userId: member.id, error: String(err) });
      }
    }
  }
  return stats;
}

export default { runNotificationDigests };
