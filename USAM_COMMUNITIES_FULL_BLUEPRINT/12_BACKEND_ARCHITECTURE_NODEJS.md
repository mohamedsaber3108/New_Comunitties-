# Backend Architecture — Node.js

**Purpose:** Modular-monolith target and controls  
**Applies to:** USAM Communities React/Node.js/EC2 package  
**Sources:** audited source at commit lineage `03ea43c...`, Universal Blueprint v1.1, supplied master prompt, official sources ledger  
**Status:** CURRENT + TARGET

Express 5, Sequelize and versioned REST are appropriate for the current scale. Target modules: auth, members, communities, social, events, programs, mentorship, organizations, billing, admin, integrations and observability. Services must own transactions and policies; routes should become thin adapters. Enforce object ownership server-side, consistent error envelopes, request IDs, input schemas, audit trails and graceful shutdown. Paid state changes require idempotency and verified external evidence.

