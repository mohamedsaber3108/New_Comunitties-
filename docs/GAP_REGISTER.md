# Gap register — evidence based

The attached material contained blueprints and earlier Kiro transcripts, but **no current source repository, git history, approved screenshots, credentials or production access**. This standalone implementation cannot preserve or repair unseen existing Hub code. Historical test counts and vulnerability reports are not treated as current evidence.

| Area | Status in this package | Next proof or dependency |
|---|---|---|
| Public design, four persona pages, AR/EN, light/dark, responsive CSS | implemented; local browser checked on representative desktop pages | compare to approved source/screenshots, full keyboard/mobile/contrast check |
| Accounts and sessions | partial | SSO, verification, recovery, MFA, durable rate limit |
| Official communities and membership | implemented baseline | current Hub merge, roles, group permissions |
| Feed and social | partial: posts and author edit UI, comments, reactions, bookmarks, following and blocks | media, rich posts, mute, stronger moderation, pagination |
| Events | free RSVP implemented | organizer workflow, check-in, QR, paid ticket provider |
| Challenges | text submissions and admin review implemented | stages, judges, files, appeals, certificates |
| Mentorship | reviewed profiles and requests implemented | scheduling, session lifecycle, calendar and trust evidence |
| Organizations | submit/approve directory implemented | verified reps, team roles, tenancy, partnerships |
| Offers | limited claim and optional code implemented | issuer verification, eligibility, redemption proof and partner analytics |
| Messages / realtime / Redis queues | consent-based persisted messages implemented; realtime absent | Socket.IO, Redis, read receipts UI, pagination, harassment and abuse controls |
| Notifications | in-app subset implemented | SES, preferences, queues and delivery logs |
| Search | basic public text search | relevance, privacy-tested indexing, filters, pagination |
| Guides, FAQ, onboarding, activity and support | eight bilingual guides, FAQ, member checklist/activity/events, contact queue | editorial review, scalable support operations and eventual email workflow |
| AI / NomadAI | blocked | provider contract, credentials, privacy and budget controls |
| Billing, freemium and paid tickets | blocked | gateway selection and compliance |
| Education/Career/Freelancing/Jobs data integration | blocked | API/SSO contracts; Jobs remains external source of truth |
| Production schema migration | absent | versioned migrations and reconcile existing data, no production writes |
| CI/browser E2E/observability | partial | isolated MySQL tests, browser runner, monitoring and backup drill |
| EC2/RDS/SES/S3/DNS | not touched | infrastructure approval and verified deployment |

Status never means the full 426-line master blueprint has been completed. See its original text in `docs/source/MASTER_BLUEPRINT.md`.
