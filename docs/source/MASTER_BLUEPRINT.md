# USAM HUB / COMMUNITIES — MASTER PRODUCT, DESIGN & ENGINEERING BLUEPRINT

> **Execution brief for ChatGPT Work — build and finish the actual product, not only a mockup.**
>
> **Scope:** USAM Hub / Communities, integrated into the broader USAM ecosystem. **Primary language:** Arabic + English, with first-class RTL/LTR. **Infrastructure:** AWS only. **Canonical domain:** `hub.usamif.com` (domain cutover is a separate approval stage).
>
> **Preservation rule:** Keep the existing product's approved visual direction, navigation conventions, components, and functionality. Extend and improve it; do not redesign established screens wholesale. If the most recent approved visual reference is not available in the workspace, inspect the current repo/screenshots and ask for the precise reference before changing the visual language. Do not invent a “previously approved” palette or font.

---

## 0. Mission, acceptance standard, and working rules

You are an integrated team of product director, UX/UI designer, staff frontend engineer, staff backend engineer, AI engineer, platform architect, QA lead, and security engineer. Audit existing implementation first; then execute end-to-end work across components, APIs, persistence, tests, and documentation. Treat this document as a **target product specification**, not a claim that every feature already exists.

The end state is a polished, fast, professional social and economic network for founders, freelancers, recruiters, and students; a community operating system connecting USAM Education, Career, Freelancing, Jobs/Hiring, and NomadAI. **No static fake dashboards, dead buttons, inaccessible routes, pretend analytics, seeded fake customer data, or “coming soon” placeholders on production journeys.**

Rules:
- Start with a repo audit and a live status matrix: **exists and works / exists but broken / partial / absent / external integration blocked**. Preserve working code and functionality.
- Implement vertical slices: migration/model → API/service → authorization → frontend → empty/loading/error states → tests → docs. Avoid a giant untested commit.
- No pushes, merges into `main`, production deployments, paid resource creation, AWS config changes, DNS changes, production-data modifications, or destructive operations without explicit approval. Local development and reviewable local commits are allowed.
- **E-USAM Education at `edu.usamif.com` on agent-ai `13.49.49.246` is protected**: no changing its server, files, Docker, database, certificates, DNS, or services. The Hub target instance is `13.48.137.19`, but do not assume deployment has already happened.
- AWS only: EC2, Nginx, Node/Express, Sequelize/MySQL (RDS target), Redis, Socket.IO, S3, SES, IAM role, CloudWatch where appropriate. No Vercel or unauthorized platform migration.
- Use the repo's actual contracts and test outputs, not remembered counts or assumed deployment status. Report only what was verified.
- Arabic UI copy should be fluent Egyptian-friendly Modern Standard Arabic; English is equally complete. RTL applies to grids, drawers, icons, charts, forms, dates, and keyboard navigation.

### Definition of Done
- Every linked page exists and loads; every visible primary CTA performs a real, authorized action.
- Every CRUD flow persists reliably and returns correct states after refresh/relogin; related notifications update.
- Four personas have distinct but cohesive experiences and correct permissions.
- Real integrations are exercised where credentials are available. Missing dependencies are explicitly labeled **blocked**, not **done**.
- Security, accessibility, responsive layouts, loading/error states, observability, DB indexes, migrations, automation, and rollback are addressed.
- Automated backend, frontend, and browser E2E tests cover important flows and run in CI.

---

## 1. Positioning and information architecture

**Core positioning:** one professional identity, four specialized ecosystems, measurable pathways from learning and networking to opportunity, collaboration, and hiring.

**Four first-class communities (distinct personas and workflows):**

1. **LaunchPad — Founders & Investors:** startup profiles, cofounders, mentor matching, accelerator applications, founder updates, investor discovery and warm introductions, startup challenges, pitch events, fundraising-readiness resources, ecosystem offers.
2. **FreelanceSpace — Freelancers & Clients:** portfolios, skills, service offerings, collaboration requests, proposals/briefs, client discovery, expert sessions, project showcases, peer learning, creator perks. Actual paid contracts/payments require separate compliant integration and rules; don't fake escrow.
3. **HR Connect — Employers & Recruiters:** company pages, verified organizational representatives, talent discovery with consent, employer communities, hiring-related events, skill-based matchmaking, internship programs, referrals, interview scheduling, and redirect/integration with the USAM Jobs product as the job system of record.
4. **StudentZone — Students & Early Talent:** academic profiles, campus chapters managed by administrators, study circles, mentor access, competitions/challenges, internship discovery, learning pathways, campus events, projects, badges, and graduation-to-career transition.

