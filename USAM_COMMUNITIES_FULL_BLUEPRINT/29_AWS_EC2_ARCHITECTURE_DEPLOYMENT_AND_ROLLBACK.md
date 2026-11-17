# AWS EC2 Architecture, Deployment and Rollback

**Purpose:** Reproducible target operations  
**Applies to:** USAM Communities React/Node.js/EC2 package  
**Sources:** audited source at commit lineage `03ea43c...`, Universal Blueprint v1.1, supplied master prompt, official sources ledger  
**Status:** CURRENT + TARGET

Target: DNS → Nginx HTTPS → static React + Express → RDS MySQL; optional Redis/worker and S3 later. Use non-root runtime, IAM role, Security Group limited to 80/443 and controlled SSH/SSM, PM2 or systemd, health checks and log rotation. Manual release: build/test artifact, checksum, backup, upload versioned release, install production deps, migrate, switch symlink/process, smoke test. Rollback code first only when schema is backward compatible; otherwise restore using approved migration/backup runbook. AWS deployment was not executed here.

