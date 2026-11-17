# Frontend Architecture — React

**Purpose:** Current shell and safe evolution  
**Applies to:** USAM Communities React/Node.js/EC2 package  
**Sources:** audited source at commit lineage `03ea43c...`, Universal Blueprint v1.1, supplied master prompt, official sources ledger  
**Status:** CURRENT + TARGET

React 19 + Vite + React Router. Current `main.jsx` is a working monolith; preserve behavior while extracting feature modules gradually: app/providers, public pages, community, social, programs, events, billing, admin and shared UI. Centralize API errors, i18n keys, route metadata and entitlement checks. HashRouter is used only for static Sites; BrowserRouter for EC2. Maintain keyboard focus, semantic controls, 44px touch targets, RTL/LTR and reduced-motion support.

