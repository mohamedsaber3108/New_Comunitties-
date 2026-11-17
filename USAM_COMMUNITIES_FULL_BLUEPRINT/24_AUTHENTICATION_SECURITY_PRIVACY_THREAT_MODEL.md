# Authentication, Security, Privacy and Threat Model

**Purpose:** Release-blocking controls  
**Applies to:** USAM Communities React/Node.js/EC2 package  
**Sources:** audited source at commit lineage `03ea43c...`, Universal Blueprint v1.1, supplied master prompt, official sources ledger  
**Status:** CURRENT + TARGET

Current strengths: bcrypt cost 12, opaque session tokens stored hashed, httpOnly/sameSite cookies, same-origin write checks, role middleware, input limits and basic security headers. P0 gaps: email verification/reset, MFA for admins, persistent distributed rate limits, CSRF decision documentation, CSP/HSTS at Nginx, migration discipline, secret rotation, security scanning and account deletion/export.

Top threats: IDOR, session theft, stored XSS, spam, payment spoofing, webhook replay, privilege escalation and data leakage. Billing activation requires verified payment evidence, idempotency, audit entry and negative authorization tests.