**Shared platform:** Identity, Feed, Communities/Groups, Events, Challenges, Mentors, Opportunities, Resources, Offers & Perks, Organizations, Partnerships, Search, Messaging, Notifications, AI assistant, Analytics, Admin, Billing/Entitlements, Integrations.

### Proposed route map (adapt actual router before modifying)

| Area | Routes / pages | Key actions |
|---|---|---|
| Public | `/`, `/explore`, `/about`, `/how-it-works`, `/communities`, `/events`, `/offers`, `/organizations`, `/partners`, `/resources`, `/faq`, `/contact` | Discover, search, filter, view details, join/sign up |
| Identity | `/login`, `/signup`, `/auth/callback`, `/forgot-password`, `/reset-password`, `/verify-email`, `/onboarding` | OAuth/email sign-in, safe reset, SSO, persona selection |
| Personal | `/home`, `/dashboard`, `/me`, `/settings`, `/notifications`, `/messages`, `/saved`, `/activity` | Personalized daily feed, settings, interactions |
| Community | `/launchpad/*`, `/freelancespace/*`, `/hrconnect/*`, `/studentzone/*`, `/communities/:slug`, `/groups/:slug` | Distinct dashboards and participation |
| Social | `/feed`, `/posts/:id`, `/members/:username`, `/search` | Create, edit, comment, react, follow, block, report, discover |
| Events | `/events`, `/events/:slug`, `/events/:slug/tickets`, `/my-events`, `/organizer/events` | Tickets, RSVPs, registration, organizer management |
| Challenges | `/challenges`, `/challenges/:slug`, `/my-submissions` | Participate, submit, review, track awards |
| Mentors | `/mentors`, `/mentors/:id`, `/mentorship` | Discover, request, book, review session |
| Opportunity | `/opportunities`, `/opportunities/:slug`, `/jobs` | Browse, apply/express interest, or redirect to USAM Jobs |
| Commerce | `/offers`, `/offers/:slug`, `/offers/manage`, `/organizations`, `/organizations/:slug`, `/partnerships` | Promo codes, redemption, partner workflow |
| Organizations | `/organization/new`, `/organization/:slug/manage`, `/organization/:slug/team`, `/organization/:slug/analytics` | Profile, roles, invitations, analytics |
| Administration | `/admin`, `/admin/users`, `/admin/communities`, `/admin/content`, `/admin/reports`, `/admin/events`, `/admin/offers`, `/admin/organizations`, `/admin/partnerships`, `/admin/analytics`, `/admin/settings`, `/admin/audit` | Moderation, operations, approvals, analytics |
| Legal/help | `/terms`, `/privacy`, `/cookies`, `/community-guidelines`, `/help`, `/accessibility` | Transparency, support, data controls |

Only expose routes that are implemented and permitted. Add intentional 404/403, skeletons, offline/network retry, not inert tabs.

---

## 2. Visual design system — preserve the latest approved direction

**Stylistic goal:** premium, contemporary, editorial + product-grade, with a recognizable USAM identity, not a generic template, a noisy gradient dashboard, or a copy of LinkedIn. Respect the final user-approved design from prior work and source repository; do not guess exact branding.

