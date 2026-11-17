# USAM Communities

## Hosted product experience

The Sites build uses `npm run build`. It serves the same React interface with a
device-local member space. Membership, posts, comments, bookmarks, profile
settings and other interactions persist in that browser. The hosted signup does
not collect a password or email. The separate EC2 source build uses the Express
API and database; do not treat device-local data as shared production records.
In this checkout, `npm run dev` previews static `dist`;
`npm run build:ec2 && node server/index.js` runs the backend locally.

The hosted experience includes eight bilingual practical guides, four programs,
four curated-room formats, partnership pathways, FAQ, member onboarding,
personal activity and event views, post editing, and a contact form. Hosted
contact references stay on the current device; in the EC2 source, contact
requests are saved for review in the admin workspace.

React/Vite frontend and Express/Sequelize API for a new, isolated USAM Communities implementation. This package is intended for an EC2 deployment review. It has **not** been deployed or connected to the existing Hub repository or production services.

## What works in this package

- Arabic and English, RTL/LTR, persistent light/dark preference, responsive public site and member workspace.
- Four official communities seeded as definitions only; join/leave and member counts persist.
- Email/password accounts with hashed passwords, server-side sessions in httpOnly cookies, profile and directory opt-in, logout and logout-all.
- Posts, edits, soft deletion, comments, reactions, bookmarks, follows and a following feed, profile blocking, reporting, and basic admin report resolution.
- Free events with registration, capacity, waitlist promotion, and cancellation.
- Challenges with member submissions and admin review; mentors with profile review and request response.
- Consent-based direct messages between members of a shared community, admin-reviewed organizations, published offers with atomic one-per-account claim limits, member search, notifications, and an operational overview with real counts.
- Public resources and FAQ, member onboarding and recent activity, registered event list, post edit controls, and an admin-only contact queue.
- Four EGP membership plans with monthly/annual billing choices, a member billing workspace, idempotent paid activation requests, auditable manual activation, and cancellation. Live Paymob checkout remains disabled until merchant credentials and signed webhooks are configured and tested.
- Direct links to the USAM products; Jobs stays the source of truth for jobs.

No users, testimonials, attendance, companies, partners, or opportunities are seeded. Public lists render honest empty states until data is published.

## Local development

Requires Node.js 24 and npm. Install with `npm ci`.

For a complete local preview with the API and SQLite:

```bash
npm run dev
```

Open `http://127.0.0.1:3001`. For frontend hot reload, use two terminals instead:

```bash
npm run dev:api
```

```bash
npm run dev:ui
```

Then open `http://127.0.0.1:5173`. Local development uses SQLite at `data/usam.sqlite` and automatically creates the local schema and the four official communities. The local SQLite driver is a development dependency; production uses MySQL. To test against isolated MySQL/Redis, use `deploy/docker-compose.dev.yml`, set `DB_DIALECT=mysql`, `DB_HOST=127.0.0.1`, `DB_PORT=3307`, `DB_NAME=usam_hub`, `DB_USER=usam`, and `DB_PASSWORD=local_dev_only`; run `CONFIRM_EMPTY_DB=yes npm run db:bootstrap` against the **new, empty** development database. Redis is in the development stack for future queue and realtime work; the current API does not use it.

Run `npm run check` for the production frontend build and API integration tests. No tests touch production.

## Production boundary

Read [DEPLOYMENT_RUNBOOK.md](docs/DEPLOYMENT_RUNBOOK.md) and [GAP_REGISTER.md](docs/GAP_REGISTER.md) before using EC2. The target in the supplied brief is a separate Hub instance; this package contains no infrastructure changes. Set `REGISTRATION_ENABLED=false` until email verification, recovery and abuse controls are complete. This version is a functional development build, **not an approved public launch**.


---

## Production readiness (added)

The backend now covers email-verified registration, password recovery, sessions/devices, RBAC (member / moderator / admin / super_admin), dynamic plans, Paymob payments, SES email with a durable outbox, S3 storage, PostgreSQL with versioned migrations, background jobs, audit logging and a hardened Nginx + systemd deployment.

| Read | For |
|---|---|
| `../PRODUCTION_DEPLOYMENT_GUIDE.md` | deploying to AWS (EC2 + RDS + Nginx), backups, monitoring, runbook |
| `../SECURITY_AUDIT.md` | controls, findings, residual risk |
| `../TESTING_AND_RELEASE_REPORT.md` | what was tested, results, what was **not** verified |
| `../FRONTEND_BACKEND_INTEGRATION_MATRIX.md` | every feature and its implemented / UI / test / production state |
| `../API_DOCUMENTATION.md` | generated endpoint reference (`npm run docs:api`) |
| `.env.example` | every environment variable |

```bash
npm ci
npm test               # 96 server tests (SQLite)
npm run test:e2e       # 15 real-browser tests (needs Edge or Chrome)
npm run db:migrate     # apply migrations (PostgreSQL in production)
npm run create:admin   # first administrator (see deployment guide)
```
**Nothing here has been deployed or exercised with real Paymob / AWS credentials.** See the testing report for exactly what is and is not verified.
