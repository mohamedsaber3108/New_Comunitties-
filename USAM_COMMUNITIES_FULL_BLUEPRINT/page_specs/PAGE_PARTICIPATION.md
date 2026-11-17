# Page spec — `/participation`

- Audience: authenticated members.
- Purpose: one additive workspace for groups/chapters, curated-room applications, saved searches, notification preferences, partnership requests and organization-team visibility.
- Access: owner-scoped records only; admin review remains in `/admin`.
- Reads: `GET /groups`, `/curated-rooms`, `/saved-searches`, `/notification-preferences`, `/partnerships/mine`, `/organizations/mine`.
- Writes: group join/leave, room application, saved-search create/delete, notification-preference update and partnership request.
- States: loading, empty, pending, active/accepted, rejected/cancelled and API error.
- Security: authenticated route; backend ownership and community-membership gates; no client-only authorization assumption.
- Responsive/RTL: shared application shell, existing tokens, AR/EN and RTL/LTR.
- Acceptance: member cannot perform admin review; room application requires official-community membership; partner objective and contact data are validated.
- Files: `src/main.jsx`, `src/preview-api.js`, `server/index.js`, `server/db.js`.
- Status: IMPLEMENTED & TESTED.
