# USAM Communities — Full Product & Technical Blueprint

**Purpose:** Index and implementation handoff  
**Applies to:** USAM Communities React/Node.js/EC2 package  
**Sources:** audited source at commit lineage `03ea43c...`, Universal Blueprint v1.1, supplied master prompt, official sources ledger  
**Status:** AUDITED 2026-10-26

## Scope

This blueprint was generated after reading the complete Universal Project Blueprint Master Prompt and both companion files, then auditing the current USAM Communities implementation. The standalone MD and the master MD inside the ZIP are byte-identical.

## Measured current coverage

| Item | Count | Evidence |
|---|---:|---|
| React routes | 52 | `src/main.jsx` |
| Unique API method/path pairs | 80 | `server/index.js` |
| Sequelize models | 28 | `server/db.js` |
| Automated integration suites | 8 passing | `server/api.test.js` |
| Public/member languages | 2 | Arabic RTL + English LTR |
| Membership plans | 4 | Free, Plus, Pro, Organization |

## Reading order

Start with 00–06 for product and commercial decisions; 09–15 for architecture and contracts; 16–20 for pages and experience; 23–31 for controls and release; 32–37 for execution and evidence. Every route also has a file in `page_specs/`; selected engines and domains have dedicated specs.

## Boundary

The hosted Site is a public, device-local product experience. The EC2 package provides the shared Express/database system. Live email, SSO, Paymob checkout/webhooks, NomadAI, RDS/Redis operations and AWS production verification remain gated by credentials, contracts or infrastructure access. Documentation never upgrades those items to “built”.

