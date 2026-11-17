// 0005_media_assets
// - MediaAssets table for member-uploaded post images (created from the model
//   definition: CREATE TABLE IF NOT EXISTS + its indexes).
// - Users.purgedAt: set when a deleted account's remaining personal records
//   are purged after the grace window (housekeeping.js).
// Both steps are no-ops on a fresh database built by the 0001 baseline.
import { MediaAsset } from "../db.js";

export const name = "0005_media_assets";

export async function up(qi, Sequelize, t) {
  await MediaAsset.sync();
  const users = await qi.describeTable("Users");
  if (!users.purgedAt)
    await qi.addColumn("Users", "purgedAt", { type: Sequelize.DATE }, { transaction: t });
}

export async function down(qi, Sequelize, t) {
  const users = await qi.describeTable("Users");
  if (users.purgedAt) await qi.removeColumn("Users", "purgedAt", { transaction: t });
  await qi.dropTable("MediaAssets", { transaction: t });
}