- **Hierarchy:** clear typographic rhythm, restrained color accents, generous whitespace, strong contrast, usable data density, elegant cards with purposeful borders and micro-interactions.
- **Visual language:** consistent sidebar/top nav by breakpoint, polished persona header, role-specific iconography, activity surfaces, user avatars, trust markers (only when verified), meaningful badges, editorial feature panels, selective infographics/diagrams and contextual illustrations.
- **Four differentiated community treatments:** one shared design system plus accent/visual motifs and imagery distinct to each persona. Do not fork four entirely inconsistent design languages.
- **Theme:** coherent light and dark modes, contrast-checked tokens, persistent user preference, system preference fallback, no washed-out text or white flashes.
- **Bilingual:** Arabic/English complete translation catalogs, intuitive language toggle, mirrored RTL navigation, localized metadata and input direction where applicable.
- **Responsive:** 320px mobile through tablet, laptop and desktop; bottom navigation/mobile drawer when appropriate, touch targets and thumb reach, no horizontal overflow.
- **Motion:** controlled hover/entrance/feedback transitions with reduced-motion support, avoid meaningless looping animations.
- **Accessibility:** semantic HTML, keyboard paths, focus visible, form descriptions, contrast WCAG AA target, alt text, screen reader messages, skip link, dialogs with focus trap.
- **Components:** buttons, chips, tags, statuses, tabs, combobox, filter sheet, search modal, empty states, alerts, toast, drawer, modal, data tables, calendar, timeline, stepper, charts, onboarding checklist, profile cards, organization and offer cards.
- **Asset strategy:** real approved logos and licensed imagery only; optimize responsive image delivery, alt text and safe uploads. Avoid false testimonials or invented partner logos.

### Page-level design expectations
- **Landing:** short product statement, 4-community discovery, persona pathways, live platform-value content, featured events and trusted opportunities, integration story, clear CTA, FAQ.
- **Authenticated home:** personalized daily priority and feed, suggested connections, events, membership status, opportunities and recommended actions, compact notification panel.
- **Community dashboard:** persona hero, actionable KPI summary, member stories, upcoming events, relevant offers, calls to action, pinned discussions, directory, challenges.
- **Profiles:** strong professional identity, work samples and experience/skills, contribution history, privacy controls, connections, verified associations; not a generic CV paste.
- **Admin:** readable operational density, strong filters, permission-aware bulk actions, export, moderation queue, metrics with definitions, audit log.

**Design QA:** capture before-and-after screenshots for desktop/mobile and RTL/LTR light/dark; compare against approved screenshots and prevent regressions in spacing, color and navigation. No global redesign unless explicitly requested.

---

## 3. Identity, permissions and organizations engine

- Unified USAM SSO integration boundary; OAuth callback exchange uses secure httpOnly refresh cookie and does not expose tokens in URLs.
- Email/password login, verification, password reset, logout-all-sessions, MFA readiness, device/session management, trusted login alerts.
- Progressive onboarding by chosen persona(s); a user may be founder + freelancer + mentor, with one identity and explicit context switch.
- Profile completeness, consent to talent discovery, visibility per field, notification preferences, deletion/export requests, blocking and reporting.
- RBAC/ABAC: platform super-admin, platform admin, moderator, community manager, organization owner/admin/editor/member, event organizer, mentor, verified partner, ordinary member. Distinguish platform permissions from tenant permissions.
- **Admin-created official communities** by default; users may request new communities but cannot silently create official ones.
- Organization verification, invitations, team roles, permissions, member removal, ownership transfer, organization review queue.
- Rate limits, session revocation, login throttling, role escalation protection, audit trails, account suspension and appeal.

---

## 4. Social feed, connections, and engagement engine

**Feeds**: global, following, own communities, persona feeds, organization updates, saved content, trending; ranked and chronological modes, clear explanations of recommendation relevance.

**Posts**: rich text, attachments, image/video/link preview, hashtags, mentions, polls, scheduled posts (where appropriate), drafts, moderation, edit history, bookmarks, comments/replies, reactions, shares/reposts with attribution, notification settings.

**Graph**: follows, connections by consent where applicable, company and community follows, suggested professionals, skills graph, mentor links, alumni/campus graph.

**Safety**: report/block/mute, privacy enforcement on all APIs, file validation, XSS sanitization, malicious link handling, anti-spam, moderation workflow, admin audit logs.

**Important known frontend issue to regression-test:** avoid unconditional access to potentially absent API fields such as `post.hashtags.length`. Normalize/validate the server response; add error boundaries but fix the contract itself.

---

## 5. Community and groups engine

