# USAM Communities

React/Vite frontend and Express/Sequelize API for USAM Communities. Updated 2026-11-27 to match the code on main. The live host may run an older release; check its version before relying on any feature below.

## What the code does today

- Arabic and English, RTL/LTR, light/dark theme, responsive public site and member workspace.
- Accounts: email and password (bcrypt), server-side sessions in an httpOnly cookie, email verification and password reset, sessions list and logout-all, optional TOTP two-factor with recovery codes, Google sign-in code (needs an OAuth client).
- Sign-up gives the same neutral reply for a new or an existing address and does not sign in; the member signs in after (X-1).
- Roles: `member` < `moderator` < `admin` < `super_admin` (see `documentation/04-Backend/RBAC.md`). Staff sessions are shorter (30 min idle, 8 h max); a role change or suspension ends every session of that user.
- Communities, feed with cursor paging, comments, reactions, bookmarks, follows, blocks, reports; post images (content checked by magic bytes, metadata stripped).
- Realtime messages, read receipts and notifications over Server-Sent Events (one server process).
- Events (free with waitlist; paid tickets need Paymob), groups, curated rooms, mentors, challenges, organizations with team roles.
- Plans from the database, subscriptions, billing history, promo codes, platform analytics.
- Admin: users, roles, plans, promo codes, CMS, feature flags, audit log, background jobs.
- Paymob checkout, signed webhooks, refunds and reconciliation are built but off until merchant keys exist (`PAYMOB_ENABLED=false`).
- Email goes through a durable outbox; on `EMAIL_PROVIDER=console` it is only logged. S3 storage is optional; local disk by default.

## Local development

Requires Node.js 24 and npm. Install with `npm ci`.

```bash
npm run dev:full      # build the UI and run the API on http://127.0.0.1:3001 (SQLite)
npm run dev:api       # API with reload
npm run dev:ui        # UI with hot reload on http://127.0.0.1:5173
```

Local development and tests use SQLite (`data/usam.sqlite`). Production uses **PostgreSQL 16** (`DB_DIALECT=postgres`, `DATABASE_URL`). The code still has a legacy MySQL dialect; it is not the production database.

## Checks

```bash
npm test               # server tests (node --test, SQLite)
npm run test:e2e       # browser tests (Playwright, Chromium)
npm run lint           # ESLint + jsx-a11y, no new warnings beyond the baseline
npm run build:ec2      # production UI build
npm run docs:api       # regenerate docs/API_DOCUMENTATION.md from the router
npm run db:migrate     # apply migrations (server/migrations)
```

CI (`.github/workflows/check.yml`) runs a full-history secret scan, lint, both builds, the API-docs check, a shell-script syntax check, the server tests on SQLite and PostgreSQL, `npm audit` for production dependencies, and the browser tests. Counts change with every PR; read the latest CI run instead of a number in a document.

## Read next

| File | For |
|---|---|
| `docs/FINAL_PRODUCT_REPORT.md` | feature status, deployment, what needs external setup |
| `docs/PRODUCTION_DEPLOYMENT_GUIDE.md` | deploying, backups, monitoring |
| `docs/SECURITY_AUDIT.md` | controls, findings, X-1 decisions |
| `docs/API_DOCUMENTATION.md` | generated endpoint list |
| `docs/GAP_REGISTER.md` | what is still missing |
| `docs/INTEGRATIONS.md` | outside systems and their state |
| `.env.example` | every environment variable (names and safe defaults) |

Nothing here has been exercised with real Paymob, SES, Google or S3 credentials.
