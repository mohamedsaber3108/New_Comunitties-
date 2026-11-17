# Testing & Release Report

_Last updated 2026-11-04. Every number below was produced by running the command shown, on the date above._

## 0. Verdict (read this first)

| Question | Answer |
|---|---|
| Does the full automated suite pass? | **Yes** - 125/125 server tests on SQLite **and** on PostgreSQL 16; 25/25 real-browser tests; 20/20 Nginx + app container checks. |
| Is the product **production verified**? | **No.** Nothing has been deployed to AWS or used with real credentials. |
| Can it be deployed? | **Yes, once the external dependencies in section 7 are provided.** Deployment artifacts are written and the parts that can be tested locally were tested. |
| Is Paymob verified end-to-end? | **No.** Our side is fully tested against a *mocked* Paymob. The real sandbox has not been called (no credentials). |
| Is AWS SES verified? | **No.** The SMTP path was verified against a real socket; the SES request shape against a stub. No email has been sent through AWS. |

"Implemented", "tested", and "production verified" are different things in this report and are never conflated.

## 1. How to reproduce

```bash
cd app
npm ci
npm test                       # 125 server tests, SQLite (needs nothing else)
npm run test:e2e               # 16 real-browser tests (needs Microsoft Edge/Chrome installed)

# PostgreSQL (needs a Postgres 16 you can create databases on; each test file gets its own throwaway DB)
TEST_DB_DIALECT=postgres TEST_PG_ADMIN_URL=postgres://user:pass@host:5432/postgres node --test server/*.test.js

npm run docs:api               # regenerates API_DOCUMENTATION.md; fails if it disagrees with the live router
```
Tests are hermetic: they set or clear every environment variable they depend on, so a polluted shell/CI cannot change results (verified by running them with hostile variables exported).

## 2. Results

| Suite | Scope | Result | Environment |
|---|---|---|---|
| Server integration + unit | 125 tests, 15 files | **125 pass / 0 fail** | SQLite |
| Same suite | 125 tests | **125 pass / 0 fail** | **PostgreSQL 16** (real server, Docker) |
| Browser end-to-end | 25 tests | **25 pass / 0 fail** | Microsoft Edge driving the built SPA + real server |
| Nginx + app integration | 18 checks | **18 pass / 0 fail** | real Nginx 1.30 + the app in production mode, Linux container (`scripts/nginx-integration.sh`) |
| Deploy script syntax | 8 scripts | all pass `bash -n` | Linux container |
| Nginx config | `nginx -t` | successful | real Nginx |
| Production boot | migrate -> seed -> serve -> SIGTERM | **verified** | Linux container + PostgreSQL |
| Backup -> restore | pg_dump + pg_restore | **verified**, row counts + data checksum identical | PostgreSQL 16 |
| Production builds | `npm run build:ec2`, `npm run build` | both succeed | - |

### Server test files
| File | Tests | What it proves |
|---|---|---|
| `api.test.js` | 10 | Original business logic: membership, feed, events/capacity, offers, challenges, messaging rules, follows, billing, perks, groups/rooms. |
| `identity.test.js` | 11 | Verification (single-use), reset (no enumeration, sessions revoked), change-password, sessions, suspension, deletion, **verified-email gating**. |
| `admin.test.js` | 15 | RBAC (member/moderator/admin/super_admin), dynamic plans, user mgmt, flags, CMS, audit, outbox, check-in, perk catalog, case-insensitive search. |
| `payments.test.js` | 12 | Hosted checkout, idempotent replay, **forged signature refused**, **wrong amount/currency refused**, pending ignored, duplicate ignored, late failure can't downgrade, partial vs full refund, refunded can't be resurrected, maintenance (expire/remind). |
| `workflows.test.js` | 7 | Rooms (capacity, privacy, cancel, check-in, feedback), org teams, **server-side feature flags**, CMS publish rules, notification preferences, digest batching, retention housekeeping. |
| `journey.test.js` | 1 (11 stages) | register -> verify -> login -> profile -> join -> post/comment/react -> event+ticket+check-in -> notification email -> subscribe -> pay (signed webhook) -> entitlement -> perk apply -> cancel at period end -> export -> delete. |
| `security.test.js` | 14 | Headers/CSP, cookie flags, CSRF/origin, SQL-injection strings, mass assignment, IDOR, XSS storage, error hygiene, body limits, login throttling, mail-bomb cap, content-type robustness, control characters. |
| `robustness.test.js` | 4 | **Every** route (discovered from Express) is hit with empty/garbage bodies, junk query strings and malformed ids as a super-admin: **no response may be 5xx**. |
| `media.test.js` | 11 | Avatar size limits, real file served (not SPA fallback), magic-byte checks, SVG/disguised content rejected, per-user isolation. |
| `email.test.js` | 6 | Console never claims delivery; **real SMTP conversation**; SES request shape; HTML-escaped templates; retry/backoff/dead-letter. |
| `config.test.js` | 5 | Production refuses to start on unsafe configuration. |

