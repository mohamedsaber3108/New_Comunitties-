# API and Integration Contracts

**Purpose:** Current 80 method/path pairs and governance  
**Applies to:** USAM Communities React/Node.js/EC2 package  
**Sources:** audited source at commit lineage `03ea43c...`, Universal Blueprint v1.1, supplied master prompt, official sources ledger  
**Status:** CURRENT + TARGET

Base: `/api/v1`; JSON; httpOnly session cookie; same-origin write guard. Standard errors are `{error: code}`. The implementation has 80 unique method/path pairs across auth, member, community, posts, events, offers, organizations, mentors, messages, challenges, search, notifications, moderation, admin and billing.

Billing contracts: `GET /plans`; `GET /billing` authenticated; `POST /subscriptions` authenticated with `Idempotency-Key`; `DELETE /subscriptions/current`; admin queue and explicit activation endpoint. Live target adds Paymob create-checkout and signed webhook endpoints with deduplication. OpenAPI 3.x generation is a P0 task; current Markdown/API tests are evidence, not a substitute.

