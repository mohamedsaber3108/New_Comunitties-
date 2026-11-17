# Page-by-Page Implementation Specifications

**Purpose:** How to use exact route specs  
**Applies to:** USAM Communities React/Node.js/EC2 package  
**Sources:** audited source at commit lineage `03ea43c...`, Universal Blueprint v1.1, supplied master prompt, official sources ledger  
**Status:** CURRENT + TARGET

Each file in `page_specs/` records route, auth, purpose, current state, primary actions, API/data needs, empty/loading/error states, accessibility, analytics and observable acceptance. Public billing claims must distinguish a saved request from a completed charge. Pages backed by device-local Sites data say so in relevant UI. Route guards are tested negatively for member-only/admin behavior.

