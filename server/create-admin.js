// Creates (or promotes) a platform administrator. Run on the server:
//   ADMIN_EMAIL=... ADMIN_PASSWORD=... [ADMIN_NAME=...] [ADMIN_ROLE=super_admin] \
//     npm run create:admin
// Reads secrets from the process environment only (never argv, so they don't
// land in shell history / `ps`). The password is hashed with bcrypt.
import bcrypt from "bcryptjs";
import { sequelize, User } from "./db.js";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const role = process.env.ADMIN_ROLE || "admin";

if (!["admin", "super_admin"].includes(role)) {
  console.error("ADMIN_ROLE must be 'admin' or 'super_admin'.");
  process.exit(1);
}
if (!email || !/^\S+@\S+\.\S+$/.test(email) || !password || password.length < 16) {
  console.error(
    "Set ADMIN_EMAIL and a unique ADMIN_PASSWORD of at least 16 characters in this process environment.",
  );
  process.exit(1);
}

await sequelize.authenticate();
const existing = await User.findOne({ where: { email } });
if (existing) {
  if (process.env.PROMOTE_EXISTING !== "yes") {
    console.error("Account exists. Promotion requires PROMOTE_EXISTING=yes.");
    process.exit(1);
  }
  await existing.update({ role, emailVerified: true, emailVerifiedAt: existing.emailVerifiedAt || new Date(), status: "active" });
  console.log(`Existing account promoted to ${role}.`);
} else {
  const name = process.env.ADMIN_NAME?.trim() || "USAM Admin";
  await User.create({
    name,
    email,
    username: "admin" + Date.now().toString(36),
    passwordHash: await bcrypt.hash(password, 12),
    role,
    // Operator-created accounts are trusted: no email round-trip required.
    emailVerified: true,
    emailVerifiedAt: new Date(),
    status: "active",
    authProvider: "password",
    passwordChangedAt: new Date(),
  });
  console.log(`${role} account created.`);
}
await sequelize.close();
