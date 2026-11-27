# Security Audit

_Scope: the whole application (React client, Express API, database layer, background jobs, deployment configuration). Date: 2026-11-04._
_Method: code review of every route and middleware, automated attack-style tests (`server/security.test.js`, `robustness.test.js`, `media.test.js`, `payments.test.js`, browser E2E), dependency audit, and running the real Nginx + app together._

**Honest limits.** This is a thorough engineering review, **not** an independent penetration test. Nothing here has been verified in a live AWS environment. See section 8 for what remains.

## 1. Summary
| Area | Status |
|---|---|
| Authentication & sessions | Strong baseline; TOTP two-factor available (enforceable for staff with `REQUIRE_ADMIN_MFA`) |
| Authorization (RBAC, ownership) | Enforced server-side on every protected route; tested |
| Input validation / injection | Parameterised queries throughout; fuzz-tested across all routes |
| CSRF / CORS | Origin check + SameSite=Lax + JSON-only; no CORS opened |
| XSS | React escaping + strict CSP (no inline script); stored text returned as inert JSON |
| Uploads | Type allow-list + magic-byte check + size cap + safe keys; no malware scanning |
| Payments | Signed webhook, amount/currency check, idempotency, server-side price; **unverified against live Paymob** |
| Secrets & config | Env-only; production refuses unsafe settings |
| Rate limiting / abuse | App-level + Nginx; single-node store |
| Logging & audit | Structured logs, request ids, DB audit trail; no secrets logged |
| Dependencies | 0 high/critical in production deps after fix; 2 moderate accepted |

## 2. Authentication & session security
| Control | Implementation | Evidence |
|---|---|---|
| Password storage | bcrypt cost 12 | code |
| Password policy | 10-200 chars, letter + digit, checked at signup, reset and change | `identity.test.js` |
| Session token | 32 random bytes in an `HttpOnly`, `SameSite=Lax` cookie (`Secure` enforced in production); **only SHA-256 stored** server-side | `security.test.js` (cookie flags), DB schema |
| Session lifetime/revocation | 30 days; per-device list + revoke; "sign out everywhere"; password change/reset revokes other sessions; suspension/deletion kills sessions and is re-checked on every request | `identity.test.js`, `admin.test.js` |
| Login | Uniform `invalid_credentials` for unknown user and wrong password (identical bodies); lockout 15 min after 10 failures; per-IP+email throttle | `security.test.js` |
| Email verification | Single-use hashed token, 24 h expiry; **completed with POST** so mail scanners that GET the link cannot burn it; unverified accounts blocked from posting/joining/messaging/paying | `identity.test.js`, E2E |
| Password reset | 1 h single-use hashed token; always answers 200 (no account enumeration); capped at 3/hour per target address; revokes all sessions; confirmation email | `identity.test.js`, `security.test.js` |
| Account deletion | Soft delete + anonymisation (email, name, bio, avatar), sessions destroyed, login impossible | `identity.test.js`, E2E |
| Account suspension | Blocks login and invalidates existing sessions immediately | `admin.test.js` |

- **Two-factor (TOTP, RFC 6238)**: enrolment in Settings; sign-in then requires `mfaCode` (authenticator code or single-use recovery code). Secret encrypted at rest (AES-256-GCM, `MFA_ENCRYPTION_KEY`); an accepted time step cannot be reused; recovery codes stored as SHA-256 hashes; disabling or regenerating codes needs password + a valid code; failed codes count toward the account lockout; a wrong password never reveals whether MFA is on. `REQUIRE_ADMIN_MFA=true` blocks moderator/admin/super_admin routes (`403 mfa_setup_required`) until enrolled and forbids staff from disabling it. Evidence: `mfa.test.js` (8 tests incl. RFC vectors), `e2e/mfa.spec.js`. **Not covered:** QR-code rendering (manual key entry / otpauth link only), WebAuthn, lost-device recovery by an admin (use `create:admin` or a DB reset of the MFA columns), losing `MFA_ENCRYPTION_KEY` (invalidates all enrolments).

**Known weaknesses.** (a) MFA is opt-in for members and enforceable for staff, but staff enforcement is OFF by default (`REQUIRE_ADMIN_MFA=false`) - turn it on before launch. (b) ~~`POST /auth/signup` returns `409 email_taken`~~ fixed by X-1, see the "X-1 decisions" section. (c) Sessions are not rotated on privilege change (role changes take effect on the next request because the role is read from the DB each time).

