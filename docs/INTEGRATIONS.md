# Integration status

| System | Current behavior | Status |
|---|---|---|
| USAM Education | external link only | live link; account/data integration blocked |
| USAM Career & Jobs | external link; jobs remain source of truth | live link; deep link and SSO blocked |
| USAM Freelancing | external link only | live link; API integration blocked |
| Existing Hub repository | unavailable in this workspace | merge/migration blocked |
| Unified USAM SSO | no provider contract or credentials | blocked |
| NomadAI / Bedrock | no provider contract, guardrails or budget | blocked; no AI façade displayed |
| Payments and paid events | rejected by API | blocked pending gateway and reconciliation |
| SES and S3 | no credentials/verified sender/bucket | blocked; no email or upload claims |
| Redis and Socket.IO | Redis development container defined but not consumed | absent |
| AWS RDS / EC2 / DNS | runbook supplied; no infrastructure touched | unverified, deployment pending separate authorization |

No external messages are sent by this package. It does not read or modify the protected Education instance.
