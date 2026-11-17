# Complete Page and Route Inventory

**Purpose:** Navigation source of truth  
**Applies to:** USAM Communities React/Node.js/EC2 package  
**Sources:** audited source at commit lineage `03ea43c...`, Universal Blueprint v1.1, supplied master prompt, official sources ledger  
**Status:** CURRENT + TARGET

The route inventory contains 52 React routes including system fallback. Public: home, communities/detail, explore, programs, rooms, partners, pricing, resources/detail, FAQ, contact, about, how it works, guidelines, privacy, terms, refund policy, accessibility, feed/content directories, login/signup and 404. Protected: dashboard, activity, my events, messages, mentorship, submissions, profile, settings, saved, notifications, organization creation, checkout, billing and admin. Redirects: dashboard→home and jobs→opportunities.

Every exact route has a corresponding file under `page_specs/`. Internal links must resolve to this inventory; external ecosystem links open with `rel=noreferrer`.