## 3. Authorization
- Hierarchy `member < moderator < admin < super_admin`, enforced by middleware (`auth`, `moderator`, `admin`, `superAdmin`) and an in-handler `hasRole()` helper. **No handler compares role strings directly** any more (that pattern had locked out super_admin and left moderators powerless).
- Only a `super_admin` can grant `admin`/`super_admin`; an admin cannot modify another admin; nobody can modify themselves via the admin endpoints. (`admin.test.js`)
- Resource ownership: posts, comments, sessions, notifications, organizations/teams, room applications, billing, exports are scoped to the caller; cross-account access returns 403/404. (`security.test.js` IDOR test)
- Moderators: reports queue and removing others' posts/comments only; every other admin route returns 403.
- Server-side feature flags (`requireFlag`) - hiding a button is cosmetic; the API itself refuses.
- **Admin manual subscription activation** (`PATCH /admin/subscriptions/:id/activate`) remains as an audited break-glass path for offline payments (bank transfer, support). It can grant paid access without a card payment. Every use is written to the audit log; **Once Paymob is configured (`PAYMOB_ENABLED` with keys) the route requires `super_admin`** (403 `super_admin_required` for plain admins); automated test in `payments.test.js`. With Paymob unconfigured (dev/staging) `admin` still works.

## 4. Input handling & injection
- All database access uses Sequelize with bound parameters; no string-built SQL. `SQL injection strings` in login, search and path parameters are inert (tested; table survives).
- Every user string passes `clean()` (trim, length cap, **control-character strip while preserving newlines/tabs**).
- Enum/status query parameters are allow-listed (Postgres rejects arbitrary strings against ENUM columns).
- Path ids are validated as UUIDs centrally (`app.param`), body type errors and database data-exceptions map to clean 4xx.
- **Fuzz sweep**: every route, discovered from the live router, is called with empty/null/mistyped/huge/array bodies, junk query strings and malformed ids; **no 5xx** on SQLite or PostgreSQL.
- Mass assignment is prevented by explicit field whitelists (`role`, `emailVerified`, `status`, `passwordHash`, `email` cannot be set through signup or `PATCH /me`).
- Body size: 80 KB everywhere, ~3 MB on the avatar path only; Nginx also caps at 256 KB (15 MB for avatar).

## 5. Browser-side protections
- **CSP** (set by the app on every response): `default-src 'self'; script-src 'self'` (no `unsafe-inline`/`unsafe-eval` for scripts); `object-src 'none'`; `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'`; `frame-src` only `accept.paymob.com`; `style-src` allows inline styles (React `style=`) and Google Fonts. Residual: inline styles permitted.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/mic/geolocation/payment off), `Cross-Origin-Opener-Policy: same-origin`, HSTS (Nginx, one header), `Cache-Control: no-store` on all API responses.
- **XSS**: user text is stored verbatim and rendered by React (auto-escaped); the CMS announcement is rendered as text, never HTML; email templates HTML-escape every interpolated value (tested).
- **CSRF**: state-changing requests with a foreign or `null` Origin get `403 origin_rejected`; cookies are `SameSite=Lax`; bodies must be JSON (forms cannot send it cross-site).
- No CORS headers are emitted (same-origin app). Third-party origins: Google Fonts only.
- Open redirects: none (post-login redirect is an in-app path).

## 6. Files, media, email
- **Uploads**: PNG/JPEG/WebP/GIF only, **magic bytes must match the declared type** (HTML/PHP/SVG disguised as images are rejected), size cap, server-generated random key (client filename never used), served with `nosniff` and a sandbox CSP in local mode. The browser re-encodes avatars, stripping EXIF/GPS. Since X-1 the real type comes from the bytes, not the declared type (see "X-1 decisions"). **Gap:** no external malware scanner and no server re-encode; if user media expands beyond images, add a scanning step (e.g. S3 + GuardDuty Malware Protection).
- **Email**: queued in a durable outbox with retry/backoff/dead-letter; templates escape values; password-reset and verification links contain only an unguessable token; Neither the app nor Nginx logs request bodies or query strings (Nginx uses a path-only `log_format`; verified by `scripts/nginx-integration.sh`). SES sender must be a verified identity (enforced by config check).

## 7. Payments
| Threat | Control | Tested |
|---|---|---|
| Forged "payment succeeded" from the browser | Frontend can only create a *pending* request; activation happens only from the HMAC-SHA512-verified webhook (constant-time compare) | yes |
| Client chooses its own price | Amount read from the `Plan` row server-side | yes |
| Underpayment / wrong currency | Webhook refused and flagged `amount_mismatch` when cents/currency differ | yes |
| Replay / duplicate delivery | Unique `(provider, eventId)`; duplicate = no-op, no second email | yes |
| Double charge from double-click/retry | `Idempotency-Key` on the request and a stable merchant order id; provider order reused | yes |
| Out-of-order callbacks | Late failure cannot downgrade a paid attempt; success cannot revive a refunded one | yes |
| Refund abuse | Admin-only, audited, bounded by remaining amount, only a full refund revokes membership; provider call must succeed before recording | yes (mock) |
| Lost webhook | Reconciliation job + admin "reconcile" action query the provider by merchant order id | yes (mock) |
| Entitlement after term end | `paidAccess` also checks `endsAt`, independent of the expiry job | yes |

**Unverified**: behaviour against the real Paymob service (field names, refund/inquiry endpoints, refund-callback semantics). Do not take live payments until the sandbox walkthrough in the deployment guide passes.

