// 0003_user_mfa
// Adds the two-factor columns to Users. Idempotent: on a fresh database the
// 0001 baseline (sync of current models) already created them, so each column
// is only added when missing.
export const name = "0003_user_mfa";

const COLUMNS = (Sequelize) => ({
  mfaSecretEnc: { type: Sequelize.TEXT },
  mfaEnabledAt: { type: Sequelize.DATE },
  mfaRecoveryHashes: { type: Sequelize.TEXT },
  mfaLastStep: { type: Sequelize.BIGINT },
});

export async function up(qi, Sequelize, t) {
  const desc = await qi.describeTable("Users");
  for (const [col, def] of Object.entries(COLUMNS(Sequelize)))
    if (!desc[col]) await qi.addColumn("Users", col, def, { transaction: t });
}

export async function down(qi, Sequelize, t) {
  const desc = await qi.describeTable("Users");
  for (const col of Object.keys(COLUMNS(Sequelize)))
    if (desc[col]) await qi.removeColumn("Users", col, { transaction: t });
}