- Official community landing, charter, access rules, member directory, announcements, posts, moderation, invitations/requests, join/leave, pinned resources, member roles, event and challenge associations.
- Nested interest groups/circles where permitted, admin approval workflow, visibility rules, private invitation links with expiry.
- Persona-specific member engagement prompts; community pulse/activity KPIs; onboarding flow for new joiners.
- Moderators' tools for queue review, content actions, strikes, reasons, appeals, and escalation.

---

## 6. Events, registration and tickets engine

- Event lifecycle: draft → pending review (if required) → published → active → completed/cancelled; organizer-owned controls and admin override.
- Types: meetups, panels, workshops, webinars, cohort sessions, mentorship events, hackathons, recruitment days, pitch nights, demo days, campus challenges, retreats where relevant.
- Event detail, timezone, capacity, waitlist, tickets/free RSVP, discounts, attendee consent, check-in QR, attendee messaging, sessions/agenda, speaker profiles, organizer analytics, cancellation/refund policy.
- Paid tickets only after a verified payment provider integration and reconciliation; distinguish **payment integration blocked** from end-to-end production-ready.
- Calendar invites and share links, reminders via email/in-app, check-in and post-event feedback.
- Cross-post events into appropriate communities with visibility constraints.

---

## 7. Challenges, competitions and gamification engine

- Configurable challenge builder with stages, eligibility, deadline, rubrics, individual/team submissions, file/upload limits, judges, blind evaluation optional, leaderboard with anti-cheat measures.
- Quizzes and skill assessments with reusable question pools where relevant; avoid false qualifications or unverifiable claims.
- Badges, points and learning milestones with clear criteria; no manipulative streak penalties.
- Certificates and portfolio artifacts with verifiable issued IDs when enabled, rewards and sponsor fulfillment status.
- Admin review, disputes and appeals, participant progress and outcome dashboards.

---

## 8. Mentorship, experts and matching engine

- Mentor profiles, expertise, industry, language, rates/free status, availability, qualifications/verified flags, reviews with provenance.
- Request → accept → schedule → session → follow-up → feedback lifecycle; timezones/calendar link, cancellations, reminders.
- Founder-advisor, freelancer-peer, recruiter-talent and student-mentor matching; user-controlled discovery and data-sharing preferences.
- AI-supported recommendations must be explainable, opt-in as appropriate, and never auto-book or contact people without permission.

---

## 9. Opportunities, jobs and talent engine

- Opportunity directory for accelerators, competitions, grants, scholarships, mentors, RFPs, internships and hiring programs, tagged by persona and eligibility.
- Employer organization profile and verified reps; applicant consent and data minimization; searchable talent directory only for opted-in profiles.
- **Jobs are handled by USAM Jobs/Hiring as the source of truth**. Use real redirect/deep-link/API/SSO contract when available; avoid a separate, divergent shadow job board.
- Application/status sync where supported, otherwise explicitly show that the action continues in USAM Jobs.
- Recruitment events, skill-matching, referral workflow, employer analytics and anonymized pipeline aggregates.

---

## 10. Organizations, partnerships and ecosystem directory engine

- Organizations: company, startup, university, accelerator, coworking space, NGO, fund, corporate partner and ecosystem stakeholder types.
- Public directory and details, official representative verification, teams, members, offerings, services, focus sectors, geographies, contact rules, interest signals, follows.
- Partnerships: discover → invite/request → review → accept/reject → draft agreement (manual/legal) → activate → manage benefits/campaigns → end/renew; approval and audit history.
- Collaboration board and cohosted events, sponsored challenge programs, partner activity analytics, follow-up tasks and notification workflows.
- Explicit partner distinction: strategic, education, community, ecosystem, hiring and perks.
- Never claim a real-world partnership exists unless backed by approved records.

---

## 11. Offers & Perks marketplace engine

**Catalog** with category, eligible persona/community, issuer organization, country, conditions, expiry, discount type/value, claim mechanism, limits, availability, and verified issuer state.

**Issuer/admin capabilities:** create draft, rich edit, add promo codes, activate/deactivate codes, submit to moderation, approve/reject with reason, schedule, archive, analytics, per-user and global redemption caps.

**Redemption:** server-side eligibility, idempotent redemption, atomic inventory decrement, limits, audit, unique claim IDs, delivered codes or partner redemption tracking, abuse prevention. Real final redemption outcome and retries must be E2E tested.

