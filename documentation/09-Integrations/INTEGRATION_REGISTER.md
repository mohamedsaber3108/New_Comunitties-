# Integration and package register

## Actual runtime packages

| Package | Declared version | Use | Decision |
|---|---:|---|---|
| react / react-dom | `^19.2.0` | UI | adopt |
| react-router-dom | `^7.9.0` | routing | adopt |
| vite | `^7.1.0` | build | adopt |
| lucide-react | `^0.468.0` | icons | adopt |
| express | `^5.2.1` | API/static server | adopt |
| sequelize | `^6.37.7` | ORM | adopt with migration work |
| mysql2 | `^3.15.3` | MySQL driver | adopt |
| sqlite3 | `^5.1.7` dev | isolated dev/test DB | adopt for development only |
| bcryptjs | `^3.0.3` | password hashing | adopt; tune operational policy |
| cookie-parser | `^1.4.7` | session cookie parsing | adopt |

Exact resolved versions are in `package-lock.json`.

## Product integrations

| Integration | Current contract | State |
|---|---|---|
| USAM main | external link `https://usamif.com` | implemented |
| Education | external link `https://edu.usamif.com`; no data access | protected / integration blocked |
| Career & Jobs | external link `https://jobs.usamif.com`; source of truth | implemented gateway |
| Freelancing | external link `https://freelancing-platform.usamif.com` | implemented gateway; API contract missing |
| SSO | none | blocked pending identity contract |
| S3 / SES | none | blocked pending IAM, bucket/sender and approval |
| Payment | none | blocked pending gateway and compliance |
| NomadAI | none | blocked pending provider, policy, credentials and evaluation |

## Open-source candidates

Keycloak (identity), OpenFGA (fine-grained authorization), Novu (notification orchestration), GrowthBook (feature flags) and Chatwoot (support) are candidates only. Before adoption, verify current version, license, security posture, operations owner, hosting cost, data residency and integration boundary. None is installed or represented as implemented.

