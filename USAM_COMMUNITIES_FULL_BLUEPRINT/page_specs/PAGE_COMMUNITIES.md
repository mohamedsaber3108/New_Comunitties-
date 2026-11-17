# PAGE — Community directory

**Purpose:** Exact implementation contract for /communities  
**Applies to:** USAM Communities React/Node.js/EC2 package  
**Sources:** audited source at commit lineage `03ea43c...`, Universal Blueprint v1.1, supplied master prompt, official sources ledger  
**Status:** CURRENT + TARGET

- **Route:** `/communities`
- **Audience/auth:** public
- **Goal:** Compare four official spaces
- **Current data/API:** GET /communities
- **States:** loading, empty, success, permission denied and recoverable error as applicable. Protected routes must redirect to authentication and then back to the deep link.
- **Primary acceptance:** the route renders directly and through navigation; every visible action has a real destination; keyboard focus is visible; Arabic/English layout does not overflow; unauthorized mutations fail server-side.
- **Analytics:** page_view plus action-specific event without private body/message content.
- **Status:** implemented unless the current API note explicitly says target/static/legal review. Hosted mode uses transparent device-local storage; EC2 mode uses the shared API.

