# PAGE — Event detail

**Purpose:** Exact implementation contract for /events/:id  
**Applies to:** USAM Communities React/Node.js/EC2 package  
**Sources:** audited source at commit lineage `03ea43c...`, Universal Blueprint v1.1, supplied master prompt, official sources ledger  
**Status:** CURRENT + TARGET

- **Route:** `/events/:id`
- **Audience/auth:** public/member
- **Goal:** Register/cancel/waitlist
- **Current data/API:** event registration APIs
- **States:** loading, empty, success, permission denied and recoverable error as applicable. Protected routes must redirect to authentication and then back to the deep link.
- **Primary acceptance:** the route renders directly and through navigation; every visible action has a real destination; keyboard focus is visible; Arabic/English layout does not overflow; unauthorized mutations fail server-side.
- **Analytics:** page_view plus action-specific event without private body/message content.
- **Status:** implemented unless the current API note explicitly says target/static/legal review. Hosted mode uses transparent device-local storage; EC2 mode uses the shared API.

