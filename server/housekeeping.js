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
//
// AuditLog rows are intentionally never deleted here.
// -------------------------------------------------------------------------
import { Op } from "sequelize";

const DAY = 86_400_000;

export async function runHousekeeping({
  Session,
  VerificationToken,
  OutboxMessage,
  WebhookEvent,
  Notification,
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
  return { sessions, tokens, outbox, webhooks, notifications };
}

export default { runHousekeeping };
