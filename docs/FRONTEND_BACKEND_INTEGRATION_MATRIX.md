# Frontend <-> Backend Integration Matrix

_Updated 2026-11-04. Source of truth: `app/src/main.jsx` (frontend), `app/server/*.js` (backend), `API_DOCUMENTATION.md` (generated from the live router)._

## Status legend (the six states are tracked separately and never merged)
| Column | Meaning |
|---|---|
| **Impl** | The backend logic exists and works. |
| **UI** | The existing frontend is wired to it (no dead buttons / no localStorage-only behaviour in the real build). |
| **Test** | Automated tests pass. `A` = API/integration (SQLite **and** PostgreSQL) - `B` = real-browser E2E - `M` = tested against a **mock** of an external service only - `-` = none |
| **Cfg** | Production *configuration* verified: the production-mode code path was actually executed (container boot, Nginx, migrations) or validated by the config guard. `ext` = depends on an external account/credential that does not exist yet. |
| **Prod** | Verified in a real production environment. **Nothing is production verified** - no deployment or live credentials exist. Shown as `no` everywhere. |

Symbols: ✔ done - ◐ partial (see note) - ✘ not done

## 1. Platform-wide guarantees
| Capability | Impl | UI | Test | Cfg | Prod | Notes |
|---|---|---|---|---|---|---|
| PostgreSQL support + versioned migrations (`0001` schema, `0002` indexes) | ✔ | n/a | A | ✔ | no | SQLite kept for dev/tests. Production refuses SQLite. |
| Consistent JSON error envelope `{error: code}`, no 5xx on bad input | ✔ | ✔ | A (fuzz of all 154 routes) | ✔ | no | |
| Security headers + CSP, CSRF origin check, secure cookie | ✔ | ✔ | A, B | ✔ | no | Verified through a real Nginx. |
| Rate limiting (app) + Nginx limits | ✔ | n/a | A, container | ✔ | no | In-process store: single node. |
| Structured logs, request ids, graceful shutdown, health | ✔ | n/a | container | ✔ | no | |
| Background jobs: email outbox (retry/backoff/dead-letter), scheduler | ✔ | admin tab | A | ✔ | no | |
| Data retention housekeeping | ✔ | n/a | A | ✘ | no | Hard purge of deleted accounts not implemented. |
| Backup / restore | ✔ | n/a | container | ✔ | no | Local pg_dump -> restore proven; RDS PITR not exercised. |
| AR/EN, RTL/LTR, light/dark preserved | ✔ | ✔ | B | n/a | no | Edge only; no visual-regression baseline. |

