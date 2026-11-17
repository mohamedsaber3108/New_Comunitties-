# ENGINE-BILLING — Billing and entitlements

**Purpose:** Capability architecture for Billing and entitlements  
**Applies to:** linked USAM Communities features, APIs and operations  
**Sources:** audited source and Universal Blueprint v1.1  
**Status:** CURRENT + TARGET

- **Classification:** Required now
- **Current/target:** plans/subscriptions/attempts/admin activation; Paymob gated.
- **Contract:** versioned REST, explicit data ownership and server-side authorization.
- **Failure behavior:** fail closed for invalid permissions/payment/provider state; retry only idempotent operations; expose an actionable operator state.
- **Observability:** success/failure/latency/authorization metrics without message bodies, secrets or raw payment data.
- **Acceptance:** mapped route/API/data/task, automated happy and negative tests, runtime configuration, rollback and accountable owner.