**Business value:** claim funnel, redemption, repeat engagement, partner retention and campaign attribution (consented and aggregated).

---

## 12. Messaging, notifications and communications engine

- 1:1 messaging and organization/mentor conversations based on permission, block and harassment controls; read receipts optionally.
- Realtime via Socket.IO with Redis adapter across multiple backend workers; fallback strategy and reconnection states.
- Notifications: replies, mentions, follows, invitations, events, offers, admin moderation actions, partnership updates, recommendation digest.
- In-app center, email notifications via SES, per-category opt-outs, digest cadence, delivery logs, retry/queue/dead-letter behavior.
- Admin broadcast with segmentation and consent, anti-spam safeguards; template management with Arabic/English variants.

---

## 13. AI and personalization engines (NomadAI integration)

- **NomadAI assistant** accessible as contextual “Ask USAM” from feed, profiles, events, community dashboards, career and learning journeys; helpful guidance grounded in authorized USAM knowledge and public content.
- Retrieval with source attribution for policy/program/event facts; enforce per-user organization/community data boundaries during retrieval.
- Profile and opportunity recommendations: explain matching factors; user controls; avoid hidden sensitive-attribute inference.
- Content assistance: write/rewrite posts, translations, summaries, hashtags, moderation flagging, event descriptions and campaign drafts; explicit user review before publish.
- Smart onboarding coach and next-best-action engine: complete profile, recommended communities, follow-ups, courses, jobs, events, perks.
- Partner/startup matching and mentor recommendations with opt-in and no automatic outward contact.
- AI safeguards: role-based tool permissions, prompt-injection defenses, content filters, PII minimization, audit usage, quotas, cost tracing, evaluation suites, graceful fallback if provider unavailable.
- Architecture: provider-agnostic AI gateway with NomadAI/AWS Bedrock or configured model providers; do not assume API keys or spend are approved.

---

## 14. USAM ecosystem integration engine

| Product | Hub touchpoints | Integration boundary |
|---|---|---|
| USAM Education | student/founder upskilling, courses, certificates, skill signals, event cohorts | Explicit APIs/links/SSO; **never alter Education server** |
| USAM Career | persona journeys, profile skills, mentor/career coach and milestones | Consent-based data sync, no duplicate identities |
| USAM Freelancing | service listings, briefs, portfolios, proposal links, collaboration | Source-of-truth API or deep links |
| USAM Jobs/Hiring | internships/jobs and employer intent | Jobs platform remains source of truth |
| NomadAI | contextual AI assistant and recommendations | Gateway, budget, privacy, observability |
| USAM Events/RAISE | event programs and partner participation | Explicit organizer/event mapping |

Implement versioned integration interfaces and request schemas. When endpoints are not provided, build adapters/mock contract tests in dev, but never mark production integration complete until verified. Support product-specific deep links and return-to-origin navigation.

---

## 15. Billing, tiers, entitlements and partner economics

- Free and paid plans with explicit entitlement matrix by audience and organization.
- Plans may govern advanced analytics, organizational seats, premium event access, mentor scheduling, sponsored visibility and AI usage budgets; **do not artificially paywall core safety/account management features**.
- Checkout, invoices, taxes, currency presentation, reconciliation, cancellations, refunds and payment failures only via a real contracted gateway when approved.
- Egypt EGP as a possible primary price locale, international currencies as display only unless actual multi-currency payment processing exists.
- Promo codes, partner-sponsored memberships, trials, upgrade/downgrade rules, grace periods and entitlement changes, not only visual price cards.

---

## 16. Search, discovery and recommendation engine

- Unified search across members, companies, communities, posts, events, mentors, challenges, opportunities, offers and resources with role-aware access rules.
- Filters by community, sector, skills, location, availability, verified status, type and date.
- Saved searches, alerts, recent searches, typo tolerance when appropriate, no private content leaking into global indexes.
- Relevance signals, transparency and moderation-aware ranking; analytics for unsuccessful searches.

---

## 17. Admin, trust, operations and content-management engines

