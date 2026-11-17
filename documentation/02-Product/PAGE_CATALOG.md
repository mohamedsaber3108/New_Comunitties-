# Page catalog and route inventory

| Route | Audience | Purpose | Reads / writes | Status |
|---|---|---|---|---|
| `/` | public | brand, four pathways and primary CTA | session only | IMPLEMENTED_TESTED |
| `/communities`, `/:slug` | public/member | official spaces, membership and community feed | communities, memberships, posts | IMPLEMENTED_TESTED |
| `/explore` | public | complete feature map | static links | IMPLEMENTED_UNVERIFIED |
| `/resources`, `/:slug` | public | eight bilingual practical guides | static guide catalog | IMPLEMENTED_TESTED |
| `/programs` | public/member | four persona programs | static catalog; community handoff | IMPLEMENTED_TESTED |
| `/rooms` | public/member | four curated-room formats and application journey | static catalog; community handoff | IMPLEMENTED_TESTED |
| `/partners` | public | partnership types and request route | static catalog; contact CTA | IMPLEMENTED_TESTED |
| `/faq`, `/contact` | public | help and contact request | contact write on server / local receipt hosted | IMPLEMENTED_TESTED |
| `/about`, `/how-it-works`, `/guidelines`, `/privacy` | public | product and policy information | static | PARTIAL: legal review pending |
| `/login`, `/signup` | public | account entry | server auth or local device profile | PARTIAL: SSO/verify/reset absent |
| `/home` | member | dashboard and onboarding | profile summary, posts, events | IMPLEMENTED_TESTED |
| `/feed`, `/posts/:id`, `/saved` | public/member | social graph content | posts, comments, reactions, bookmarks, reports | IMPLEMENTED_TESTED |
| `/events`, `/events/:id`, `/my-events` | public/member | free RSVP, ticket codes, check-in and personal registrations | events, registrations | IMPLEMENTED_TESTED |
| `/members`, `/members/:username` | public/member | opt-in directory and relationship actions | users, follow, block, conversations | IMPLEMENTED_TESTED |
| `/messages`, `/messages/:id` | member | consent-based direct messages | conversations/messages | PARTIAL: no realtime transport |
| `/mentors`, `/mentorship` | public/member | mentor discovery, onboarding and requests | mentors and requests | IMPLEMENTED_TESTED |
| `/challenges`, `/:id`, `/my-submissions` | member | program challenges and feedback | challenges/submissions | IMPLEMENTED_TESTED |
| `/organizations`, `/organization/new` | public/member | reviewed directory, submission and owner-scoped team administration | organizations, organization members | IMPLEMENTED_TESTED |
| `/offers` | public/member | reviewed perk claims | offers/claims | IMPLEMENTED_TESTED |
| `/perks` | public catalog / paid member application | public USAM product-credit and external-program catalog; paid-member applications and tracking | perks, subscriptions, perk applications | IMPLEMENTED_TESTED |
| `/opportunities`, `/jobs` | public/member | gateway to Jobs/Hiring | external links only | IMPLEMENTED_TESTED |
| `/search` | public/member | member/post/event discovery | bounded query | PARTIAL: no production search index |
| `/participation` | member | groups/chapters, curated-room applications, saved searches, notification preferences, partnerships and organization-team visibility | owner-scoped workflow records | IMPLEMENTED_TESTED |
| `/activity`, `/notifications`, `/settings`, `/me` | member | personal workspace | owner-scoped records | IMPLEMENTED_TESTED |
| `/admin` | admin | reviews, publishing, group/room/partnership/perk workflows, feature flags, CMS and metrics | admin endpoints/audit | PARTIAL: comprehensive analytics absent |
| `/403` | all | explicit permission page | none | MISSING |
| `*` | all | intentional 404 | none | IMPLEMENTED_TESTED |

All responsive/RTL behavior inherits the shared shell and tokens. Complete page-by-page keyboard, screen-reader and mobile-device evidence is still missing and is recorded in QA.

