# Risks, Assumptions, Open Questions and Decisions

**Purpose:** Ownership and resolution actions  
**Applies to:** USAM Communities React/Node.js/EC2 package  
**Sources:** audited source at commit lineage `03ea43c...`, Universal Blueprint v1.1, supplied master prompt, official sources ledger  
**Status:** CURRENT + TARGET

High risks: live payment spoofing without signed webhook; account abuse without verification/recovery; legal terms/tax invoices not approved; `sequelize.sync` in production; no restore proof; central source file size; unavailable production telemetry. Owners: CTO for architecture/security, Finance/Legal for billing terms/tax, Product for price validation, Operations for moderation/support, DevOps for backups/releases. Decision needed before launch: trial policy, refund window, VAT/invoice process, organization seat enforcement, Paymob account capabilities and public registration date.

