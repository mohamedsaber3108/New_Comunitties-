# USAM Communities — Project Audit, Integration Matrix & Roadmap

> ## STATUS UPDATE - 2026-11-04 (supersedes the "open decisions" below)
> The owner's decisions are made and implemented: **keep Express/Sequelize**, **PostgreSQL in production** (SQLite for dev/tests), **AWS SES email**, **Paymob payments**, **dynamic plans from the database**, **email-verified registration**, **S3 storage**, **EC2 + RDS + Nginx + systemd**.
>
> | Roadmap phase (section 10) | State |
> |---|---|
> | 0 Freeze & safety | done |
> | 1 Finish the wiring (G1-G12 + `/403`) | **done** - plus rooms, org teams, avatar, flags/CMS, perk catalog, my-connections |
> | 2 Production hardening (migrations, logging, security headers, config guard, audit) | **done and tested** |
> | 3 Identity P0 (verification, reset, sessions, deletion) | **done and tested** (email delivery through SES unverified - no AWS account) |
> | 4 Core workflow depth | partly: rooms/teams/perks/notifications done; paid events, uploads beyond avatars, mentorship scheduling **not** done |
> | 5 Live monetization (Paymob) | **built and mock-tested; not verified against Paymob** |
> | 6 Realtime + delivery | email outbox/digests done; **realtime not done** |
> | 7 AWS cutover | **artifacts written and partly rehearsed locally; nothing deployed** |
> | 8 AI | not started (deliberately - no fake implementation) |
>
> Authoritative current documents: `FRONTEND_BACKEND_INTEGRATION_MATRIX.md` (feature-by-feature status), `API_DOCUMENTATION.md` (generated), `SECURITY_AUDIT.md`, `TESTING_AND_RELEASE_REPORT.md`, `PRODUCTION_DEPLOYMENT_GUIDE.md`, `DEVELOPMENT_PROGRESS.md`.
>
> **What the original risk list (section 11) looks like now:** R1 stack conflict -> resolved (keep Express). R2 `sync()` in production -> resolved (versioned migrations, `0002` already applied on PostgreSQL). R3 dependency advisories -> 0 high/critical in production deps (nodemailer upgraded; 2 moderate `uuid` entries accepted as unreachable). R4 realtime/email -> email done, realtime still polling. R5 payments stubbed -> real integration built, **still unverified live**. R6 monolithic `main.jsx` -> unchanged by design (no restructuring of working UI); it now has browser tests.
>
> **Corrections to claims in this document's original text:** the audit counted "114 endpoints / 38 models" for the 2026-10-27 snapshot; the working copy used here is the newer 2026-10-29 build (it already included the Perks domain: 40 models) and now has **154 endpoints** and **43 model tables** (+ `schema_migrations` when created by the migration runner). The 3 new models are `VerificationToken`, `OutboxMessage` and `WebhookEvent`; `User`, `Session`, `Subscription`, `PaymentAttempt` and `NotificationPreference` gained columns.
>
> *The remainder of this file is the original 2026-11-03 audit, kept as the historical baseline.*

---

> Author: Kiro (engineering audit)
> Date: 2026-11-03
> Working copy: `m:\Comunities _New\app` (promoted from the newest source in the provided archive)
> Status of working copy: **builds and runs on this machine** — `npm run build`, `npm run build:ec2`, `npm test` (10/10), and a live `node server/index.js` smoke test all pass.

---

## 0. What I did before writing anything

1. Read `Backend Prompt.md` (a Django/DRF/PostgreSQL/AWS brief).
2. Extracted the ZIP, then the two nested ZIPs inside it:
   - `USAM-Communities-Complete-Project-GitHub-2026-10-27.zip` (Oct 27 snapshot — matches the included `PROJECT_COMPLETE_AUDIT.md`)
   - `USAM_COMMUNITIES_PERKS_V7_FULL_SOURCE (1).zip` (Oct 29 — **newer and larger**, adds a Perks domain)
3. Compared both copies. The **perks_v7** copy is authoritative (newer `main.jsx` 250KB vs 225KB, newer `server/index.js` 88KB vs 82KB, +2 models, a `/perks` product).
4. Deeply mapped the frontend routes, the API client, the Express endpoints, auth, and the preview emulator.
5. Promoted perks_v7 into `m:\Comunities _New\app`, installed deps, **fixed one real cross-platform bug**, and verified the whole thing builds, tests green, and serves.

