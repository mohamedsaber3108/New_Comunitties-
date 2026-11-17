# Production Deployment Guide - AWS (EC2 + RDS PostgreSQL + Nginx)

_Status: **written and partially rehearsed locally; never run on AWS.** Nothing in this guide has been executed against a real AWS account, no cloud resources exist, and no cost has been incurred. Section 13 lists exactly what was verified locally and what was not. Do your first run on a throwaway staging instance._

## 1. Target architecture

```
                 Internet
                    |  443 (TLS 1.2/1.3)    80 -> 301 to 443
              +-----v-------------------------------+
              |  EC2 (Ubuntu 22.04)  - Elastic IP   |
              |  Nginx  --proxy-->  Node 24 (systemd |
              |   limits, TLS, gzip   usam-communities, 127.0.0.1:3001)
              |   path-only access log    |          |
              |  CloudWatch agent  <------+ journald JSON logs
              |  nightly pg_dump timer / health timer
              +--------+---------------+------------+
                       | 5432 (TLS)     | HTTPS (IAM role, no keys on disk)
              +--------v-------+   +----v------------------------+
              | RDS PostgreSQL |   | SES (email)  S3 (avatars,   |
              | 16, private    |   | backups)  CloudFront (opt.) |
              +----------------+   +-----------------------------+
 Paymob  --signed webhook-->  https://<domain>/api/v1/payments/webhook/paymob
```
One web process serves the API **and** the built SPA; the background worker (email outbox + scheduled jobs) runs inside it. This is deliberately a single-node design. Section 12 explains what changes beyond one node.

**Starting sizes (a starting point to measure from, not a capacity promise):** EC2 `t3.small`/`t3.medium`, RDS `db.t4g.small`/`medium` PostgreSQL 16, gp3 storage with autoscaling. Load-test your own instance (`scripts/loadtest.mjs`) before announcing a launch.

## 2. What you must provide (nothing is created for you)
| Need | Used for |
|---|---|
| AWS account + permissions to create EC2, RDS, S3, SES, IAM, CloudWatch, SNS, Elastic IP | everything below |
| A domain and DNS control | HTTPS, email sender, links |
| Paymob merchant credentials (sandbox first) | online payments |
| A private Git remote the server can read (deploy key) | `deploy.sh` |
| An on-call email/Slack for the SNS alarm topic | alerting |

## 3. Provisioning order
Region: pick one where **RDS, SES and your users** are well served (examples use `eu-central-1`). Keep everything in one region.

### 3.1 Network & security groups
- `sg-web` (EC2): inbound 80 and 443 from `0.0.0.0/0`; **22 from your admin IP only** (or use SSM Session Manager and close 22).
- `sg-db` (RDS): inbound **5432 from `sg-web` only**. RDS in private subnets, *not* publicly accessible.

### 3.2 RDS PostgreSQL
- Engine **PostgreSQL 16**, storage **encrypted**, **automated backups >= 7 days** (this gives point-in-time recovery - your primary recovery path), deletion protection **on**, minor-version auto-upgrade on, Multi-AZ if you need failover.
- Parameter group: `rds.force_ssl = 1`.
- Create the application database and role:
```sql
CREATE ROLE usam_app LOGIN PASSWORD '<long random>';
CREATE DATABASE usam OWNER usam_app;
-- pg_trgm is a trusted extension on PG13+: the DB owner can create it (used for fast search)
```
- Download the RDS CA bundle on the server (`https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem`) and set `DB_SSL=true`, `DB_SSL_CA=/etc/ssl/certs/rds-global-bundle.pem` for full certificate verification.

### 3.3 S3 (avatars) and backups
- Bucket `usam-media-<env>`: **block all public access**, default encryption on. Serve it through **CloudFront with origin access control** and set `S3_PUBLIC_BASE_URL=https://<cloudfront-domain>` (the app builds avatar URLs from that value).
- Bucket `usam-backups-<env>`: private, **versioning on**, lifecycle rule (e.g. transition to Glacier after 30 days, expire after 1 year), SSE enabled.

### 3.4 SES (email)
1. Verify your **domain** (DKIM) and set SPF + DMARC records.
2. Verify the From identity used in `EMAIL_FROM`.
3. Request **production access** (leave the sandbox) - until then SES only delivers to verified addresses.
4. Configure a bounce/complaint SNS topic and watch it (SES suspends senders with high bounce rates).
- Auth is by the instance role (3.5). Do **not** create IAM access keys.

