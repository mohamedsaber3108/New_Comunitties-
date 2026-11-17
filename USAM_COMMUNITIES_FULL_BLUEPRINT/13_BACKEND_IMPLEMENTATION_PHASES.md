# Backend Implementation Phases

**Purpose:** Safe backend evolution  
**Applies to:** USAM Communities React/Node.js/EC2 package  
**Sources:** audited source at commit lineage `03ea43c...`, Universal Blueprint v1.1, supplied master prompt, official sources ledger  
**Status:** CURRENT + TARGET

P0: migration system, email verification/reset, rate-limit store, billing webhook verification, subscription entitlements, audit coverage, MySQL CI. P1: program/room applications, organization membership, scheduled notifications and object storage. P2: tenant isolation, search index, realtime transport and NomadAI gateway. Database migrations must precede incompatible code; rollback and backfill evidence are release gates.

