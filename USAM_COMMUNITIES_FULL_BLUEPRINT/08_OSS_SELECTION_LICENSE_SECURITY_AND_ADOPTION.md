# OSS Selection, License, Security and Adoption

**Purpose:** Governance for third-party code  
**Applies to:** USAM Communities React/Node.js/EC2 package  
**Sources:** audited source at commit lineage `03ea43c...`, Universal Blueprint v1.1, supplied master prompt, official sources ledger  
**Status:** CURRENT + TARGET

Score candidates on project fit 30%, security/maintenance 25%, license 20%, integration effort 15%, EC2 burden 10%. Unknown license is automatic REJECT. AGPL/SSPL/BSL require legal review. Adoption sequence: verified source → license/SBOM → isolated PoC → threat review → adapter interface → integration tests → upgrade owner/runbook. Pin exact lockfile resolutions in release artifacts and scan dependencies before deployment.

