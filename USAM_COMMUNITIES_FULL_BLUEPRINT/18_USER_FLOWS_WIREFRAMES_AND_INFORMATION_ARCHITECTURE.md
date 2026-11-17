# User Flows and Information Architecture

**Purpose:** Major journeys and recovery paths  
**Applies to:** USAM Communities React/Node.js/EC2 package  
**Sources:** audited source at commit lineage `03ea43c...`, Universal Blueprint v1.1, supplied master prompt, official sources ledger  
**Status:** CURRENT + TARGET

```mermaid
flowchart TD
 D[Discover] --> S[Sign up]
 S --> C[Join community]
 C --> V[First value]
 V --> P[View pricing]
 P --> Q[Confirm plan]
 Q -->|Free| A[Active]
 Q -->|Paid| W[Pending payment]
 W -->|Verified| A
 W -->|Cancel| X[Canceled]
```

Recovery: unauthenticated protected routes preserve redirect; invalid plan returns clear error; duplicate paid request returns same subscription; provider not configured creates no fake payment; cancellation changes status and pending attempts. Support and legal routes remain available without authentication.

