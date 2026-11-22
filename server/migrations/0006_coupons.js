// 0006_coupons
// Coupons + CouponRedemptions tables (created from the model definitions with
// CREATE TABLE IF NOT EXISTS + their indexes). No-op on a fresh database that
// the 0001 baseline already created from the current models.
import { Coupon, CouponRedemption } from "../db.js";

export const name = "0006_coupons";

export async function up() {
  await Coupon.sync();
  await CouponRedemption.sync();
}

export async function down(qi, Sequelize, t) {
  await qi.dropTable("CouponRedemptions", { transaction: t });
  await qi.dropTable("Coupons", { transaction: t });
}