## 2. Features
| # | Feature (what the user sees) | UI route / component | API | Rules enforced server-side | Impl | UI | Test | Cfg | Prod |
|---|---|---|---|---|---|---|---|---|---|
| **Accounts & security** |
| 1 | Sign up / sign in / out | `/signup` `/login` `Auth` | `POST /auth/signup,login,logout,logout-all`, `GET /me` | bcrypt, password policy, lockout after 10 failures, throttles, suspended/deleted blocked | ✔ | ✔ | A,B | ✔ | no |
| 2 | Email verification (+banner, resend) | `/verify-email`, banner, Settings | `POST /auth/verify-email`, `POST /auth/resend-verification` | single-use hashed 24 h token; unverified blocked from write actions | ✔ | ✔ | A,B | ext (SES) | no |
| 3 | Forgot / reset password | `/forgot-password` `/reset-password` | `POST /auth/password/forgot,reset` | no enumeration; 1 h token; revokes sessions; 3/h per address | ✔ | ✔ | A,B | ext (SES) | no |
| 4 | Change password; sessions & devices; sign out everywhere | Settings | `POST /users/me/change-password`, `GET/DELETE /users/me/sessions` | current password required; others revoked | ✔ | ✔ | A,B | ✔ | no |
| 5 | Export my data; delete my account | Settings | `GET /users/me/export`, `DELETE /users/me` | confirmation word; anonymise; sessions destroyed | ✔ | ✔ | A,B | ✔ | no |
| 6 | Profile, privacy toggles, avatar upload/remove | `/me` `/settings` | `PATCH /me`, `POST/DELETE /users/me/avatar` | field whitelist; magic-byte image check; size cap | ✔ | ✔ | A,B | ext (S3) | no |
| 7 | 403 page; protected-route sign-in prompt | `/403`, `Protected` | - | - | ✔ | ✔ | B | n/a | no |
| **Community & social** |
| 8 | Communities: list, join/leave | `/communities`, `/communities/:slug` | `GET/POST/DELETE /communities...` | verified email to join | ✔ | ✔ | A,B | ✔ | no |
| 9 | Feed, post, edit, delete, comment, react, save, report | `/feed` `/posts/:id` `/saved` | `/posts...`, `/saved`, `/reports` | owner or moderator+ may delete; blocked authors hidden | ✔ | ✔ | A,B (post) | ✔ | no |
| 10 | Member directory, profiles, follow, block / **unblock**, "My connections" | `/members` `/members/:username` Settings `/me` | `/members...`, `/me/blocks`, `/me/network`, `/me/groups`, `/me/room-applications` | opt-in discoverability; blocks respected | ✔ | ✔ | A | ✔ | no |
| 11 | Direct messages | `/messages` | `/messages...` | consent + shared community + block rules | ✔ | ✔ | A | ✔ | no |
| 12 | Search + saved searches | `/search`, Participation | `GET /search`, `/saved-searches` | case-insensitive on every DB; flag `saved_searches` | ✔ | ✔ | A | ✔ | no |
| **Events, programs, learning** |
| 13 | Events: browse, register/cancel, waitlist, ticket, my events | `/events` `/events/:id` `/my-events` | `/events...`, `/my-events` | capacity transaction; verified email | ✔ | ✔ | A | ✔ | no |
| 14 | Admin: create event; **ticket check-in** | Admin -> Events / Check-in | `POST /admin/events`, `/admin/events/check-in` | idempotent check-in | ✔ | ✔ | A | ✔ | no |
| 15 | Challenges + submissions + admin review | `/challenges` `/my-submissions` Admin | `/challenges...`, `/admin/challenges...`, `/admin/submissions/:id` | one submission each; deadline | ✔ | ✔ | A | ✔ | no |
| 16 | Mentors: apply, directory, **request from a profile**, respond | `/mentors` `/mentorship` profile | `/mentors...`, `/mentorship...` | duplicate request refused (409) | ✔ | ✔ | A | ✔ | no |
| 17 | Groups & chapters: join/leave, admin create + approve | Participation, Admin -> Groups & rooms | `/groups...`, `/admin/groups...`, `/admin/group-memberships/:id` | private groups need approval | ✔ | ✔ | A | ✔ | no |
| 18 | **Curated rooms**: apply, **withdraw / release seat**, **feedback**, admin accept + **check-in** | Participation -> Rooms, Admin -> Workflows | `/curated-rooms...`, `/room-applications/:id`, `/admin/room-applications/:id` | capacity; own data only (no applicant leak); feedback only after check-in; flag `rooms_applications` | ✔ | ✔ | A | ✔ | no |
| 19 | Perks: browse, apply (paid members), admin review + **catalog control** | `/perks`, Admin -> Member perks | `/perks...`, `/my-perk-applications`, `/admin/perks...` | paid membership; strict state machine | ✔ | ✔ | A | ✔ | no |
| 20 | Offers & claims | `/offers` | `/offers...` | atomic quantity, one claim each | ✔ | ✔ | A | ✔ | no |
| **Organizations** |
| 21 | Submit organization; admin review | `/organization/new`, Admin | `POST /organizations`, `/admin/organizations/:id` | review before listing | ✔ | ✔ | A | ✔ | no |
| 22 | **Organization teams**: add / remove members | Participation -> Teams | `/organizations/:id/team...`, `/organizations/mine` | owner or admin; approved orgs only; no member emails exposed | ✔ | ✔ | A | ✔ | no |
| 23 | Partnerships: request + admin pipeline | Participation, Admin -> Workflows | `/partnerships...`, `/admin/partnerships/:id` | enforced state machine; flag | ✔ | ✔ | A | ✔ | no |
| **Money** |
| 24 | Plans & pricing (public), dynamic **admin plan editor** | `/pricing`, Admin -> Plans | `GET /plans`, `/admin/plans...` | price only from DB; audited | ✔ | ✔ | A,B (tab) | ✔ | no |
| 25 | Checkout -> hosted payment | `/checkout/:plan` | `POST /subscriptions`, `POST /payments/checkout/:id` | server price; `Idempotency-Key`; verified email | ✔ | ✔ | A,B (Paymob off), **M** (on) | ext | no |
| 26 | Payment confirmation (webhook), entitlement | `/billing` polling | `POST /payments/webhook/paymob` | HMAC; amount+currency check; dedupe; no downgrade/resurrection | ✔ | ✔ | **M** | ext | no |
| 27 | Billing page: status, cancel-at-term-end, history | `/billing` | `GET /billing`, `DELETE /subscriptions/current`, `GET /payments/mine` | access kept until term end | ✔ | ✔ | A,B | ✔ | no |
| 28 | Renewal reminder, expiry, abandoned-payment cleanup, reconciliation | email + Billing | scheduled `payment_maintenance`, `POST /admin/payments/:id/reconcile` | once per term | ✔ | ✔ | A, **M** | ext | no |
| 29 | Admin: ledger, **refund** (partial/full), reconcile | Admin -> Payments | `/admin/payments...` | audited; provider call must succeed first | ✔ | ✔ | **M** | ext | no |
| 30 | Manual activation (offline payment, break-glass) | Admin -> Subscriptions | `PATCH /admin/subscriptions/:id/activate` | admin+ (super_admin only when Paymob is live), audited | ✔ | ✔ | A | ✔ | no |
| **Notifications** |
| 31 | In-app notifications, mark one / **all** read | `/notifications` | `/notifications...` | owner only | ✔ | ✔ | A | ✔ | no |
| 32 | Preferences: in-app, **immediate email**, **daily/weekly digest** | Participation -> Preferences | `/notification-preferences`; job `notification_digests` | digest batches; opt-in | ✔ | ✔ | A | ext (SES) | no |
| **Administration** |
| 33 | Overview, reports queue (moderators too), contact queue | Admin | `/admin/overview,reports,contact` | moderator+ for reports; admin+ otherwise | ✔ | ✔ | A,B (roles) | ✔ | no |
| 34 | Users: search, suspend/reinstate, roles | Admin -> Users | `/admin/users...` | only super_admin grants admin; no self-edit | ✔ | ✔ | A | ✔ | no |
| 35 | **Feature flags** (enforced on server) | Admin -> Feature flags | `/admin/feature-flags`, `GET /platform-config` | `feature_disabled` 403 | ✔ | ✔ | A,B | ✔ | no |
| 36 | **CMS** + site-wide announcement | Admin -> CMS | `/admin/cms...`, `GET /platform-config` | only published content is public; rendered as text | ✔ | ✔ | A,B | ✔ | no |
| 37 | Background jobs viewer + retry; audit log | Admin | `/admin/outbox...`, `/admin/audit` | admin+ | ✔ | ✔ | A | ✔ | no |
| 38 | Contact form | `/contact` | `POST /contact` | honeypot; throttled | ✔ | ✔ | A | ✔ | no |
| 40 | Two-factor sign-in (TOTP + recovery codes), staff enforcement | Settings -> Two-factor, login code prompt | `/auth/mfa/*`, `POST /auth/login` (`mfaCode`) | secret AES-256-GCM at rest; code replay blocked; disable/regenerate need password + code; `REQUIRE_ADMIN_MFA` gates staff routes | ✔ | ✔ | A (RFC 6238 vectors), B | needs `MFA_ENCRYPTION_KEY` | no |
| **Static / content** |
| 39 | Home, explore, programs, rooms, partners catalogs, resources, FAQ, legal, 404 | public routes | (static content in `src/*.js`) | - | ✔ | ✔ | B (overflow, 404) | n/a | no |

