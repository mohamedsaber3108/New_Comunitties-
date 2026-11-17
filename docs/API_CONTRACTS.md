# API contracts — `/api/v1`

JSON requests and responses. Cookie `usam_session` is httpOnly, SameSite=Lax, Secure in production. Errors return `{ "error": "machine_readable_code" }`. Most mutations require sign-in and same-origin requests. The following is the implemented surface, not a full OpenAPI specification.

| Area | Routes | Access |
|---|---|---|
| Health | `GET /health` | public |
| Auth | `POST /auth/signup`, `POST /auth/login`, `POST /auth/logout`, `POST /auth/logout-all`, `GET /me`, `PATCH /me` | respective auth rules |
| Member workspace | `GET /me/summary`, `GET /activity`, `GET /my-events` | signed-in owner only; activity returns up to 50 recent entries |
| Contact | `POST /contact` | public, validated fields and basic per-IP throttling; saves a request for admin review |
| Communities | `GET /communities`, `GET /communities/:slug`, `POST/DELETE /communities/:slug/join` | read public, mutation member |
| Feed | `GET /posts`, `GET /posts/:id`, `POST /posts`, `PATCH/DELETE /posts/:id`, `POST /posts/:id/comments`, `DELETE /posts/:id/comments/:commentId`, `PUT/DELETE /posts/:id/reaction`, `PUT/DELETE /posts/:id/bookmark`, `GET /saved`, `GET /posts?mode=following`, `POST /reports` | member mutation; post creation requires membership |
| Events | `GET /events`, `GET /events/:id`, `POST/DELETE /events/:id/register` | read public, free registrations member |
| Challenges | `GET /challenges`, `GET /challenges/:id`, `POST /challenges/:id/submissions`, `GET /my-submissions` | submission requires membership |
| Mentors | `GET /mentors`, `POST /mentors`, `POST /mentors/:id/request`, `GET /mentorship`, `PATCH /mentorship/:id` | request/member; response mentor owner |
| Network & messages | `PUT/DELETE /members/:id/follow`, `GET /me/network`, `PUT/DELETE /members/:id/block`, `GET /messages`, `POST /messages/start`, `GET/POST /messages/:id`, `PATCH /messages/:id/read` | member; messaging requires both opt-ins, shared community and no block |
| Directory | `GET /members`, `GET /members/:username`, `GET /organizations`, `POST /organizations`, `GET /offers`, `POST /offers/:id/claim`, `GET /search?q=`, `GET /notifications`, `PATCH /notifications/:id/read` | opt-in member visibility and ownership enforced |
| Admin | `GET /admin/overview`, `/admin/contact`, `/admin/reports`, `/admin/organizations`, `/admin/mentors`, `/admin/challenges/:id/submissions`; `PATCH /admin/contact/:id` and other review endpoints; `POST /admin/events`, `/admin/offers`, `/admin/challenges` | platform admin only |

List endpoints currently return `items` without pagination. The lack of OpenAPI, cursors, response schema generation and API contract tests across an existing Hub repo is recorded in the gap register.