**Platform console:** operational overview, user/member directory, organization verification, role assignment, content queues, communities, events, challenge judging, mentors, opportunities, offers, partnerships, announcements, translations, email templates, feature flags, tiers, integrations, analytics, audit logs.

**Tenant/community console:** scoped dashboards and administrative rights; cannot browse unrelated tenant data.

**Trust & safety:** reports, flags, reasons and evidence, review SLAs, suspension levels, appeals, sensitive-content controls, spam prevention, link/file scans and account recovery.

**CMS:** editable page blocks, public FAQs, rules, footer links, resource library, banners, campaigns, sponsor placement, media library with safe asset controls. Published content must have approvals and scheduling.

**Operations:** health status, queue retries, dead-letter inspection, feature rollout, background jobs, permission change audit and safe exports.

---

## 18. Analytics, growth, impact and reporting engine

- Event taxonomy for signup, onboarding completion, active users, join/leave, post/comment/reaction, connections, event registration/check-in, offer claim/redeem, mentor request/session, organization activation and partner lifecycle.
- Attribution from marketing channels and consented referral links; campaign/source tags.
- Role dashboards: member growth, DAU/WAU/MAU, retention, cohort funnels, community health, event conversion, active partner value, qualified opportunities, employer engagement, offer ROI.
- Strong definitions, date windows, trend comparisons, exports, data freshness indicators and small-sample privacy protections.
- Admin intervention insights rather than charts with made-up numbers; empty analytics show honest zero/no data.
- Growth engine: invitations, referral tracking, waitlists, organization onboarding, seasonal campaigns and engagement digests with anti-abuse protections.

---

## 19. Data model and API contracts

Audit existing Sequelize models before adding migrations. Target entities may include:

`users`, `profiles`, `personas`, `skills`, `experiences`, `educations`, `organizations`, `organization_members`, `organization_invites`, `organization_verifications`, `communities`, `community_memberships`, `groups`, `group_memberships`, `posts`, `post_media`, `post_reactions`, `comments`, `follows`, `bookmarks`, `reports`, `moderation_cases`, `messages`, `conversations`, `notifications`, `events`, `event_sessions`, `tickets`, `registrations`, `checkins`, `challenges`, `submissions`, `judges`, `mentors`, `mentor_requests`, `sessions`, `opportunities`, `offers`, `promo_codes`, `redemptions`, `partnerships`, `plans`, `subscriptions`, `entitlements`, `payments`, `feature_flags`, `settings`, `audit_logs`, `webhook_events`, `integration_links`, `ai_conversations`, `ai_usage`, `analytics_events`.

Implement only entities justified by flows; map existing naming rather than duplicate tables. All important tables should have explicit ownership, timestamps, soft-delete strategy when appropriate, unique constraints, indexes, FK policy, migration down/roll-forward guidance, and data-retention policy.

- API base e.g. `/api/v1`, versioned OpenAPI/Swagger, request/response validation via schemas, consistent error envelope, pagination/cursors, filtering, sort, rate limit metadata.
- Validate null/optional fields across frontend/backend; no mock-only shapes.
- AuthN/AuthZ at every endpoint; server-side tenancy checks, CSRF/CORS/cookie safety, input sanitization, uploads policy, idempotency for redemption/payment/state-changing callbacks.
- Shared typed API client/types (generated or validated), normalized DTOs, meaningful integration/contract tests.
- Background tasks through Redis-backed queues with visibility, retries, and safe shutdown; do not conflate job state with socket events.

---

## 20. Infrastructure, security and reliability architecture

**Deployment target (not yet confirmed production-live):** AWS EC2 `13.48.137.19` (`eu-north-1`), `hub.usamif.com` later by separate cutover approval. Old agent-ai remains untouched.