### 3.5 IAM role for the instance (least privilege)
Attach `CloudWatchAgentServerPolicy` plus this inline policy (replace names/ARNs):
```json
{
  "Version": "2012-10-17",
  "Statement": [
    { "Effect": "Allow", "Action": ["ses:SendEmail", "ses:SendRawEmail"],
      "Resource": "arn:aws:ses:eu-central-1:<acct>:identity/<your-domain>" },
    { "Effect": "Allow", "Action": ["s3:PutObject", "s3:DeleteObject"],
      "Resource": "arn:aws:s3:::usam-media-<env>/avatars/*" },
    { "Effect": "Allow", "Action": ["s3:PutObject"],
      "Resource": "arn:aws:s3:::usam-backups-<env>/*" }
  ]
}
```

### 3.6 EC2
Ubuntu 22.04 LTS, attach the role, `sg-web`, an encrypted gp3 root volume, and an **Elastic IP**. Point the domain's **A record** (and `www`) at it.

## 4. Server bootstrap
```bash
sudo apt-get update && sudo apt-get install -y git
git clone <your-private-repo> ~/usam && cd ~/usam/app
sudo DOMAIN=usam.example ./deploy/ec2-setup.sh
```
`ec2-setup.sh` is re-runnable. It installs Node 24, Nginx, Certbot, PostgreSQL 16 client, AWS CLI v2, fail2ban, unattended security upgrades, UFW (22/80/443), the CloudWatch agent, the systemd service, journald caps, and the nightly backup + per-minute health timers. It installs a **temporary HTTP-only Nginx config** until a certificate exists. It creates `/etc/usam-communities/env` from `.env.example`.

`ec2-setup.sh` also prepares the **deploy account** (`DEPLOY_USER`, default `ubuntu`): it joins the `usam` group (so it can write releases and backups and read the env file) and receives passwordless sudo for exactly one command, `systemctl restart usam-communities` (validated with `visudo -c`). Run later `deploy.sh` calls as that user; log out and back in once so the new group membership applies. Use `sudo DEPLOY_USER=<name> DOMAIN=... ./deploy/ec2-setup.sh` for a different account.

## 5. Configuration (`/etc/usam-communities/env`, mode 640, root:usam)
Every variable is documented in `app/.env.example`. The production minimum:
```ini
NODE_ENV=production
APP_ORIGIN=https://usam.example
FRONTEND_URL=https://usam.example
COOKIE_SECURE=true
DB_DIALECT=postgres
DATABASE_URL=postgres://usam_app:<pw>@<rds-endpoint>:5432/usam
DB_SSL=true
DB_SSL_CA=/etc/ssl/certs/rds-global-bundle.pem
EMAIL_PROVIDER=ses
EMAIL_FROM="USAM Communities <no-reply@usam.example>"
AWS_SES_REGION=eu-central-1
STORAGE_DRIVER=s3
S3_BUCKET=usam-media-prod
S3_REGION=eu-central-1
S3_PUBLIC_BASE_URL=https://<cloudfront-domain>
BACKUP_S3_URI=s3://usam-backups-prod/db/
PAYMOB_ENABLED=false        # flip only after section 8 passes
```
**The app refuses to start** (exit 1, JSON error lines) if production config is unsafe: SQLite, non-HTTPS origins, insecure cookies, rate limiting disabled, `console` email while verification is required, Paymob enabled without an HMAC secret, SES without a sender, S3 without a bucket. (This is tested.)

## 6. TLS and first deploy
```bash
sudo DOMAIN=usam.example EMAIL=ops@usam.example ./deploy/ssl-setup.sh
```
It checks that DNS points at this host, issues the certificate via the webroot, installs a renewal hook that reloads Nginx, switches to the full HTTPS config, and **proves renewal works** with a dry run. Then deploy:
```bash
./deploy/deploy.sh v1.0.0 git@github.com:you/usam.git     # repo URL needed on the first deploy only
```
Flow: fetch ref -> `npm ci` + build -> **backup the database** -> run migrations -> atomically switch `current` symlink -> restart -> poll `/api/v1/health` for up to 60 s -> **automatic rollback of the code** if unhealthy -> keep the last 5 releases.

Create the first administrator (never put the password on a command line that is logged):
```bash
cd /opt/usam-communities/current
sudo -u usam bash -c 'set -a; . /etc/usam-communities/env; set +a; \
  ADMIN_EMAIL=you@usam.example ADMIN_PASSWORD="$(cat /root/admin.pw)" ADMIN_ROLE=super_admin npm run create:admin'
```

## 7. Smoke test after every deploy
1. `curl -fsS https://usam.example/api/v1/health` -> `{"status":"ok","db":"connected"}`
2. Sign up a test user; the verification email arrives (SES); the link verifies.
3. Join a community, post, upload an avatar (check it appears in S3/CloudFront).
4. Forgot-password email arrives.
5. Admin -> *Plans* shows the four plans; *Background jobs* shows no `dead` rows.
6. `journalctl -u usam-communities -n 50` shows JSON lines with `requestId`; no `level":"error"`.

