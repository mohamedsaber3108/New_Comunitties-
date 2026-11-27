# RBAC and authorization matrix

Updated 2026-11-27 to match the code on main. Enforced on the server (`server/index.js` `auth`, `atLeast`, `hasRole`); the 401 and 403 cases are tested for every admin, money and export route in `server/permissions.test.js`.

Roles: `member` < `moderator` < `admin` < `super_admin`. A higher role passes every check a lower role passes.

| Action | Guest | Member | Moderator | Admin | Super admin |
|---|---:|---:|---:|---:|---:|
| Read public communities, feed, events, resources | yes | yes | yes | yes | yes |
| Join a community, post, comment, react, save, report | no | yes (verified email when required) | yes | yes | yes |
| Edit a post or comment | no | own | own | own | own |
| Delete a post or comment | no | own | any | any | any |
| Register for events, apply to rooms, request mentors | no | own account | own account | own account | own account |
| Work the reports queue | no | no | yes | yes | yes |
| Create events, offers, challenges, groups, rooms; review orgs, mentors, submissions, contact | no | no | no | yes | yes |
| Manage users (suspend, reinstate), plans, promo codes, CMS, feature flags | no | no | no | yes | yes |
| Grant `admin` or `super_admin` | no | no | no | no | yes |
| Analytics, audit log, background jobs | no | no | no | yes | yes |
| Request a refund (another admin approves) | no | no | no | yes | yes |
| Approve a refund request (not your own) | no | no | no | yes | yes |
| Request a manual subscription activation | no | no | no | yes | yes |
| Approve a manual activation (not your own) | no | no | no | no | yes |

Rules that apply to every role:
- Nobody changes their own account. An admin cannot change the role of another admin or super admin; only a super admin grants `admin` or `super_admin`.
- Suspend and reinstate are not limited by the target role today: an admin can suspend another admin or a super admin. This is a known gap to fix in code.
- A role change or a suspension ends every session of that user.
- Staff sessions (moderator and up) end after 30 minutes idle or 8 hours (`STAFF_SESSION_IDLE_MIN`, `STAFF_SESSION_MAX_HOURS`); member sessions last `SESSION_DAYS`.
- When `REQUIRE_ADMIN_MFA=true`, staff without two-factor get `403 mfa_setup_required` on staff routes. In production the app does not start unless that flag and `MFA_ENCRYPTION_KEY` are set, or `ALLOW_STAFF_WITHOUT_MFA=true` (logs a warning).
- Organizations have team roles (owner, admin, member) for their own organization only; they are not tenants.

Manual activation and refunds follow a two-person rule (`server/approvals.js`): the request only files a pending item, a different admin decides it, and an activation needs a super admin.

Not implemented yet: group-scoped moderators and group admins, and employee permission bundles (finance, support, content, analyst).
