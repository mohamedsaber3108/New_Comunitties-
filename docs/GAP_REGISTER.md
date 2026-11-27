# Gap register

Updated 2026-11-27 to match the code on main. Earlier versions of this file described a much smaller build and no longer apply. Feature detail: `docs/FINAL_PRODUCT_REPORT.md` and `docs/FRONTEND_BACKEND_INTEGRATION_MATRIX.md`.

| Area | Built and tested in code | Still missing |
|---|---|---|
| Design, AR/EN, light/dark, responsive | yes; CI lint gate with jsx-a11y (fails on new warnings) | formal WCAG audit, screen-reader test, per-post text direction for mixed Arabic and English |
| Accounts and sessions | verification, reset, sessions list, TOTP two-factor, Google sign-in code, shorter staff sessions, neutral sign-up reply, "session ended" notice | real email delivery, CAPTCHA (deferred), a live Google client |
| Roles and admin | member/moderator/admin/super_admin, users, plans, coupons, CMS, flags, audit log, two-person approval for manual activation and refunds | role limit on suspend and reinstate, group-scoped moderators, employee permission bundles, bans, mutes and appeals |
| Communities and feed | posts, images, comments, reactions, bookmarks, follows, blocks, reports, cursor paging on the feed | rich editor, paging on every long list |
| Events | free with waitlist, paid tickets, check-in, cancel with refunds | the paid leg needs Paymob keys |
| Mentorship | reviewed profiles and requests | scheduling and booking |
| Organizations | submit, approve, team roles, analytics | tenancy, verified representatives |
| Messages and realtime | consent-based messages, read receipts, Server-Sent Events notifications (one process) | realtime across more than one server |
| Billing | plans, subscriptions, coupons with a server-side cap (40% by default) and price floor (10 EGP by default), billing history | live payments (Paymob keys), currency and tax display rules |
| AI assistant | none | owner decision |
| Data | migrations 0001-0007, a database dump before every deploy, data export, purge 30 days after deletion | off-host backups, a restore drill on a staging copy |
| CI | secret scan, lint, shell syntax, builds, API-docs check, tests on SQLite and PostgreSQL, npm audit, browser tests | branch protection (a repository setting) |
| Hosting | deploy, rollback, backup and health scripts in `deploy/` | a staging host, alerts that reach a person |
