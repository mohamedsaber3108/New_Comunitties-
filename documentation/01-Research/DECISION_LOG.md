# Decision log

| ID | Decision | State | Evidence |
|---|---|---|---|
| D-001 | Four official communities: LaunchPad, FreelanceSpace, HR Connect, StudentZone | implemented | `src/main.jsx`, `server/db.js` |
| D-002 | One identity may join several communities | implemented baseline | Membership join/leave API and UI |
| D-003 | Official communities are admin-defined | implemented baseline | only seeded definitions; no member create route |
| D-004 | Jobs/Hiring remains the application source of truth | implemented | external gateway in Opportunities; no Job model |
| D-005 | E-USAM Education remains separate | respected | external link only; no Education data writes |
| D-006 | AR/EN, RTL/LTR, light/dark and shared premium design | implemented | App context and design tokens |
| D-007 | Public hosted experience should be usable without “demo preview” copy | implemented in current changes | local profile onboarding and populated content |
| D-008 | Express + Sequelize + MySQL target with local SQLite development | implemented baseline | server and deployment docs |
| D-009 | RDS, Redis, S3, SES, paid tickets and production cutover require approval/credentials | blocked | provider and production access absent |
| D-010 | NomadAI must be policy-aware and human-gated | target only | no provider or gateway exists |
| D-011 | Existing approved design should be preserved | applied | additions use existing tokens/components; no palette replacement |
| D-012 | Documentation must expose gaps rather than imply 100% completion | applied | status matrix and verification report |

No conflict was found between the two uploaded prompt files; they are byte-identical.

