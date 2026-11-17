# USAM Hub / Communities — verified documentation pack

Generated from the standalone implementation at commit `f6812f0` plus the current working changes, the supplied Master Execution Prompt, and the files listed in `01-Research/SOURCE_AUDIT.md`. This pack documents what can be demonstrated from this source. It does not claim access to the historical `mohamedsaber3108/Hubs` repository, AWS, production databases, E-USAM servers, payment providers, SES, or NomadAI credentials.

## Reading order

1. `01-Research/SOURCE_AUDIT.md` and `DECISION_LOG.md`
2. `02-Product/MASTER_SPEC.md` and `PAGE_CATALOG.md`
3. `04-Backend/API_AND_DATA.md` and `RBAC.md`
4. `05-Engines/ENGINE_CATALOG.md`
5. `13-Implementation/STATUS_AND_ROADMAP.md`
6. `15-Traceability/REQUIREMENTS_MATRIX.csv`
7. `12-Quality-Assurance/VERIFICATION.md`

## Status vocabulary

- `IMPLEMENTED_TESTED`: present in code and covered by a successful automated or browser check.
- `IMPLEMENTED_UNVERIFIED`: present but not fully verified in the target environment.
- `PARTIAL`: a useful baseline exists, with named gaps.
- `MISSING`: no implementation evidence in this source.
- `BLOCKED`: requires credentials, provider choice, production access, legal approval or paid provisioning.
- `UNKNOWN`: the relevant historical source was unavailable.

The hosted Site is a browser-local product experience. The EC2 source is the multi-user Express/Sequelize implementation. Browser-local records do not synchronize across devices. The two environments and their limitations are listed explicitly in every relevant document.

