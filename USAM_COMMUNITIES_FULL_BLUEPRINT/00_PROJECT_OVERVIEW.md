# Project Overview

**Purpose:** Project thesis, boundaries and core decisions  
**Applies to:** USAM Communities React/Node.js/EC2 package  
**Sources:** audited source at commit lineage `03ea43c...`, Universal Blueprint v1.1, supplied master prompt, official sources ledger  
**Status:** CURRENT + TARGET

USAM Communities is the professional network layer of the USAM ecosystem. It connects four audiences—founders, freelancers, employers and students—through official communities, posts, events, programs, curated rooms, challenges, mentorship, organizations, offers and opportunities.

## Current decisions

- Preserve the existing brand, bilingual design and modular-monolith architecture.
- React/Vite frontend; Express/Sequelize backend; MySQL target with SQLite development; EC2/Nginx runtime.
- Official communities are admin-created. Profiles and direct messages are opt-in.
- Jobs remain a USAM ecosystem handoff; Communities does not duplicate the Jobs product.
- Four EGP plans are launch hypotheses, not validated willingness-to-pay facts.
- Paymob is the Egypt-oriented billing candidate; live collection stays disabled until onboarding, HMAC verification and reconciliation tests pass.