## 3. Routes (frontend) - complete list
Public: `/` `/communities` `/communities/:slug` `/explore` `/programs` `/rooms` `/partners` `/pricing` `/resources` `/resources/:slug` `/faq` `/contact` `/about` `/how-it-works` `/guidelines` `/privacy` `/terms` `/refund-policy` `/accessibility` `/perks` `/403` `*`(404)
Auth: `/login` `/signup` `/forgot-password` `/reset-password` `/verify-email`
Member: `/home` `/me` `/settings` `/feed` `/posts/:id` `/saved` `/events` `/events/:id` `/my-events` `/challenges` `/challenges/:id` `/my-submissions` `/activity` `/messages` `/messages/:id` `/mentorship` `/mentors` `/offers` `/members` `/members/:username` `/organizations` `/organization/new` `/opportunities` `/search` `/notifications` `/participation` `/checkout/:planCode` `/billing`
Admin/moderator: `/admin` (tabs gated by role)
Redirects: `/dashboard -> /home`, `/jobs -> /opportunities`

## 4. Backend endpoints with no direct UI (all intentional)
| Endpoint | Why |
|---|---|
| `GET /health` | infrastructure probe |
| `POST /payments/webhook/paymob` | called by Paymob, not browsers |
| `GET /payments/config` | informational (billing uses `paymentsConfigured` from `/billing`) |
| `GET /auth/verify-email/:token` | kept for compatibility; the UI uses `POST` so mail scanners can't burn the token |

