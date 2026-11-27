// 0007_approval_requests
// ApprovalRequests table (two-person rule for manual activation + refunds),
// created from the model definition with CREATE TABLE IF NOT EXISTS + its
// indexes. Additive only. No-op on a fresh database that the 0001 baseline
// already created from the current models.
import { ApprovalRequest } from "../db.js";

export const name = "0007_approval_requests";

export async function up() {
  await ApprovalRequest.sync();
}

export async function down(qi, Sequelize, t) {
  await qi.dropTable("ApprovalRequests", { transaction: t });
}