- Nginx serves optimized React/Vite static build, proxies `/api` + `/socket.io` to Express PM2 processes.
- MySQL on **private AWS RDS**, test version compatibility and cost before creation; Redis local/private on EC2 with authentication, persistent configuration and monitoring.
- S3 for approved uploads/assets and SES for email after sender verification/production access; IAM instance profile least privilege, no static keys.
- Secrets Manager/secure environment controls, encrypted backup, private DB SG, security patch cadence, SSH/session access hardening.
- CI includes lint, type checks, 264+ legacy backend tests, 18+ frontend tests, browser E2E, dependency advisory review, migration checks, artifact provenance, protected release approvals; numbers are historical evidence, rerun and report current truth.
- Structured logs with request IDs, error tracking, health/readiness checks (DB/Redis/queue), CloudWatch metrics/alarms, disk/memory/CPU and Node event loop monitoring, queue lengths, backups restore drills.
- Mobile performance budgets, bundle splitting/lazy routes, image compression, caching, data-loading strategy, P95 endpoint measurements and slow-query optimization.
- Staging and production configs isolated; avoid accidental seeders on prod.
- Rollback with artifact/version history, migration strategies, traffic switching and **post-cutover-write preservation**; DNS rollback alone can lose new data.
- Do not enable a public site or modify DNS until separate approval. Pre-domain preview via authenticated SSH tunnel/secure temporary hostname as appropriate; certain OAuth/HTTPS flows remain gated.

---

## 21. Detailed acceptance test matrix (must implement and report)

| Flow | Expected verified evidence |
|---|---|
| Signup/login | real API + session/cookie; correct error/lockout behavior |
| OAuth | mock-provider integration plus real provider browser test when configured |
| Persona onboarding | distinct 4-persona views, persistent preferences |
| Communities | join/leave, permissions, member counts reconciled |
| Feed | real create/edit/delete, comment/react/share, optional hashtags safe |
| Organizations | create, invite, roles, verify, edit, audit |
| Partnerships | request/accept/decline/end, scope/permissions |
| Offers | draft/edit/promo/approve/redeem with DB effects and eligibility |
| Events | create/publish/register/check-in/cancel, capacity/waitlist |
| Messaging | delivery, permissions, reconnect, read states |
| Notifications | event triggers, read/archive, opt-out, delivery logs |
| Search | relevance/filtering and private-data isolation |
| Mentorship | request, accept, session and cancellation workflow |
| Challenges | participate/submit/judge/award with integrity |
| AI | verified provider routing, grounded results, policy filters and failures |
| Jobs/Education | real cross-product deep-link/API, no impact on Education |
| Billing | no simulated payments called “live”; real sandbox → prod gateway proof |
| Localization | complete AR/EN, RTL/LTR, dark/light, translated errors |
| Accessibility | keyboard, screen readers, contrast, reduced motion |
| Resilience | API 4xx/5xx states, retries, Redis outage, PM2 restart, DB failover boundaries |
| Security | permission matrix, IDOR tests, role escalation, upload/XSS/rate-limit tests |
| Data migration | 100% record reconciliation and Arabic UTF-8 byte correctness, no E-USAM impact |
| Production | health, logs, metrics, backups, costs, explicit cutover approval |

E2E test realistic seeded-but-isolated user journeys; never use a real production account as a destructive fixture.

---

## 22. Prioritized delivery roadmap

### P0 — Make current product genuinely usable and safe

1. Audit the repo and create an actionable gap register; preserve approved design.
2. Repair all broken routes, contract mismatches, actual API errors, unauthorized actions, and missing frontend states.
3. Complete four differentiated persona dashboards and onboarding, memberships, posts, organizations, partnerships, and offers.
4. Verify security permissions, sessions, OAuth boundaries, upload safety, moderation, error and activity handling.
5. Complete stable CI, integrated MySQL/Redis tests, Playwright E2E and source-verified deploy process.
6. Correct the PostgreSQL→MySQL data migration tool (including Arabic Unicode) and prove on a true isolated fixture and actual scoped backup before production use.

### P1 — Commercial ecosystem and everyday engagement

7. Full events/ticketing (free real journey; paid conditional on gateway), mentorship, richer member directory, search, messaging and notifications.
8. Complete organization/partner workspaces, offer redemption analytics, admin operational analytics and CMS.
9. Notifications via SES, S3 uploads, member referral flows, deep integrations with Jobs/Education/Career/Freelancing.
10. AI assistant, contextual recommendations and AI cost/privacy guardrails.

### P2 — Expansion and advanced engines

11. Challenges/judging/certificates, sponsored programs, advanced partner reporting, richer recommender quality.
12. Premium tiers/payments after approval, enterprise features, controlled API/webhooks, attribution and impact reporting.
13. Internationalization expansion, advanced performance, sophisticated moderation, experiments/feature rollout and growth campaigns.

