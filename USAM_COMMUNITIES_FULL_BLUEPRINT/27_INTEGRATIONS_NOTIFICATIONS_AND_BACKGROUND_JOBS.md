# Integrations, Notifications and Background Jobs

**Purpose:** Boundaries, retries and ownership  
**Applies to:** USAM Communities React/Node.js/EC2 package  
**Sources:** audited source at commit lineage `03ea43c...`, Universal Blueprint v1.1, supplied master prompt, official sources ledger  
**Status:** CURRENT + TARGET

Current integrations are synchronous/internal only; ecosystem links are external handoffs. Target adapters: Paymob, SES/email, optional SSO and NomadAI. Jobs: verification email, reminders, waitlist promotion notification, subscription renewal checks, webhook retries and digest generation. Each job requires idempotency, retry/backoff, dead-letter visibility, opt-out rules and operator ownership. Redis/BullMQ remains proposed, not active.

