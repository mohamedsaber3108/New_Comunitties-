// Seeds a realistic dataset for load testing and prints a valid session cookie.
//   DATABASE_URL=postgres://.../usam_load_test DB_DIALECT=postgres node scripts/seed-load.mjs
// Refuses to run unless the database name contains "load" or "test".
import crypto from "node:crypto";
import {
  initDb, sequelize, User, Community, Membership, Post, Comment, Reaction, Notification, Session,
} from "../server/db.js";
import { sha256 } from "../server/security.js";

const dbName = sequelize.config.database || "";
if (!/load|test/i.test(dbName)) {
  console.error(`Refusing to seed database "${dbName}" (name must contain load or test).`);
  process.exit(1);
}
const USERS = Number(process.env.SEED_USERS || 2000);
const POSTS = Number(process.env.SEED_POSTS || 6000);
const COMMENTS = Number(process.env.SEED_COMMENTS || 12000);

await initDb();
const communities = await Community.findAll();
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const words = "founder startup hiring remote growth pricing customer product design sales engineering mentor career portfolio freelance campus internship funding".split(" ");
const sentence = () => Array.from({ length: 12 + Math.floor(Math.random() * 20) }, () => pick(words)).join(" ");

const t0 = Date.now();
const users = await User.bulkCreate(
  Array.from({ length: USERS }, (_, i) => ({
    name: `Load User ${i}`,
    username: `load${i}_${crypto.randomBytes(3).toString("hex")}`,
    email: `load${i}-${crypto.randomBytes(3).toString("hex")}@example.test`,
    passwordHash: "not-a-real-hash",
    persona: pick(["launchpad", "freelancespace", "hrconnect", "studentzone"]),
    discoverable: Math.random() < 0.6,
    emailVerified: true,
    bio: sentence().slice(0, 200),
    skills: JSON.stringify([pick(words), pick(words)]),
  })),
  { returning: true },
);
await Membership.bulkCreate(users.map((u) => ({ UserId: u.id, CommunityId: pick(communities).id })));
const posts = await Post.bulkCreate(
  Array.from({ length: POSTS }, () => ({ UserId: pick(users).id, CommunityId: pick(communities).id, body: sentence() })),
  { returning: true },
);
await Comment.bulkCreate(
  Array.from({ length: COMMENTS }, () => ({ PostId: pick(posts).id, UserId: pick(users).id, body: sentence() })),
);
const seenReaction = new Set();
const reactions = [];
for (let i = 0; i < POSTS * 2; i++) {
  const u = pick(users), p = pick(posts), k = `${u.id}:${p.id}`;
  if (!seenReaction.has(k)) { seenReaction.add(k); reactions.push({ UserId: u.id, PostId: p.id }); }
}
await Reaction.bulkCreate(reactions);

// One real, verified, signed-in member whose cookie the load test reuses.
const me = users[0];
await Notification.bulkCreate(Array.from({ length: 60 }, () => ({ UserId: me.id, kind: "load", text: sentence().slice(0, 100), href: "/home" })));
const token = crypto.randomBytes(32).toString("hex");
await Session.create({ UserId: me.id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 86400000) });

console.log(JSON.stringify({
  seconds: Math.round((Date.now() - t0) / 1000),
  users: await User.count(), posts: await Post.count(), comments: await Comment.count(), reactions: await Reaction.count(),
  cookie: `usam_session=${token}`,
}));
await sequelize.close();
