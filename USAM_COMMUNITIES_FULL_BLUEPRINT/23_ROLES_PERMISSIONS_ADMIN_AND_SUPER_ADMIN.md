# Roles, Permissions, Admin and Super Admin

**Purpose:** Least-privilege matrix  
**Applies to:** USAM Communities React/Node.js/EC2 package  
**Sources:** audited source at commit lineage `03ea43c...`, Universal Blueprint v1.1, supplied master prompt, official sources ledger  
**Status:** CURRENT + TARGET

Visitor reads public content. Member controls own profile/content, joins communities, registers, requests plans and opts into discovery/messages. Moderator reviews reports/content but cannot activate billing. Admin manages approved operational queues and may activate a paid subscription only after external verification. Super Admin is a target role requiring MFA, reason codes and separation of duties; it does not exist today. UI visibility never substitutes for server enforcement.

