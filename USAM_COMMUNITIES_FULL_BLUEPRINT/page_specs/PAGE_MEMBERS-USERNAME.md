# PAGE — /members/:username

**Purpose:** Exact implementation contract for `/members/:username`  
**Applies to:** USAM Communities React/Node.js/EC2 package  
**Sources:** audited React route tree, API source, Universal Blueprint v1.1  
**Status:** CURRENT + TARGET

- **Audience/auth:** public/member where actions mutate
- **Goal:** Implement and verify the /members/:username journey.
- **Entry/exit:** direct deep link plus declared navbar/sidebar/card links; exit to the next meaningful route, never a dead control.
- **States:** loading/skeleton, empty, success, validation error, server error, permission denied and offline/provider-unavailable where relevant.
- **Data:** use only route-linked API/static catalog data; hosted mode is explicitly device-local; EC2 mode is shared persistence.
- **Security:** server authorization for every mutation; admin and ownership negative tests; never expose private fields in page data.
- **Accessibility:** semantic headings/labels, visible focus, keyboard reachability, RTL/LTR, 44px touch targets and reduced motion.
- **Acceptance:** direct and in-app navigation render the same page; actions complete or show an honest actionable error; no layout overflow at mobile/tablet/desktop.

