// -------------------------------------------------------------------------
// Data-retention housekeeping (scheduled daily). Bounds table growth and
// implements the retention policy documented in PRODUCTION_DEPLOYMENT_GUIDE.md:
//
//   Sessions            expired > 1 day ago               -> deleted
//   VerificationTokens  expired/consumed > 7 days ago     -> deleted
//   OutboxMessages      delivered ("sent") > 30 days ago  -> deleted
//                       (failed/dead rows are KEPT for inspection)
//   WebhookEvents       processed/ignored > 180 days ago  -> deleted
//                       (kept long enough for payment disputes/reconcile)
//   Notifications       read > 180 days ago               -> deleted
//   MediaAssets         never attached to a post > 1 day  -> file + row deleted
//   Deleted accounts    deletedAt > 30 days ago           -> remaining personal
//                       records deleted, credentials destroyed (purgedAt set)
//
// AuditLog rows are intentionally never deleted here.
// -------------------------------------------------------------------------
import { Op } from "sequelize";
import crypto from "node:crypto";
import { destroyAssets } from "./media.js";

const DAY = 86_400_000;
export const PURGE_AFTER_DAYS = 30;

export async function runHousekeeping({
  Session,
  VerificationToken,
  OutboxMessage,
  WebhookEvent,
  Notification,
  MediaAsset,
  User,
  models,
}) {
  const now = Date.now();
  const ago = (days) => new Date(now - days * DAY);
  const [sessions, tokens, outbox, webhooks, notifications] = await Promise.all([
    Session.destroy({ where: { expiresAt: { [Op.lt]: ago(1) } } }),
    VerificationToken.destroy({
      where: {
        [Op.or]: [
          { expiresAt: { [Op.lt]: ago(7) } },
          { consumedAt: { [Op.lt]: ago(7) } },
        ],
      },
    }),
    OutboxMessage.destroy({
      where: { status: "sent", updatedAt: { [Op.lt]: ago(30) } },
    }),
    WebhookEvent.destroy({
      where: {
        status: { [Op.in]: ["processed", "ignored"] },
        updatedAt: { [Op.lt]: ago(180) },
      },
    }),
    Notification.destroy({
      where: { readAt: { [Op.lt]: ago(180) } },
    }),
  ]);

  // Uploaded images never attached to a post within a day -> file + row.
  let orphanImages = 0;
  if (MediaAsset) {
    const orphans = await MediaAsset.findAll({
      where: { PostId: null, createdAt: { [Op.lt]: ago(1) } },
      limit: 500,
    });
    await destroyAssets(orphans);
    orphanImages = orphans.length;
  }

  // Deleted accounts: identifying data was cleared at deletion time. After
  // the PURGE_AFTER_DAYS grace window (support/dispute period), remove the
  // remaining personal records and make the row unusable for good. Posts the
  // member chose to keep stay attributed to "Deleted member"; payment
  // records stay for accounting/tax retention.
  let purgedAccounts = 0;
  if (User && models) {
    const due = await User.findAll({
      where: { isDeleted: true, deletedAt: { [Op.lt]: ago(PURGE_AFTER_DAYS) }, purgedAt: null },
      attributes: ["id"],
      limit: 200,
    });
    for (const { id } of due) {
      await models.Notification.destroy({ where: { UserId: id } });
      await models.NotificationPreference.destroy({ where: { UserId: id } });
      await models.Bookmark.destroy({ where: { UserId: id } });
      await models.Reaction.destroy({ where: { UserId: id } });
      await models.VerificationToken.destroy({ where: { UserId: id } });
      await models.Session.destroy({ where: { UserId: id } });
      await destroyAssets(await models.MediaAsset.findAll({ where: { UserId: id, PostId: null } }));
      await User.update(
        {
          username: `deleted-${id.slice(0, 8)}-${crypto.randomBytes(3).toString("hex")}`,
          passwordHash: `!purged:${crypto.randomBytes(16).toString("hex")}`,
          googleId: null,
          purgedAt: new Date(),
        },
        { where: { id } },
      );
      purgedAccounts++;
    }
  }
  return { sessions, tokens, outbox, webhooks, notifications, orphanImages, purgedAccounts };
}

export default { runHousekeeping };