The original archives are untouched under `m:\Comunities _New\_extracted\` as a checkpoint.

---

## 1. Critical finding: the stack conflict (needs your decision)

`Backend Prompt.md` asks for a **Django 5 + DRF + PostgreSQL** backend built from scratch.

The provided frontend **already ships a complete, working backend** — **Express 5 + Sequelize 6**, with **40 models**, **~120 endpoints**, cookie-session auth, transactions, an audit log, a billing workflow, and a **passing integration test suite**. The React frontend's entire API client (`src/main.jsx`) is written against that Express contract (`/api/v1/...`, cookie sessions, `{ error: "code" }` error envelope).

These two directions are mutually exclusive for a single product. Your top-level directive says: *"Do not build an unrelated backend and then force the frontend to fit it... Use the existing technology stack wherever it makes sense."* That strongly favors **completing the existing Express backend**, not rewriting it in Django.

My engineering recommendation (decision matrix in §9): **keep and complete the Express/Sequelize backend.** Rewriting ~120 tested endpoints and 40 models into Django would discard working, tested code, re-introduce bugs, and break the frontend contract — the opposite of "preserve existing work." I have flagged this as **Question A1** below and will not rewrite the stack without your explicit confirmation.

---

## 2. Architecture as it actually exists

```
React 19 + React Router 7 (single file: src/main.jsx, ~6500 lines)
        │
        ├── Hosted "preview" build  ──►  src/preview-api.js  ──►  browser localStorage
        │     (npm run build, VITE_SITE_PREVIEW=true, no real server)
        │
        └── EC2 / full build        ──►  fetch /api/v1 (same-origin cookie session)
                                           │
                                     Express 5 + Sequelize 6 (server/index.js, ~2900 lines)
                                           │
                                     ├── SQLite (local dev / tests)
                                     └── MySQL 8 (production target, via mysql2)
