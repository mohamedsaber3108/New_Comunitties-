# Engine and service catalog

| Engine / service | Inputs → outputs | Permission / failure modes | Status |
|---|---|---|---|
| Identity/session | email/password → server session | auth throttling; verify/reset/MFA absent | PARTIAL |
| Persona onboarding | profile/persona → checklist/community entry | owner scoped | IMPLEMENTED_TESTED |
| Community membership | member + official community → membership | unique constraint; transaction reconciliation still limited | IMPLEMENTED_TESTED |
| Feed/social graph | posts/comments/reactions/saves/follows/blocks → feed | author and visibility checks; no media/mute | IMPLEMENTED_TESTED |
| Events | event/capacity/registration → registered/waitlisted | free only; transactional capacity | IMPLEMENTED_TESTED |
| Rooms/curation | catalog → application journey | application/review/check-in models absent | PARTIAL |
| Programs/challenges | challenge/submission → review/feedback | membership and deadline checks | IMPLEMENTED_TESTED baseline |
| Mentorship | mentor profile/request → accepted/declined | review and ownership | IMPLEMENTED_TESTED baseline |
| Jobs gateway | context → external Jobs route | no duplicated job database | IMPLEMENTED_TESTED |
| Organizations | submission → approved/rejected directory record | admin review | IMPLEMENTED_TESTED baseline |
| Partnerships | partnership types → contact request | lifecycle and reporting absent | PARTIAL |
| Offers | offer/inventory/member → one claim | atomic quantity and uniqueness | IMPLEMENTED_TESTED |
| Messaging | opted-in members → stored conversation/messages | shared community/block checks; no realtime | PARTIAL |
| Notifications | system action → in-app notification | owner scoped; no digest/SES | PARTIAL |
| Search | bounded query → members/posts/events | visibility/block filtering baseline; no index/saved search | PARTIAL |
| Matching/recommendation | profile/context → ranked suggestions | no engine | MISSING |
| NomadAI/agent gateway | prompt/context/tools → cited suggestion | provider, RAG, quotas and evaluations absent | BLOCKED |
| Billing/entitlements | plan/payment → capability access | gateway/compliance absent | BLOCKED |
| Analytics/impact | actions → admin counts | real counts only; no event warehouse | PARTIAL |
| CMS | editorial input → published page/content | no generic CMS | MISSING |
| Feature flags | context → enabled state | no flag service | MISSING |
| Audit/observability | admin mutation → AuditLog | partial actions; no centralized logs/traces | PARTIAL |

No AI agent is represented as implemented. Human approval remains mandatory for invitations, hiring decisions, sanctions, publishing and financial actions.

