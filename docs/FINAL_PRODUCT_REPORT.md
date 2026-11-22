# USAM Communities: Final Product Report

_Last updated 2026-11-22. Repository: `github.com/mohamedsaber3108/New_Comunitties-` (branch `main`).
Live staging/production host: **https://13-48-137-19.sslip.io** (EC2 "Hub", Ubuntu 26.04, side by side with USAM Hub)._

This file is the single entry point. The specialised documents in this folder go deeper:
`API_DOCUMENTATION.md` (generated from the live router), `SECURITY_AUDIT.md`,
`TESTING_AND_RELEASE_REPORT.md`, `PRODUCTION_DEPLOYMENT_GUIDE.md`,
`FRONTEND_BACKEND_INTEGRATION_MATRIX.md`, `DEVELOPMENT_PROGRESS.md`.

**How to read the status words**

| Word | Meaning |
|---|---|
| **Built** | Code exists and is wired frontend ↔ API ↔ database. |
| **Tested** | An automated test that exercises it passed (server suite and/or real browser). |
| **Live** | Running on the EC2 host and checked over the internet. |
| **Needs external setup** | Code is built and tested against a stub, but the real third-party account/credential does not exist yet. Never claimed as working live. |

---

## 1. Architecture

```
Browser (React 19 SPA, AR/EN, RTL/LTR, light/dark)
   │  HTTPS (Let's Encrypt, HSTS)            ┌─────────── EC2 "Hub" (Ubuntu 26.04) ───────────┐
   └──────────────► Nginx :443 ──────────────┤  USAM Hub site (untouched, bare IP / :80)        │
                    rate limits, body caps,  │  usam-communities.service (systemd, sandboxed)   │
                    path-only access log     │     Node 24 (private) · Express 5 · 127.0.0.1:3101│
                                             │        ├─ REST API /api/v1 (170 endpoints)       │
                                             │        ├─ SSE /api/v1/stream (realtime)          │
                                             │        ├─ in-process outbox worker + scheduler    │
                                             │        └─ serves the built SPA (dist/)           │
                                             │  PostgreSQL 16 (local) · media on disk           │
                                             │  daily pg_dump (14 kept) · backup before deploy  │
                                             └───────────────────────────────────────────────────┘
External (optional, credential-gated): Paymob · AWS SES/SMTP · AWS S3 · Google OIDC
```

* **Monolith by design.** One Node process serves API + SPA. Feature areas live in modules
  (`server/identity.js`, `mfa.js`, `google.js`, `payments.js`, `coupons.js`, `analytics.js`,
  `media.js`, `realtime.js`, `account.js`), the core routes in `server/index.js`.
* **Schema** is owned by versioned migrations (`server/migrations/0001…0006`); production never
  uses `sync()`.
* **Single node.** Rate limiting and SSE fan-out are in-process (correct for one instance).
  Scaling to more instances needs Redis or PostgreSQL LISTEN/NOTIFY (documented in code).

## 2. Frontend (React SPA)

Design, branding, typography, Arabic/English, RTL/LTR and light/dark from the supplied ZIP are
preserved; every change was additive.

**Public (no sign-in required):** `/` home, `/communities`, `/communities/:slug`, `/explore`,
`/programs`, `/rooms`, `/partners`, `/pricing`, `/resources`, `/resources/:slug`, `/faq`,
`/contact`, `/about`, `/how-it-works`, `/guidelines`, `/privacy`, `/terms`, `/refund-policy`,
`/accessibility`, `/perks`, `/feed`, `/events`, `/events/:id`, `/members`, `/members/:username`,
`/mentors`, `/organizations`, `/offers`, `/challenges`, `/search`, `/opportunities`, `/posts/:id`,
`/403`, 404.
Actions on public pages that need an account (post, register, claim) send visitors to sign in.

**Auth:** `/login` (password, two-factor code, Google when configured), `/signup`,
`/forgot-password`, `/reset-password`, `/verify-email`.

**Signed-in:** `/home` dashboard, `/messages` + `/messages/:id` (live), `/notifications` (live),
`/saved`, `/activity`, `/my-events`, `/my-submissions`, `/mentorship`, `/participation` (groups,
rooms, saved searches, notification preferences, partnerships, organization teams + analytics),
`/billing`, `/checkout/:planCode` (with promo codes), `/settings` (profile, avatar, email
verification, password, two-factor, sessions, blocked members, data export, account deletion),
`/organization/new`, `/admin` (staff only).

**Admin dashboard tabs** (same design system): Overview, Challenges, Mentors, Reports,
Organizations, Contact, Subscriptions, Member perks, Workflows (groups/rooms/partnerships),
Events (publish free/paid, list, cancel with refunds), Perks/Offers, Check-in, Groups & rooms,
Plans & pricing, Payments (ledger, refund, reconcile), **Promo codes**, **Analytics**, Users
(search, paging, suspend/reinstate, roles), Feature flags, CMS, Background jobs, Audit log.
Moderators see only Reports; the server enforces this regardless of the UI.

