# Integration status

Updated 2026-11-27 to match the code on main and `docs/FINAL_PRODUCT_REPORT.md` s.3 and s.9. "Built" means built and tested in this repository; nothing here was checked on the live host.

| System | Current behaviour in code | Status |
|---|---|---|
| USAM Education, Career & Jobs, Freelancing | external links only; Jobs stays the source of truth for jobs | live links; single sign-on and data sharing not built |
| Unified USAM sign-on | none | blocked: no provider contract |
| Paymob (cards, refunds, reconciliation) | adapter in `server/paymob.js`, HMAC-verified webhooks, refunds, reconciliation; tested against a stub only | off until merchant keys exist (`PAYMOB_ENABLED=false`) |
| Email (SES or SMTP) | durable outbox and templates; `EMAIL_PROVIDER=console` only logs | needs a verified sender and a branded domain |
| Google sign-in (OIDC + PKCE) | built in `server/google.js`; tested against a stub | needs an OAuth client |
| S3 storage and off-host backups | optional driver in `server/storage.js`; local disk by default | needs a bucket and an IAM role |
| Realtime | Server-Sent Events from `server/realtime.js`, one process | built; more than one server needs a shared store |
| Redis | not used by the code | not needed today |
| AI assistant (NomadAI / Bedrock) | none shipped | blocked: owner decision on provider, privacy and budget |
| AWS hosting | systemd + Nginx scripts in `deploy/` | built; deploys are run by the owner |
| Old USAM Hub site on the same host | separate repo, not touched by this code | owner decision |

No outside messages are sent unless an email provider is configured.
