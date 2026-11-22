# Development Progress Log

_Last updated 2026-11-04. Companion documents: `PROJECT_AUDIT_AND_PLAN.md` (roadmap), `FRONTEND_BACKEND_INTEGRATION_MATRIX.md`, `API_DOCUMENTATION.md`, `PRODUCTION_DEPLOYMENT_GUIDE.md`, `SECURITY_AUDIT.md`, `TESTING_AND_RELEASE_REPORT.md`._
_Working copy: `m:\Comunities _New\app`. The original archives under `_extracted\` are untouched backups._

## 1. Where things stand

| State | Meaning | Status |
|---|---|---|
| Implemented | code exists and works | **Everything in the plan except the items in section 5** |
| Integrated with frontend | UI wired to real API | **All 39 features in the integration matrix** |
| Automated tests passing | | **96/96 server (SQLite + PostgreSQL 16), 15/15 browser, 18/18 Nginx+app** |
| Production configuration verified | production-mode paths executed | **Partly** - boot, migrations, shutdown, Nginx, backup/restore verified in Linux containers; AWS-specific parts not |
| Production verified | running for real | **No - nothing is deployed** |

## 2. Phase status

| Phase | Item | State |
|---|---|---|
| 0 | Baseline, cross-platform fixes, originals preserved | done |
| 1 | Audit + roadmap + integration matrix | done (`PROJECT_AUDIT_AND_PLAN.md`, matrix) |
| 2 | Backend core: PostgreSQL, migrations, config guard, logging, request ids | done, tested |
| 2 | Identity: verify email, reset, change password, sessions, deletion, lockout, RBAC (4 roles) | done, tested (API + browser) |
| 2 | Services: email abstraction (console/SES/SMTP) + durable outbox; storage (local/S3); scheduler; housekeeping | done; SES/S3 stub-tested only |
| 2 | Payments: Paymob checkout, signed webhook, refunds, reconciliation, expiry, reminders | done; **mock-tested only** |
| 3 | Frontend wiring of every backend-only feature (rooms, org teams, avatar, flags/CMS, unblock, mentor request, my-connections, perk catalog, admin panels, billing, checkout) | done |
| 3 | New pages: forgot/reset/verify email, 403 | done |
| 4 | Deployment: Nginx, systemd, ec2-setup, deploy/rollback, backup/restore, TLS, CloudWatch, alarms | written; partly rehearsed locally (see testing report) |
| 5 | Tests: unit, integration, API fuzz, security, browser E2E, load | done (see testing report) |
| 5 | Docs: 7 documents | done |

## 3. Key decisions (and why)
| Decision | Reason |
|---|---|
| Keep Express 5 + Sequelize; no Django rewrite | Frontend already integrated; ~120 tested endpoints; owner's instruction. |
| PostgreSQL in production, SQLite for dev/test | Owner's instruction; **both are exercised by the same tests**, which caught several Postgres-only bugs. |
| Cookie sessions (opaque token, hash stored), not JWT | Existing design; revocable; no token in JS reach. |
| Outbox table + in-process worker, not Redis/SQS | Durable and inspectable with zero new infrastructure for a single node; documented migration path. |
| Verification/reset completed with POST | Mail scanners prefetch GET links and would burn one-time tokens. |
| Cancel-at-period-end for paid plans | A customer who paid for a year must not lose it by clicking Cancel. |
| Webhook validates amount + currency | A valid signature proves Paymob sent it, not that the amount is right. |
| Single global `app.param` UUID check | PostgreSQL throws on malformed UUIDs; one place fixes dozens of routes. |
| Replaced "assume it works" with real containers (Postgres, Nginx, Linux node) | Windows dev machine; production is Linux. |
| Did not take new dependencies for CI/browser beyond Playwright (dev) | Minimal supply-chain growth; load tester and doc generator are dependency-free scripts. |
| Accepted the `uuid` advisory in Sequelize | Not reachable (only `v1/v4`); the suggested fix is a destructive downgrade. |

## 4. Changes to the supplied frontend (all additive; design, routes, AR/EN, RTL, themes preserved)
New pages and components only, plus fixes to defects found by browser testing:
- **Bug fixes in existing code:** `api()` dropped `Content-Type` when custom headers were passed (broke paid checkout); hard-coded `role === "admin"` checks locked out super_admin.
- **New:** forgot/reset/verify pages, 403 page, verification banner, announcement banner, Settings security cards (avatar, email, password, sessions, blocked members, data/privacy), admin tabs (Check-in, Groups & rooms, Plans, Payments, Users, Feature flags, CMS, Background jobs, Audit log, Perk catalog), room cancel/feedback, organization team management, "My connections", billing history, mark-all-read, mentor request, flag-aware Participation tabs.
- The localStorage preview build still builds and runs; server-only cards are hidden there.

## 5. Not done (explicit)
AI assistant (blocked by the blueprint pending provider/privacy approval); WebAuthn and QR codes for MFA; multi-instance realtime; organization tenant isolation; non-image uploads; Sentry SDK wiring (alarms via CloudWatch instead); WCAG audit; non-Edge browser coverage; write-path load tests.

## 6. Blockers - need the owner
| # | Needs | Unblocks |
|---|---|---|
| 1 | Paymob sandbox, then live, credentials + dashboard callbacks | verifying checkout/webhook/refund for real (guide section 8) |
| 2 | AWS account (EC2, RDS, S3, SES, IAM, CloudWatch, SNS, EIP) and a **go-ahead to incur cost** | any deployment |
| 3 | Domain + DNS | TLS, email sender, links |
| 4 | A private Git remote | `deploy.sh` |
| 5 | Legal review of privacy/terms/refund policy; pricing sign-off | public launch |
| 6 | Decision: turn on `REQUIRE_ADMIN_MFA=true` for launch and generate `MFA_ENCRYPTION_KEY` (TOTP is built and tested; enforcement defaults to off) | closes the top security gap |

## 7. Test results log
| Date | Command | Result |
|---|---|---|
| 2026-11-03 | baseline `npm test` | 10/10 |
| 2026-11-03 | after identity/payments/media/admin | 29/29 |
| 2026-11-04 | + PostgreSQL run | first run exposed test-harness issue (shared DB); fixed with per-file databases |
| 2026-11-04 | full suite SQLite | **96/96** |
| 2026-11-04 | full suite PostgreSQL 16 | **96/96** |
| 2026-11-04 | browser E2E (Edge) | **15/15** (after fixing 2 real product bugs it found) |
| 2026-11-04 | Nginx + app container | **18/18** |
| 2026-11-04 | load test, 50 conns, 2k users / 6k posts | 0 errors; feed 213 -> 408 req/s, search 244 -> 524 req/s |
| 2026-11-04 | backup -> restore | identical counts + checksum |
| 2026-11-04 | production boot + SIGTERM | clean (12 ms shutdown) |
| 2026-11-10 | manual activation restricted to super_admin when Paymob is live | `payments.test.js` 13/13 |
| 2026-11-22 | promo codes + admin analytics (migration 0006); live host on HTTPS | 136/136 SQLite + 136/136 PostgreSQL; 26/26 E2E; live-release DB upgraded with 0006 |
| 2026-11-17 | realtime, paid tickets, post images, Google sign-in, org analytics, deletion purge, event cancel + refunds (migrations 0004-0005) | 125/125 SQLite + 125/125 PostgreSQL; 25/25 Edge E2E; 20/20 Nginx container checks; old-release DB upgraded in place |
| 2026-11-10 | TOTP two-factor (migration 0003) | `mfa.test.js` 8/8 (RFC 6238 vectors); migration add/down/re-add verified on PostgreSQL; full suite 105/105 SQLite + 105/105 PostgreSQL; Edge E2E 16/16 |

## 8. Housekeeping notes
- Local test infrastructure that I started is isolated and disposable: Docker container `kiro-usam-pg-16` (PostgreSQL 16, port 57432, throwaway credentials). Other containers on this machine belong to other projects and were never touched. Stop mine with `docker stop kiro-usam-pg-16`.
- Pinned, exact versions for every dependency added (`pg`, `nodemailer@10.3.1`, `@playwright/test@1.56.1`, AWS SDK clients as optional dependencies).
- Scratch files created during development were removed; helper tooling kept in `app/scripts/` (`loadtest.mjs`, `seed-load.mjs`, `gen-api-docs.mjs`, `validate-deploy.sh`, `nginx-integration.sh`).