```

- **Two runtime modes.** `VITE_SITE_PREVIEW=true` ships a fully client-side demo (localStorage). The EC2 build talks to the real Express API. The frontend `api()` wrapper (`src/main.jsx`) transparently switches between them.
- **Auth.** Opaque 32-byte session token in an `httpOnly` `usam_session` cookie; only its SHA-256 hash is stored in the `Session` table. Middleware `withUser` → `auth` (401) → `admin` (403). Origin check on mutating `/api` requests as CSRF defense.
- **Billing.** Four EGP plans, free activation, idempotent paid-request creation (`PaymentAttempt` + `Idempotency-Key`), audited manual activation. **Paymob is intentionally not connected** (no live charges).
- **i18n/theme.** Arabic default, RTL/LTR via `document.dir`, light/dark via `[data-theme]`, both persisted in localStorage. Inline `L("ع","en")` helper throughout.

---

## 3. Technology inventory (declared & verified installed)

| Library | Range | Role |
|---|---|---|
| react / react-dom | ^19.2 | UI |
| react-router-dom | ^7.9 | routing |
| vite | ^7.1 | build/dev |
| lucide-react | ^0.468 | icons |
| express | ^5.2 | API + static server |
| sequelize | ^6.37 | ORM |
| mysql2 | ^3.15 | prod driver |
| bcryptjs | ^3.0 | password hashing |
| cookie-parser | ^1.4 | cookies |
| sqlite3 | ^5.1 (dev) | local/test DB |

No test framework dependency is needed — tests use Node's built-in `node:test`. `npm audit` reports 13 advisories (2 low, 6 moderate, 4 high, 1 critical) in the dependency tree; these need review (tracked in the roadmap, not yet triaged).

---

## 4. Complete route inventory (54 routes) with backend wiring

Public (marketing/legal): `/`, `/communities`, `/communities/:slug`, `/explore`, `/programs`, `/rooms`, `/partners`, `/pricing`, `/resources`, `/resources/:slug`, `/faq`, `/contact`, `/about`, `/how-it-works`, `/guidelines`, `/privacy`, `/terms`, `/refund-policy`, `/accessibility`, `*` (404).

Auth/account: `/login`, `/signup`, `/home` (dashboard), `/dashboard`→`/home`, `/me`, `/settings`.

Member app: `/feed`, `/posts/:id`, `/saved`, `/events`, `/events/:id`, `/my-events`, `/challenges`, `/challenges/:id`, `/my-submissions`, `/activity`, `/messages`, `/messages/:id`, `/mentorship`, `/mentors`, `/offers`, `/perks` *(new)*, `/members`, `/members/:username`, `/organizations`, `/organization/new`, `/opportunities`, `/jobs`→`/opportunities`, `/search`, `/notifications`, `/participation`.

Billing/admin: `/checkout/:planCode`, `/billing`, `/admin`.

Every route resolves to a real component; every data-backed route calls a real endpoint. There is **no dead route**.

---

## 5. Frontend ↔ Backend integration matrix (the real gaps)

The backend is **ahead** of the frontend: several endpoints exist and work but have **no UI control**. These are the concrete "finish the wiring" items (all verified against both files):

| # | Backend endpoint (exists) | Missing UI | Suggested home |
|---|---|---|---|
| G1 | `PATCH /notifications/read-all` | No "mark all read" button | `/notifications` |
| G2 | `PATCH /room-applications/:id` | Member cancel / rate / feedback | `/participation` |
| G3 | `GET /me/room-applications`, `GET /me/groups` | Owner-specific lists (UI derives from catalog) | `/participation` |
| G4 | `POST /organizations/:id/team`, `PATCH /organizations/:id/team/:memberId` | Org team add/remove | `/participation` or org detail |
| G5 | `POST /mentors/:id/request` | "Request mentorship" action on a mentor | `/members/:username` or `/mentors` |
| G6 | `GET /me/network` | Followers/following panel | `/me` or `/members` |
| G7 | `GET /admin/feature-flags`, `PUT …/:key` | Admin feature-flag toggles | `/admin` tab |
| G8 | `GET /admin/cms`, `PUT …/:key/:locale` | Admin CMS editor | `/admin` tab |
| G9 | `POST /admin/events/check-in` | Ticket check-in form/scanner | `/admin` tab |
| G10 | `GET /admin/groups`+`POST`, `POST /admin/curated-rooms` | Admin create group/room forms | `/admin` tab (review wired; create not) |
| G11 | `GET /platform-config` | Not consumed as a global flag/CMS source | app-wide config adapter |
| G12 | `DELETE /members/:id/block` | Unblock control | `/members/:username` |

Missing **pages** flagged by the prior audit and still absent: `/403` permission page; account recovery surfaces (`/forgot-password`, `/reset-password/:token`, `/verify-email`) — but those are correctly **blocked** on a real email/token service existing.

---

## 6. Database inventory — 40 Sequelize models

Identity: `User`, `Session`. Social: `Community`, `Membership`, `Post`, `Comment`, `Reaction`, `Bookmark`, `Follow`, `Block`. Events/offers: `Event`, `Registration`, `Offer`, `Claim`. Orgs/mentorship: `Organization`, `OrganizationMember`, `Mentor`, `MentorRequest`, `Partnership`. Messaging: `Conversation`, `Message`. Programs/challenges/rooms/groups: `Challenge`, `Submission`, `Room`, `RoomApplication`, `Group`, `GroupMembership`. Member tools: `Notification`, `NotificationPreference`, `SavedSearch`. Trust/ops: `Report`, `AuditLog`, `ContactRequest`. Billing: `Plan`, `Subscription`, `PaymentAttempt`. Platform: `FeatureFlag`, `CmsEntry`. **Perks (new): `Perk`, `PerkApplication`.**

Data guarantees already present: UUID PKs, unique constraints on all natural keys, unique relationship indexes (memberships, reactions, claims, registrations, follows, etc.), transactional capacity/waitlist and offer-claim logic, a strict partnership and perk-application state machine, opaque ticket codes with idempotent check-in.

**Schema work still required:** versioned migrations (today it relies on `sequelize.sync`), MySQL/RDS rehearsal (tests use SQLite), tenant boundary for orgs, identity/recovery/MFA/consent records, outbox/job records for email+webhooks, provider/refund/invoice records for live billing, and measured production indexes.

---

## 7. What I changed in this pass (small, safe, reversible)

All changes are confined to the working copy `app/` and preserve existing behavior:

1. **`server/db.js`** — Fixed a cross-platform bug: the SQLite parent-directory derivation used a forward-slash-only regex, which created a directory at the full DB path on Windows and caused `SQLITE_CANTOPEN`. Replaced with `path.dirname(...)`. **Result:** tests now pass on Windows; no change on Linux.
2. **`vite.config.js` + `package.json`** — The `build` script used POSIX-only inline env syntax (`VITE_SITE_PREVIEW=true vite build`) that fails in PowerShell/cmd. Made the preview flag cross-platform via `--mode preview` plus a `define` in the config. **Result:** `npm run build` works on any OS; preview emulator still embedded correctly (verified).

No product behavior, UI, routes, API contracts, or data shapes were changed.

---

## 8. Recommended engines (what a complete commercial product needs)

Grounded in what already exists vs. what is genuinely missing:

- **Community/Engagement engines** — essentially implemented (communities, posts, comments, reactions, bookmarks, feed, groups, events, challenges, offers, perks). Remaining: media uploads, mentions/tags, pagination at scale.
- **Communication engine** — messaging + notifications persist, but **realtime is polling-only** and **email delivery is not wired**. Needs a transport (Socket.IO/SSE + Redis adapter) and an email provider (AWS SES) with an outbox/retry.
- **Moderation engine** — reports, audit log, block, admin review exist. Needs moderator-scoped roles, spam heuristics, a moderation queue UI.
- **Search/discovery** — DB `LIKE` search + saved searches exist. A dedicated index (Meilisearch/OpenSearch) is a scale decision, not an MVP need.
- **Analytics** — honest DB-count overview only. Real analytics needs an event schema + a store; defer.
- **AI (NomadAI)** — spec only, correctly blocked. Keep blocked until provider/policy/retrieval/eval are defined.
- **Monetization** — plans/subscriptions/activation exist; **Paymob live checkout + webhooks + refunds** is the real gap, gated on merchant credentials.

---

## 9. Decision matrix: backend stack

| Criterion | Keep & complete Express/Sequelize (recommended) | Rewrite in Django/DRF (per Backend Prompt.md) |
|---|---|---|
| Preserves existing work | Full — ~120 tested endpoints, 40 models kept | None — full rewrite, discards tested code |
| Frontend compatibility | Exact match to current `/api/v1` contract | Must re-match envelope, cookies, error codes |
| Time to "complete product" | Low — finish wiring + prod hardening | High — re-implement everything first |
| Risk of regressions | Low (tests already green) | High (re-deriving business rules) |
| Matches your directive | Yes ("use existing stack", "preserve work") | Conflicts with "don't build an unrelated backend" |
| AWS EC2 deploy | Node + Nginx + systemd/PM2 (snippets exist) | Gunicorn + Nginx + systemd |
| Team familiarity | Unknown (Question A3) | Unknown (Question A3) |

**Recommendation:** Keep Express/Sequelize. Adopt the *good* parts of the Django brief as cross-stack requirements: OpenAPI docs, versioned migrations, consistent response envelope, throttling, soft-delete, `select_related`-style eager loading, health check, and the AWS/Nginx/SSL deploy files.

---

## 10. Roadmap (incremental completion, not a rebuild)

- **Phase 0 — Freeze & safety (done/underway):** working copy promoted, builds green, tests green, cross-platform fixes applied, this audit written.
- **Phase 1 — Finish the wiring (§5 gaps G1–G12):** add the missing UI for endpoints that already exist; add `/403`. Pure additive frontend work, low risk.
- **Phase 2 — Production hardening:** versioned migrations, structured logging + request IDs, dependency-advisory triage, CSP/security headers in the Nginx block, `.env.example`, health/readiness.
- **Phase 3 — Identity P0:** email verification, password reset, (optional) admin MFA — **requires an email provider decision** (Question B).
- **Phase 4 — Core workflow depth:** media uploads (S3), program applications, organizer studio, mentorship scheduling, richer moderation.
- **Phase 5 — Live monetization:** Paymob hosted checkout + signed webhooks + reconciliation + refunds — **requires merchant credentials** (Question C).
- **Phase 6 — Realtime + delivery:** Socket.IO/SSE + Redis; SES email outbox.
- **Phase 7 — AWS cutover:** EC2 + RDS(MySQL) provisioning, deploy/rollback scripts, SSL, load test before any capacity claim.
- **Phase 8 — AI (NomadAI):** only after platform readiness and policy approval.

---

## 11. Risks & conflicts

- **R1 (blocking):** Stack conflict — Django brief vs. existing Express backend (§1, Question A).
- **R2:** `sequelize.sync()` in production has no migration history — schema drift risk once real data exists.
- **R3:** Dependency advisories (1 critical, 4 high) need triage before any public deploy.
- **R4:** Realtime and email are not implemented; any UI implying "instant"/"emailed" is currently polling/in-app only.
- **R5:** Live payments are stubbed; never present billing as charging real money until Paymob is wired and reconciled.
- **R6:** Single-file `main.jsx` (~6500 lines) is a maintainability risk; a controlled, test-backed split is advisable but must not change UI.

---

## 12. Definition of done (per feature)

A feature is complete only with: a reachable route/UI; loading/empty/error/permission/validation states; AR/EN + RTL/LTR; responsive + keyboard/screen-reader behavior; a validated, authorized API; durable persistence with migrations; audit/moderation where consequential; tests proportional to risk; and legal/payment approval where applicable.
