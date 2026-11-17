# Billing and subscriptions

## Implemented and tested

- Four EGP plans: Free, Plus, Pro and Organization.
- Monthly and annual cycles; annual pricing equals ten monthly payments.
- `Plan`, `Subscription` and `PaymentAttempt` models.
- Public plan catalog, member billing summary, idempotent subscription request, cancellation, admin pending queue and explicit activation.
- Free plans activate immediately. Paid plans remain `pending_payment` until verified.
- The hosted Site stores the selected state on the current device and clearly states that no charge occurred.

## Production gate

Paymob is the Egypt-oriented provider candidate. Live checkout is **BLOCKED** until merchant onboarding, sandbox reconciliation, hosted checkout, HMAC webhook verification, replay protection, refund handling, approved legal terms and tax/invoice decisions are complete. Raw card data must never enter this application.

## Price hypothesis

| Plan | Monthly | Annual |
|---|---:|---:|
| Free | EGP 0 | EGP 0 |
| Plus | EGP 149 | EGP 1,490 |
| Pro | EGP 349 | EGP 3,490 |
| Organization | EGP 1,499 | EGP 14,990 |

These prices are launch hypotheses and must be reviewed using conversion, retention, usage and support-cost evidence.
