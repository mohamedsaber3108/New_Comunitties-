# Gap register

Updated 2026-11-27 to match main (`28f5fd8`). Earlier versions of this file described a much smaller build and no longer apply. Feature status in detail: `docs/FINAL_PRODUCT_REPORT.md` and `docs/FRONTEND_BACKEND_INTEGRATION_MATRIX.md`.

| Area | Built today | Still missing |
|---|---|---|
| Design, AR/EN, light/dark, responsive | yes; lint gate with jsx-a11y (baseline of warnings) | formal WCAG audit, screen-reader test, per-post text direction (plan T-11, T-15) |
| Accounts and sessions | verification, reset, sessions list, TOTP MFA, Google code, shorter staff sessions, neutral sign-up reply | real email delivery, CAPTCHA (deferred), live Google client |
| Roles and admin | member/moderator/admin/super_admin, users, plans, coupons, CMS, flags, audit log | two-person approvals (open PR #6), group-scoped moderators, employee bundles, appeals |
| Communities and feed | posts, images, comments, reactions, bookmarks, follows, blocks, reports, cursor paging | rich editor, mutes, bans and appeals, paging on every long list (plan T-21) |
| Events | free with waitlist, paid tickets, check-in, cancel with refunds | paid leg needs Paymob |
| Mentorship | reviewed profiles and requests | scheduling and booking (plan T-17, waits on the paid decision) |
| Organizations | submit, approve, team roles, analytics | tenancy, verified representatives |
| Messages and realtime | consent-based messages, read receipts, SSE notifications | multi-server realtime (plan T-12) |
| Billing | plans, subscriptions, coupons with a 40% cap (open PR #9), billing history | live payments (Paymob keys), EGP/SAR display rules (plan P-03) |
| AI assistant | none | owner decision |
| Data | migrations 0001-0006, backups before every deploy, export, 30-day purge after deletion | off-host backups, restore drill on staging |
| CI | secret scan, lint, builds, API-docs check, tests on SQLite and PostgreSQL, npm audit, browser tests | branch protection (owner setting) |
| Hosting | deploy, rollback, backup and health scripts | staging host, alerts that reach a person (plan T-06, T-07) |
