# Engine spec — Partnerships and platform control

Partnership requests follow `requested → reviewing → approved → active → completed|renewal_due`, with a decline path before activation. Only admins transition status; member requests remain owner-scoped. Audit and notifications are emitted at each human decision.

Feature flags have public read-only output and audited admin writes. CMS content is keyed by locale and exposes only `published` entries to public consumers. Notification delivery preferences store intent without claiming that SES email delivery is active.

Live payments, outbound email, cross-tenant AI and external provisioning remain gated by credentials and approvals.