**Static content by design:** the Programs / Rooms / Partners *catalog pages* describe the
offering from `src/hub-content.js`; joining happens through real, database-backed flows
(communities, curated rooms, partnership requests). Resources/guides are editorial content in
`src/resources-data.js`. Jobs link out to USAM Career & Jobs (its system of record).

## 3. Backend & integrations

| Area | Status | Notes |
|---|---|---|
| Accounts, sessions, email verification, password reset | Built, Tested, Live | httpOnly session cookie (hash stored), lockout, POST-based token completion |
| RBAC member < moderator < admin < super_admin | Built, Tested, Live | middleware + `hasRole()`; super_admin-only role grants |
| Two-factor (TOTP + recovery codes) | Built, Tested, Live | `MFA_ENCRYPTION_KEY` generated on the server; `REQUIRE_ADMIN_MFA` off by default |
| Communities, feed (cursor paging), comments, reactions, bookmarks, reports | Built, Tested, Live | |
| Post images | Built, Tested, Live | magic-byte check, EXIF/GPS stripped, max 4, orphan cleanup |
| Realtime messages, read receipts, notifications (SSE) | Built, Tested, Live | Nginx unbuffered stream verified |
| Events: free (waitlist) + paid tickets, admin cancel with refunds | Built, Tested; payment leg **needs Paymob** | seat hold 30 min |
| Groups, curated rooms (apply/accept/check-in/feedback), mentors, challenges | Built, Tested, Live | |
| Organizations: submit/approve, team admins, roles, leave, analytics | Built, Tested, Live | |
| Plans (DB-driven pricing), subscriptions, billing history | Built, Tested, Live | |
| **Promo codes / coupons** | Built, Tested, Live (100% codes); partial codes **need Paymob** | see §6 |
| **Platform analytics + segments + funnel + CSV** | Built, Tested, Live | real counts only |
| Paymob checkout, HMAC webhook, refunds, reconciliation | Built, Tested against a stub | **Needs external setup** |
| Email (SES/SMTP) via durable outbox | Built, Tested against a stub | **Needs external setup**; console transport today |
| Google sign-in (OIDC + PKCE) | Built, Tested against a stub | **Needs external setup** (OAuth client) |
| S3 storage | Built, Tested against a stub | **Needs external setup**; local disk today |
| Account deletion + 30-day purge, data export | Built, Tested, Live | |
| CMS, feature flags, audit log, background jobs viewer | Built, Tested, Live | |

Full endpoint list: `API_DOCUMENTATION.md` (170 endpoints; generation fails if it drifts from the router).

## 4. Database

PostgreSQL 16 in production (SQLite only for dev/tests). Migrations:

| Migration | Adds |
|---|---|
| 0001_baseline | full schema from the models |
| 0002_performance_indexes | FK/sort/filter indexes, pg_trgm search indexes |
| 0003_user_mfa | two-factor columns |
| 0004_paid_events | event price, seat-hold expiry, payment ↔ registration link, enum value |
| 0005_media_assets | post-image table, account purge marker |
| 0006_coupons | Coupons, CouponRedemptions |

Verified on PostgreSQL 16: a database created by the **currently-deployed** release (4d97c0b,
0001–0005) upgrades in place with 0006; 0006 rolls back and re-applies cleanly. The same check was
done earlier for 0004–0005 on top of 0001–0003.

**Backups:** `install-alongside.sh` dumps the database before every update; a daily cron keeps 14
dumps in `/var/lib/usam-communities/backups`. Backup → restore was verified to produce identical
counts. Those dumps are on the same disk: copy them off the server (S3 or download) for real
disaster recovery.

## 5. Security

Summary (details and evidence in `SECURITY_AUDIT.md`):

* HTTPS with HSTS; secure, httpOnly, SameSite=Lax session cookies; Origin check on writes (CSRF).
* Strict CSP (no inline scripts), nosniff, frame protections; uploads served with a sandboxed CSP.
* Rate limits in the app **and** Nginx (login/signup/reset, API, uploads, coupon guessing per member).
* All input cleaned/validated; parameterised queries; malformed UUIDs → 404, never 500; a fuzz
  sweep posts junk to every route and asserts no 5xx.
* Passwords bcrypt (cost 12); two-factor secrets AES-256-GCM; recovery codes hashed; tokens hashed.
* Prices, discounts and amounts are always computed on the server; Paymob webhooks are HMAC
  verified and amount/currency checked; refunded payments can never re-activate.
* Ownership checks on every member resource; public event JSON never exposes attendees or ticket codes.
* Secrets live in `/etc/usam-communities/env` (root:usam 0640), never in the repository.

Fixed this cycle: none open. **Open items:** turn on `REQUIRE_ADMIN_MFA=true` once staff enrol;
restrict SSH (port 22) in the AWS security group to `13.48.4.200/30`; schedule an independent
penetration test before a large public launch.

## 6. Promo codes (new in this cycle)

* Admin → **Promo codes**: create percent or fixed-amount codes; scope to plans, events or both,
  specific plans and billing cycle; total and per-member limits; start/expiry; pause/activate.
  Live counters: uses (confirmed + open checkouts), redemptions, total discount given; per-code
  redemption list.