## 8. Paymob: dashboard setup and the sandbox walkthrough (REQUIRED before live money)
**Dashboard (once):** create a *card* integration; note the integration id and iframe id; set
- *Transaction processed callback* -> `https://usam.example/api/v1/payments/webhook/paymob`
- *Transaction response (redirection) callback* -> `https://usam.example/billing?payment=return`
- Copy the **HMAC secret**.

Put the **sandbox** values in the env file, set `PAYMOB_ENABLED=true`, restart, then verify each row. Our code is tested against a *mock*; this table is how you verify it against the real service:
| # | Do | Expect |
|---|---|---|
| 1 | Buy *Plus monthly* as a verified user | Redirected to Paymob; amount is EGP 149 |
| 2 | Pay with a Paymob **test card** (from Paymob's docs) | Back on `/billing`; within seconds status becomes **Active**; "membership active" email |
| 3 | Use a **declined** test card | Attempt shows *Failed*; "payment issue" email; no entitlement |
| 4 | Re-send the success callback (Paymob dashboard "resend", or replay) | Nothing changes, no second email |
| 5 | Send the callback with a tampered `hmac` | `400 invalid_signature`; alarm counter increments |
| 6 | Admin -> Payments -> **Refund** (partial, then full) | Paymob shows the refund; partial keeps membership, full cancels it; refund email |
| 7 | Disable the callback URL, pay, then Admin -> **Reconcile** | The paid attempt is recovered |
| 8 | Look at amounts in Admin -> Payments | Match the Paymob dashboard to the piaster |

If #6 or the refund callback behaves differently from the mock (the `has_parent_transaction` semantics are the least certain assumption), fix it **before** going live. Only then switch to live keys.

## 9. Migrations, releases and rollback
- Migrations live in `server/migrations/` and are **forward-only**; `0001` creates the schema from the models, `0002` adds performance indexes. Applied versions are recorded in `schema_migrations`.
- **Rule once real data exists:** every schema change is a new, hand-reviewed migration file in *expand/contract* style - first add (new nullable columns, new tables, new indexes) in a release that **both the old and new code can run on**, and remove old columns only in a later release. This is what makes a code rollback safe.
- **Roll back code:** `./deploy/rollback.sh` (instant, atomic symlink switch; asks for confirmation). It does **not** undo migrations.
- **Undo a bad migration:** restore the pre-deploy backup with `restore-db.sh` into a *new* database, verify, then repoint `DATABASE_URL` (data written after the backup is lost - a deliberate decision). RDS point-in-time restore to a new instance is the alternative.
- Running more than one instance: set `MIGRATE_ON_BOOT=false` so only `deploy.sh` migrates.

## 10. Backup & recovery
| Layer | What | Frequency | Retention |
|---|---|---|---|
| RDS automated backups + PITR | whole database | continuous | >= 7-35 days (you choose) |
| `usam-backup.timer` -> `pg_dump` custom format, archive-verified | whole database | nightly 02:30 + before every deploy | 14 days local, S3 lifecycle |
| S3 versioning on media/backup buckets | files | continuous | per lifecycle |

**Restore drill (do it before launch and every quarter):**
```bash
createdb -h <rds> -U <admin> usam_restore_check
./deploy/restore-db.sh /var/backups/usam-communities/usam-<stamp>.dump postgres://<admin>:***@<rds>:5432/usam_restore_check
# inspect counts; then DROP DATABASE usam_restore_check
```
`restore-db.sh` refuses to touch a non-empty database unless `FORCE_OVERWRITE=yes` (which stops the app first). Verified locally: dump -> restore produced identical row counts and data checksums.

## 11. Monitoring, logging, alerting
- **Logs:** the app writes one JSON line per API request (`requestId`, method, **path only**, status, ms, userId) and structured JSON for jobs/errors to journald; the CloudWatch agent ships them to `/usam-communities/app` (30 days), Nginx error log (30 d) and access log (14 d, path-only).
- **Alarms:** run `SNS_TOPIC_ARN=... INSTANCE_ID=... ./deploy/cloudwatch-alarms.sh` (from your laptop). Creates metric filters + alarms for: error-log rate, **payment amount mismatch (page immediately)**, repeated bad webhook signatures, health failures, CPU, disk. Add an RDS `FreeStorageSpace`/`CPUUtilization` alarm.
- **Health:** `usam-health.timer` probes every minute, logs `health.failed`, and restarts the service after 3 consecutive failures. Put an external uptime check (Route 53 health check / UptimeRobot) on `https://<domain>/api/v1/health`.
- **Error tracking:** `SENTRY_DSN` is read but not wired to an SDK; CloudWatch alarms are the supported mechanism. Add Sentry if you want stack-trace grouping.
- **In-app operations:** Admin -> *Background jobs* (email outbox, retry dead letters), *Audit log*, *Payments* (refund/reconcile).

## 12. Scaling beyond one node
What is in-process today and must change before adding a second instance:
1. **Rate-limit counters** (`server/ratelimit.js`): move to Redis (same interface).
2. **Background worker/scheduler**: run on exactly one node (`WORKER_ENABLED=true` there, `false` elsewhere) or move to a queue.
3. **Migrations**: `MIGRATE_ON_BOOT=false` (see section 9).
4. **Sessions** are in the database already (no sticky sessions needed). **Uploads** are in S3 (`STORAGE_DRIVER=s3`).
5. Put an ALB in front; terminate TLS there or keep Nginx per node; `trust proxy` is currently `loopback` only - adjust for the ALB hop.
6. **Real-time** (messaging) is polling today; WebSockets/SSE would need a pub/sub layer.

## 13. Operations runbook
| Task | How |
|---|---|
| Tail logs | `journalctl -u usam-communities -f -o cat \| jq .` |
| Restart | `sudo systemctl restart usam-communities` |
| Stuck/failed emails | Admin -> Background jobs -> Retry |
| Stuck payment | Admin -> Payments -> Reconcile |
| Change a price/plan | Admin -> Plans (no deploy) |
| Close signups | `REGISTRATION_ENABLED=false`, restart |
| Announce maintenance | Admin -> CMS: key `site_announcement`, published |
| Disable a feature | Admin -> Feature flags (enforced server-side) |
| Rotate DB password | change in RDS, edit env file, restart |
| Rotate Paymob/other secrets | edit env file, restart; update the Paymob dashboard HMAC |
| Invalidate every session | `TRUNCATE "Sessions";` (everyone must sign in again) |
| Suspected breach | suspend admin accounts (Admin -> Users), rotate secrets, truncate Sessions, review Audit log + Nginx logs |

### Data retention (enforced by `housekeeping` job, daily)
| Data | Kept |
|---|---|
| Expired sessions | deleted after 1 day |
| Used/expired verification & reset tokens | deleted after 7 days |
| Delivered outbox emails | 30 days (failed/dead kept for inspection) |
| Processed webhook events | 180 days (payment disputes) |
| Read notifications | 180 days |
| Audit log | not deleted |
| Deleted accounts | anonymised immediately (email, name, bio, avatar removed); the stub row is retained for referential integrity - a hard-purge job is **not** implemented |
| Payment records | retained (financial/legal obligations - confirm with your accountant) |

## 14. Verified locally vs. not
**Verified (real execution, Linux containers + PostgreSQL 16):** production-mode boot incl. migrations and seeding; graceful `SIGTERM` shutdown; refusal to start on unsafe config; backup -> restore with identical data; real Nginx config + app (TLS redirect, one HSTS header, body limits per route, spoofed forwarding header ignored, rate limiting, tokens absent from access log); `nginx -t`; `bash -n` on every script; all migrations on PostgreSQL.
**Not verified (needs a real host/account):** `ec2-setup.sh`, `deploy.sh`, `rollback.sh`, `ssl-setup.sh`, the systemd units and timers, CloudWatch agent/alarms, certbot issuance and renewal, RDS/SES/S3/IAM behaviour, Paymob (sandbox or live), DNS. **Rehearse on a staging instance first.**

## 15. Go-live checklist
- [ ] Staging deploy rehearsed end to end, including a rollback and a restore drill
- [ ] Section 8 Paymob sandbox walkthrough passed (all 8 rows); live keys swapped in
- [ ] SES out of sandbox; bounce/complaint topic subscribed; a real verification email received
- [ ] RDS backups >= 7 days, deletion protection, TLS enforced; `DB_SSL_CA` set
- [ ] S3 buckets private; CloudFront in front of media; IAM role least-privilege
- [ ] Alarms created and a test alarm delivered to a human
- [ ] External uptime monitor on `/api/v1/health`
- [ ] First super_admin created; default seed data reviewed; unused admin accounts removed
- [ ] Legal pages (privacy, terms, refunds, cookies) reviewed by qualified counsel; Paymob terms match the refund policy
- [ ] `MFA_ENCRYPTION_KEY` generated (`openssl rand -hex 32`, stored in the secrets manager, never changed), `REQUIRE_ADMIN_MFA=true`, every staff account enrolled, and a penetration test scheduled
- [ ] On-call owner and incident procedure documented
