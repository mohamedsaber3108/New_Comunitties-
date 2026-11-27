# RBAC and authorization matrix

Updated 2026-11-27 to match the code on main (`28f5fd8`). Enforced on the server (`server/index.js` `auth`, `atLeast`, `hasRole`); the 401 and 403 cases are tested for every admin, money and export route in `server/permissions.test.js`.

Roles: `member` < `moderator` < `admin` < `super_admin`. A higher role passes every check a lower role passes.

| Action | Guest | Member | Moderator | Admin | Super admin |
|---|---:|---:|---:|---:|---:|
| Read public communities, feed, events, resources | yes | yes | yes | yes | yes |
| Join a community, post, comment, react, save, report | no | yes (verified email when required) | yes | yes | yes |
| Edit or delete a post | no | own | own; remove others from the reports queue | own | own |
| Register for events, apply to rooms, request mentors | no | own account | own account | own account | own account |
| Work the reports queue | no | no | yes | yes | yes |
| Create events, offers, challenges, groups, rooms; review orgs, mentors, submissions, contact | no | no | no | yes | yes |
| Manage users (suspend, reinstate), plans, promo codes, CMS, feature flags | no | no | no | yes | yes |
| Grant `admin` or `super_admin` | no | no | no | no | yes |
| Analytics, audit log, background jobs | no | no | no | yes | yes |
| Manual subscription activation when Paymob is live | no | no | no | no | yes |

Rules that apply to every role:
- Nobody changes their own role, and an admin cannot change another admin.
- A role change or a suspension ends every session of that user.
- Staff sessions (moderator and up) end after 30 minutes idle or 8 hours (`STAFF_SESSION_IDLE_MIN`, `STAFF_SESSION_MAX_HOURS`); member sessions last `SESSION_DAYS`.
- When `REQUIRE_ADMIN_MFA=true`, staff without two-factor get `403 mfa_setup_required` on staff routes. In production the app does not start unless that flag and `MFA_ENCRYPTION_KEY` are set, or `ALLOW_STAFF_WITHOUT_MFA=true` (logs a warning).
- Organizations have team roles (owner, admin, member) for their own organization only; they are not tenants.

Not implemented yet: group-scoped moderators and group admins, employee permission bundles (finance, support, content, analyst), and the two-person approval for manual activation and refunds (open PR #6).
