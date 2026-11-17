# Existing Code Audit and Safe Change Plan

**Purpose:** What stays, what changes and why  
**Applies to:** USAM Communities React/Node.js/EC2 package  
**Sources:** audited source at commit lineage `03ea43c...`, Universal Blueprint v1.1, supplied master prompt, official sources ledger  
**Status:** CURRENT + TARGET

Retain the current visual design, bilingual copy, public/member shells, static hosted adapter, Express API, Sequelize domain model and tested journeys. New work added without redesigning foundations: pricing navigation, four plans, monthly/annual toggle, checkout confirmation, billing workspace, legal/accessibility routes, Plan/Subscription/PaymentAttempt models, idempotent subscription API, admin activation and test suite 8.

Next refactor must be behavior-preserving: snapshot route inventory and tests; extract billing first behind the same API; add migrations; rerun all suites and browser QA. Never replace device-local hosted truth with fake shared persistence, and never enable a payment CTA that implies a charge before provider readiness.