### Browser tests (`e2e/journey.spec.js`)
Arabic/RTL default and English/LTR toggle with dark-theme persistence; no horizontal overflow at 375 px on 6 public pages; 404 and 403 pages; anonymous visitors are asked to sign in; sign-up -> unverified banner -> server refuses join; verify via emailed link (single-use) -> join -> post appears; forgot/reset password end to end; settings (sessions, data export); **avatar upload and removal**; **paid checkout with Paymob off is honest and grants nothing**; account deletion; plain member vs admin vs moderator UI; CMS announcement appears site-wide; a feature flag hides a tab.

## 3. Bugs the tests found (and that are now fixed)
These are the reason the test depth matters; every one was invisible to "does it return 200?" checking.

| # | Bug | Found by | Impact if shipped |
|---|---|---|---|
| 1 | **Paid checkout always returned 500** from a browser: the frontend `api()` helper dropped `Content-Type` whenever a caller set its own header (the checkout's `Idempotency-Key`). *Pre-existing in the supplied frontend.* | Browser E2E | No customer could ever buy a plan. |
| 2 | **Avatar upload always failed**: the CSP allowed `data:` images but the resize step used `blob:` URLs. | Browser E2E | Every avatar upload broken in production. |
| 3 | Malformed ids (`/posts/not-a-uuid`) returned **500 on PostgreSQL** (SQLite returned 404) across dozens of routes. | Robustness sweep on real Postgres | Error-alarm floods; scanners could trigger 500s at will. |
| 4 | Email outbox: after a transient failure the job was stranded in `processing` forever (stale in-memory status made Sequelize skip the write). | `email.test.js` | One SES hiccup silently lost that email until restart. |
| 5 | A request body larger than 80 KB blocked **all** avatar uploads (global parser rejected before the route's own). | `media.test.js` | Uploads >80 KB failed with a raw 413. |
| 6 | `/media` was never mounted; the SPA fallback answered `200 index.html` for image URLs (a test that only checked status 200 had hidden this). | Content-type assertion | Broken images. |
| 7 | Search (`LIKE`) was case-sensitive on PostgreSQL only. | PostgreSQL run | Member/user search silently missed results in production. |
| 8 | A NUL byte in a query string returned 500 on `/search` and `/admin/users`. | Robustness sweep | Unauthenticated crash vector. |
| 9 | `status=<junk>` on admin payment/outbox lists returned 500 on PostgreSQL (ENUM). | Robustness sweep on Postgres | Same class as #3. |
| 10 | Absent JSON fields in `where` clauses (`req.body.community` undefined) threw -> 500. | Content-type regression test | Crash on malformed requests. |
| 11 | Two `Strict-Transport-Security` headers on every response (Nginx + app); and Nginx's default access log would have recorded one-time `?token=` secrets from verification/reset links. | Nginx integration test / audit | Scanner noise; secrets written to logs and CloudWatch. |
| 12 | `super_admin` was locked out of the admin UI by a hard-coded `role === "admin"`; the same equality check appeared in 3 frontend and 4 server places (moderators also had no authority anywhere). | Code review while writing RBAC tests | Top role unusable. |
| 13 | A partial refund cancelled the whole subscription. | Review | Customer loses paid access for a goodwill credit. |
| 14 | Webhook trusted any signed "success" without checking amount/currency. | Review | Underpayment could activate a plan. |
| 15 | `/curated-rooms` returned every applicant's id/status to everyone and omitted the fields the UI needs. | Review while wiring UI | Privacy leak + broken cancel button. |
| 16 | The notification **Email** toggle did nothing. | Review | Dead control. |
| 17 | JSON parse errors echoed internal parser text to clients. | Security test | Information disclosure. |

## 4. Performance (measured, not a capacity claim)
PostgreSQL 16 with **2,000 users, 6,000 posts, 12,000 comments, ~12,000 reactions**; one Node process; load generator and database on the **same Windows laptop** (so absolute numbers are pessimistic for the app and optimistic for network latency); 50 concurrent keep-alive connections, 8 s per scenario, rate limiting disabled for the test. **0 errors in every scenario.**

| Endpoint | Before optimisation | After |
|---|---|---|
| Feed `GET /posts` | 213 req/s - p50 207 ms - p95 397 ms | **408 req/s - p50 116 ms - p95 175 ms** |
| Search `GET /search?q=` | 244 req/s - p50 188 ms | **524 req/s - p50 93 ms - p95 116 ms** |
| Members directory | 905 req/s - p50 51 ms | 1,356 req/s - p50 35 ms |
| Communities / Plans | 1,641 / 1,528 req/s | 1,931 / 1,607 req/s |
| Authenticated `/me/summary`, `/notifications` | ~540 / ~480 req/s - p50 66-103 ms | unchanged |
| SPA shell | 3,513 req/s | 3,883 req/s |

Changes behind it: counts are now grouped queries per page (previously a comments x reactions x bookmarks **cartesian join per post**); 31 B-tree indexes on foreign-key / sort columns (migration `0002`); trigram (`pg_trgm`) indexes for substring search.

**What this does and does not tell you.** It shows no errors and acceptable latency at 50 concurrent connections on a laptop, and where the hot spots were. It does **not** establish how many users the platform supports: that needs a representative instance size (RDS class, EC2 type), a realistic read/write mix, and a soak test. Write-path load (posting, registering for events) was not load-tested.

## 5. What was NOT tested / known gaps
- **Live Paymob sandbox**: not called. Request shapes, the HMAC field order, the refund and transaction-inquiry endpoints follow Paymob's public documentation but are **unverified against the real service**. The refund-callback handling (`has_parent_transaction` semantics) is the most likely place to need adjustment.
- **AWS SES, S3, RDS, IAM, CloudWatch, certbot**: not exercised (no account). Code paths exist and are stub/mock tested only.
- **systemd units / `ec2-setup.sh` / `deploy.sh` / `ssl-setup.sh` / `rollback.sh`** were syntax-checked (`bash -n`) but **never executed on an Ubuntu host**. Treat the first real run as a rehearsal on a staging instance.
- **Browser coverage** is Edge (Chromium) only; no Firefox/Safari; no screen-reader or keyboard-only audit; no visual-regression baseline.
- **Not browser-tested** (API-tested only): room apply/cancel/feedback UI, organization team UI, admin group/room/plan/user/payment panels (tabs render; actions are API-tested), messaging, events registration UI, mentorship UI.
- **Preview (localStorage) mode** is preserved and builds, but is not covered by the suite.
- **Load**: single-node only; no write-path or soak testing; no CDN.
- **Not implemented** (documented, not faked): AI assistant (blueprint marks it blocked pending provider, privacy and evaluation approval), tenant isolation for organizations, file types other than images, WebAuthn. Google sign-in, Paymob event tickets, SES and S3 are implemented but verified only against in-process stubs, never against the live services.
- **Database upgrade path:** a database created by the previous release (f7bc609, migrations 0001-0003) was upgraded in place with 0004-0005 on PostgreSQL 16; the new app booted on it and served events and posts; 0005 and 0004 rolled back and re-applied cleanly.

## 6. Release gate checklist
| Gate | State |
|---|---|
| Server tests green on SQLite + PostgreSQL | pass |
| Browser tests green | pass |
| Production build | pass |
| Prod config refuses unsafe settings | pass (tested) |
| Prod boot incl. migrations, graceful shutdown | pass (container) |
| Backup + restore proven | pass |
| Nginx + app integration | pass |
| Dependency audit (production deps) | 2 moderate accepted (see SECURITY_AUDIT.md); nodemailer fixed |
| Staging deploy rehearsal on EC2 | **open** |
| Paymob sandbox E2E (checkout, webhook, refund) | **open - needs credentials** |
| SES domain verified + out of sandbox + test mail delivered | **open - needs AWS** |
| S3 bucket + IAM role + upload test | **open - needs AWS** |
| Restore drill from an RDS snapshot | **open** |
| Penetration test / independent security review | **open (recommended)** |
| Accessibility audit (WCAG) with assistive tech | **open** |
| Legal pages reviewed (privacy, terms, refunds) | **open - business** |

## 7. External dependencies that block "production verified"
1. **Paymob** merchant account: API key, secret/public keys, card integration id, iframe id, HMAC secret; set the dashboard's *transaction processed callback* to `https://<domain>/api/v1/payments/webhook/paymob` and the *redirection URL* to `https://<domain>/billing?payment=return`.
2. **AWS account** with permission to create: EC2, RDS PostgreSQL, S3, SES (verified domain/identity + production access), IAM instance role, CloudWatch, SNS topic for alarms, an Elastic IP and a DNS A record. **No resources have been created and no cost incurred.**
3. A **domain name** and DNS control.
4. A decision on **who is on call** for the alarms (SNS subscription).
5. Business sign-off on pricing, refund policy and legal copy.
