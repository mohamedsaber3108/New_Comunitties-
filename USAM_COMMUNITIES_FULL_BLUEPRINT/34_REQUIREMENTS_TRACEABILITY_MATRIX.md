# Requirements Traceability Matrix

**Purpose:** Stable requirement-to-delivery mapping  
**Applies to:** USAM Communities React/Node.js/EC2 package  
**Sources:** audited source at commit lineage `03ea43c...`, Universal Blueprint v1.1, supplied master prompt, official sources ledger  
**Status:** CURRENT + TARGET

| REQ | FEAT | PAGE | API/DATA | TASK/TEST | Priority | Status |
|---|---|---|---|---|---|---|
| REQ-001 preserve current product | FEAT-001 | all | current schema | regression/build | P0 | implemented/tested |
| REQ-002 bilingual RTL/LTR | FEAT-001 | all | user.language | browser/a11y | P0 | implemented/partial QA |
| REQ-003 communities | FEAT-003 | community routes | membership APIs | suite 1 | P0 | tested |
| REQ-004 social feed | FEAT-004 | feed/post | post/comment/reaction | suites 1/5 | P0 | tested |
| REQ-005 events | FEAT-005 | events | registration | suite 2 | P0 | free tested |
| REQ-006 programs | FEAT-007 | programs | target application | TASK-017 | P0 | catalog only |
| REQ-007 rooms | FEAT-007 | rooms | target application | TASK-018 | P0 | catalog only |
| REQ-008 membership pricing | FEAT-010 | pricing | plans | suite 8 | P0 | tested |
| REQ-009 monthly/annual | FEAT-010 | pricing/checkout | subscription | suite 8 | P0 | tested |
| REQ-010 live payments | FEAT-010 | checkout/billing | Paymob/webhooks | TASK-008..012 | P0 | blocked |
| REQ-011 legal/accessibility | FEAT-011 | terms/refund/accessibility | N/A | counsel/a11y | P0 | partial |
| REQ-012 admin controls | FEAT-011 | admin | admin APIs/audit | negative tests | P0 | partial/tested |
| REQ-013 EC2 | platform | N/A | deployment | TASK-041..043 | P0 | package ready, not deployed |
| REQ-014 NomadAI | FEAT-012 | target assistant | target gateway | evaluation | P2 | blocked |