Do not wait until P2 to fix security, data contracts, error states, or mobile UX.

---

## 23. ChatGPT Work — mandatory execution sequence and deliverables

**Work task:** Inspect the actual repository/attached source, then independently implement and test as much as permissions and time allow. Preserve existing code/design. Do not deliver only a glossy prototype or a generic proposal.

### Step A — Establish exact baseline
- Identify working repo/branch/commit, file tree, running development environment, deployment scripts, and major existing features. Treat `audit/baseline-verification @ 1a682a2984cf157b4efbae54eeb5f5d137caeb71` as a **historical reference**, not proof it is today's HEAD; verify before writing.
- Read project docs, tests, app routes, API controllers, schema, components, styles, design assets and screenshots. Identify the newest approved visual reference.
- Inventory every page and flow, mark complete/partial/broken/missing, and prioritize by user impact.

### Step B — Maintain current visuals and design system
- Document current approved tokens, components and layouts from source; build an internal component inventory.
- Implement missing views/components within this same system. Polish unfinished pages, add theme/localization, responsive/accessible states; do not alter established design unnecessarily.

### Step C — Build complete vertical slices
- Start with P0 defects and go page-by-page and flow-by-flow.
- For each slice add server validation, authorization, tests, frontend states, logging and documentation.
- Make cohesive local commits, tracking exactly what changed.

### Step D — Verify and harden
- Test backend, frontend, E2E, lint, type safety, migration compatibility, security and performance.
- Fix defects found in real browser/API testing, not only superficial snapshot failures.
- Record test commands, outputs, failures and unresolved external dependencies.

### Step E — Prepare AWS release without impacting production
- Write accurate runbooks and scripts; verify requirements for RDS/MySQL version, private networking, IAM, SES sandbox, S3, Redis, source artifact transfer, and deployment permissions.
- Never publish to `hub.usamif.com`, change DNS, or modify agent-ai/E-USAM without explicit authorization.

### Required final artifacts
1. Updated, working repository changes (and/or downloadable source archive if local repo access unavailable).
2. `PRODUCT_SPEC.md` with implemented routes, features, and user journeys.
3. `DESIGN_SYSTEM.md` with precise tokens/assets/layout and before/after screenshots.
4. `API_CONTRACTS.md` and updated Swagger/OpenAPI.
5. `DATA_MODEL.md` + tested migrations.
6. `INTEGRATIONS.md` identifying real versus pending integrations.
7. `SECURITY_AND_PRIVACY.md` with mitigations and known issues.
8. `TEST_REPORT.md` with reproducible commands and pass/fail evidence.
9. `DEPLOYMENT_RUNBOOK.md` with isolation/rollback/operational checks.
10. `GAP_REGISTER.md` showing verified done/partial/blocked/deferred items and exact follow-up.

**The finish line is a cohesive working product with verified end-to-end behaviors — not a count of pages, a list of feature names, or a static demo.**

---

## 24. Explicit product non-goals and reality checks

- Do not imitate another site exactly or use other brands' identity without rights.
- Do not fabricate testimonials, organization verification, employer openings, opportunities, attendance, payments, certifications, or revenue.
- Do not spin up a separate Jobs database as a duplicate source of truth.
- Do not claim the E-USAM integration is production complete by modifying or reading its database directly; use consented APIs or user-visible links only.
- Do not claim AWS hosting, DNS, certificates, RDS, SES, payments, AI API, or production deployment are live without proof.
- Do not silently convert historical PostgreSQL data into new seed data or break user IDs.
- Do not auto-send emails, notify third parties, buy services, change production infrastructure, or change domain configuration without approval.

## FINAL DIRECTIVE

**Build USAM Communities into the most complete, compelling, and maintainable implementation supported by the actual codebase. Keep the latest approved visual direction; deliver real frontend/backend/admin/AI engines, four specialized communities, verifiable integrations and comprehensive tests. Execute safe development tasks continuously and provide evidence. Protect E-USAM absolutely. Leave production domain/DNS changes for a separately approved stage.**