## 8. Infrastructure & configuration
- Secrets only via environment (`/etc/usam-communities/env`, root:usam 640). No secret is in source or logs.
- Production start-up **refuses** SQLite, non-HTTPS origins, insecure cookies, disabled rate limiting, `console` email with verification required, Paymob enabled without an HMAC secret, SES without a valid sender, S3 without a bucket (tested).
- systemd hardening: non-root user, `NoNewPrivileges`, `ProtectSystem=strict`, `PrivateTmp`, restricted namespaces/syscall architectures, empty capability set, memory cap, crash-loop limits.
- Nginx: TLS 1.2/1.3, per-IP request/connection limits, per-endpoint body limits, dotfiles blocked, `X-Forwarded-For` **overwritten** (clients cannot spoof their IP - tested), single HSTS header.
- UFW 22/80/443 only, fail2ban for SSH, unattended security upgrades, journald size cap.
- Backups: nightly + pre-deploy `pg_dump` (archive verified), optional private SSE-S3 copy; restore refuses to overwrite a non-empty database without an explicit flag. **Use RDS automated backups/PITR as the primary recovery path.**
- Alarms: error-rate, payment amount mismatch, repeated bad webhook signatures, health failures, CPU/disk.

## 9. Findings fixed during this audit
See `TESTING_AND_RELEASE_REPORT.md` section 3 (17 items). Security-relevant ones: webhook amount validation (#14), error-text disclosure (#17), unauthenticated NUL-byte crash (#8), `/curated-rooms` applicant leak (#15), mass-assignment/IDOR/CSRF hardening and tests, content-type spoofing on uploads, unbounded in-memory rate limiter, missing security headers/CSP, plain-text token handling.

## 10. Dependencies
`npm audit` (production dependencies): **3 -> 2 findings, 0 high/critical.**
- **nodemailer (high)** - many address/header-injection and DoS advisories: **upgraded to 10.3.1 (pinned)**; SMTP path re-tested against a live socket.
- **sequelize -> uuid <11.1.1 (moderate, 2 entries)** - affects `uuid.v3/v5/v6` called with a caller-supplied `buf`; Sequelize only calls `v1/v4`, so it is **not reachable**. The suggested "fix" is a downgrade to Sequelize 3.x, which would be destructive; **accepted risk**, revisit on the next Sequelize 6 release.
- Dev-only advisories (build tooling) do not ship: `deploy.sh` runs `npm prune --omit=dev`.
Recommended: enable Dependabot/Renovate and run `npm audit --omit=dev` in CI.

## 11. Residual risks & recommendations (priority order)
1. **Set `REQUIRE_ADMIN_MFA=true` and `MFA_ENCRYPTION_KEY`** and enrol every staff account (TOTP is built and tested; it is not yet enforced by default). Consider WebAuthn later.
2. Run an **independent penetration test** before opening registration publicly.
3. **Rate-limit store** is in-process: correct for one node; move to Redis before adding a second instance.
4. **CAPTCHA/proof-of-work** on signup/forgot-password: deferred, review 2027-03-01 (see "X-1 decisions").
5. External upload scanning if media features grow beyond images.
6. Switch CSP to include `report-to` (collect violations) and consider removing `style-src 'unsafe-inline'` by moving inline styles to classes.
7. Restrict manual subscription activation to `super_admin` once Paymob is live.
8. Notify users by email on password change from a new device / account lockout (password-change email exists; lockout email does not).
9. Document and rehearse incident response (key rotation: `PAYMOB_*`, DB password, session invalidation by truncating `Sessions`).
10. WCAG audit with assistive technologies (not performed).

## 12. X-1 decisions (2026-11-27)
Default taken from QUESTIONS Q-04; the owner may change it.

| Gap | Decision | Detail |
|---|---|---|
| Email enumeration (`409 email_taken` on sign-up) | **FIX** | `POST /auth/signup` returns the same `202 { ok, next: "check_email" }` for a new and an existing address. No session is issued; the member signs in after sign-up. An existing account is not changed. Its owner gets the email `signupAttemptExisting` ("someone tried to sign up with your address; sign in or reset your password"). A password is still hashed so timing is similar. The UI shows one neutral Arabic/English message with sign-in and reset links. A race between two sign-ups for one address gets the same reply. |
| No CAPTCHA | **DEFER** | Keep the existing sign-up rate limit (per IP + email, 30 per 15 minutes). Add a CAPTCHA only if bot sign-ups appear. Review date **2027-03-01**. If added, it must have an accessible path with no puzzle-only step. |
| No upload malware scan | **FIX by content check** | The real image type is read from the file's magic bytes (JPEG, PNG, WebP, GIF). The declared type and file name are ignored. Anything else is refused `400 unsupported_image` with a plain Arabic/English message. EXIF/metadata stripping is kept. No external scanner and no new dependency. |

Residual: a file can still carry a valid image header with odd data after it. The bytes are stored as an image and served with `nosniff`; an external scanner stays an option if media grows.
Tests: `server/identity.test.js`, `server/api.test.js` (existing address), `server/media.test.js` (text renamed `.png` refused, real PNG passes), `e2e/journey.spec.js`.