* Members apply a code at plan checkout or on a paid event; the price preview, errors
  (invalid, expired, not started, not applicable, exhausted, already used) and the final charge
  all come from the server.
* Limits are enforced with the coupon row locked inside the checkout transaction, so parallel
  checkouts cannot over-redeem (tested with 6 concurrent buyers on a 2-use code, on SQLite and
  PostgreSQL). An abandoned/failed checkout releases its use automatically.
* A 100% code activates the plan / issues the ticket immediately with **no payment provider**,
  so it works today. A partial code needs Paymob to collect the remainder.
* Once a code has been used, its code and value are locked (past receipts stay true); limits,
  dates and on/off remain editable.

## 7. Performance

Measured earlier on PostgreSQL with 2,000 members / 6,000 posts / 12,000 comments, 50 concurrent
connections, 0 errors: feed 408 req/s (p50 116 ms), search 524 req/s (p50 93 ms) after the index
and query work. Frontend: vendor code split into long-cached chunks (`react` 82.6 kB gzip,
`icons` 4.6 kB, app 78 kB). Post stats use grouped queries (no N×M joins), conversation lists use
two grouped queries, images carry dimensions (no layout shift) and lazy-load. These are lab
numbers on a laptop, not a capacity guarantee for the 2-vCPU / 3.7 GB EC2 host shared with Hub.

## 8. Testing

| Suite | Command | Result (2026-11-22) |
|---|---|---|
| Server, SQLite | `npm test` | **136 / 136** |
| Server, PostgreSQL 16 | `TEST_DB_DIALECT=postgres TEST_PG_ADMIN_URL=… node --test server/*.test.js` | **136 / 136** |
| Browser (Edge, real server + DB) | `npm run test:e2e` | **26 / 26** |
| Production + preview builds | `npm run build:ec2`, `npm run build` | pass |
| Nginx + app container checks | `scripts/nginx-integration.sh` | 20 / 20 (previous cycle) |
| API docs vs router | `npm run docs:api` | 170 = 170 |
| Live host over the internet | curl from outside AWS | health 200, valid TLS, HTTP→HTTPS, Hub untouched |

Browser coverage includes: language/RTL/theme, phone-width overflow, 404/403, sign-up →
verify → post, password reset, settings (password, sessions, export, avatar, two-factor),
pricing/checkout honesty, account deletion, roles (member/moderator/admin/super admin), CMS and
feature flags, live two-window messaging, groups and curated rooms end to end, organizations and
team analytics, events (free + waitlist + ticket, paid honesty), image posts, member search,
admin suspend/reinstate/role/plan price/audit/event cancel, **promo code redemption and analytics**.

Not covered: browsers other than Edge/Chromium, a formal WCAG audit, write-heavy load tests,
live third-party services (§9).

## 9. Remaining limitations and external dependencies

| Needs | Unblocks | Owner action |
|---|---|---|
| Paymob merchant account (API key, secret/public keys, integration id, iframe id, HMAC) | real card payments for plans, paid tickets, partial promo codes, refunds | create the account and send the keys; set the callback URLs from `PRODUCTION_DEPLOYMENT_GUIDE.md` §8 |
| AWS SES (verified sender/domain, production access) or SMTP | verification + reset emails, notifications, receipts | verify the domain in SES; then `REQUIRE_EMAIL_VERIFICATION=true` |
| Google Cloud OAuth client | "Continue with Google" | create the client with redirect `https://<host>/api/v1/auth/google/callback` |
| Own domain | branded URL instead of sslip.io | add an A record → 13.48.137.19, run `enable-https.sh` with `DOMAIN=` |
| S3 bucket (or off-host backup target) | durable uploads and off-server backups | create the bucket + IAM role |
| AI assistant | blocked by the product blueprint (document 22) pending provider/privacy approval | decision required |

Product-level limits that are intentional: single-server realtime and rate limits; paid events
have no waitlist; uploads are images only; organizations are teams, not isolated tenants.

## 10. Deployment

The live host was installed with `deploy/install-alongside.sh` (side by side with USAM Hub: no
system upgrade, Hub's Node and Nginx sites untouched, `nginx -t`-gated changes with rollback) and
switched to HTTPS with `deploy/enable-https.sh`.

**Update the live server to the latest `main`** (backs up the database, rebuilds, migrates,
restarts; keeps secrets and HTTPS settings):

```bash
sudo bash /opt/usam-communities/app/deploy/install-alongside.sh
```

**Useful commands**

```bash
systemctl status usam-communities            # service state
journalctl -u usam-communities -f            # live logs (JSON)
sudo bash /opt/usam-communities/app/deploy/create-admin-local.sh   # add/promote a super admin
ls /var/lib/usam-communities/backups         # database dumps
sudo nano /etc/usam-communities/env && sudo systemctl restart usam-communities   # change settings
```

**Turning on an integration** = add its variables to `/etc/usam-communities/env` (names in
`.env.example`), then restart. The app refuses to start on unsafe production combinations
(e.g. Paymob without an HMAC secret), so a mistake is caught at boot, not by users.