## 5. Capabilities the original brief mentioned that are **not** built (stated, not faked)
| Capability | State | Why / next step |
|---|---|---|
| Real-time messaging / live notifications | ✘ | Polling only. Needs SSE/WebSocket + a pub/sub layer. |
| Google OAuth | ✘ | Schema ready (`googleId`, `authProvider`); no flow. |
| MFA beyond TOTP (WebAuthn/passkeys, SMS) | ✘ | TOTP + recovery codes are built (row 40). |
| Paid events / ticket sales | ✘ | API rejects `priceType: paid`. |
| Uploads beyond avatars (post images, challenge files) | ✘ | Storage layer is ready; endpoints are not. |
| Organization tenancy / analytics dashboards | ◐ | Teams exist; no tenant isolation or reporting. |
| AI assistant / NomadAI | ✘ | Deliberately not faked; needs provider, policy and evaluation. |
| Search engine (OpenSearch/Meilisearch) | ✘ | Postgres trigram indexes are used instead; revisit at scale. |
| Hard-purge of deleted accounts | ✘ | Accounts are anonymised and retained as stubs. |
| Cursor pagination on feeds | ◐ | Lists are capped (30/50), not paged. |

## 6. Honest summary
- **Implemented and wired to the frontend:** every feature in section 2 (39 rows). A scan of all 154 endpoints against every API call in the frontend shows each one is either used by the UI or listed in section 4 as intentionally UI-less. (A manual button-by-button audit of the whole UI was **not** performed, and the paid-checkout and avatar bugs in section 3 of the testing report show why browser testing matters.) The localStorage "preview" build is preserved unchanged for demos and hides server-only features.
- **Automated tests pass:** yes for all rows marked A/B on SQLite and PostgreSQL; payments are tested against a mock only (`M`).
- **Needs external accounts before anyone can call it production verified:** Paymob (rows 25, 26, 28, 29), SES (2, 3, 32), S3 (6), plus the AWS deployment itself.
- **Production verified:** none.
