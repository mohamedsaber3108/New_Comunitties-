// 0004_paid_events
// Paid event tickets:
//   Events.priceEgp, Registrations.paymentExpiresAt, PaymentAttempts.RegistrationId
//   + "pending_payment" value for the Registrations.status enum.
// Idempotent: on a fresh database the 0001 baseline already created everything.
export const name = "0004_paid_events";

async function addIfMissing(qi, table, col, def, t) {
  const desc = await qi.describeTable(table);
  if (!desc[col]) await qi.addColumn(table, col, def, { transaction: t });
}

export async function up(qi, Sequelize, t) {
  await addIfMissing(qi, "Events", "priceEgp", { type: Sequelize.INTEGER, defaultValue: 0 }, t);
  await addIfMissing(qi, "Registrations", "paymentExpiresAt", { type: Sequelize.DATE }, t);
  await addIfMissing(qi, "PaymentAttempts", "RegistrationId", { type: Sequelize.UUID }, t);
  const dialect = qi.sequelize.getDialect();
  if (dialect === "postgres") {
    // ALTER TYPE ... ADD VALUE IF NOT EXISTS is safe to re-run.
    await qi.sequelize.query(
      `ALTER TYPE "enum_Registrations_status" ADD VALUE IF NOT EXISTS 'pending_payment'`,
      { transaction: t },
    );
    await qi.sequelize.query(
      `CREATE INDEX IF NOT EXISTS "idx_paymentattempts_registration" ON "PaymentAttempts" ("RegistrationId")`,
      { transaction: t },
    );
  }
  // SQLite stores ENUMs as TEXT without a CHECK constraint in Sequelize's
  // sync output, so no change is needed there.
}

export async function down(qi, Sequelize, t) {
  // The enum value cannot be dropped in PostgreSQL without recreating the
  // type; leaving it is harmless. Columns are removed.
  for (const [table, col] of [
    ["PaymentAttempts", "RegistrationId"],
    ["Registrations", "paymentExpiresAt"],
    ["Events", "priceEgp"],
  ]) {
    const desc = await qi.describeTable(table);
    if (desc[col]) await qi.removeColumn(table, col, { transaction: t });
  }
}
