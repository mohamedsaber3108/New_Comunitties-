#!/usr/bin/env bash
# Logical PostgreSQL backup (custom format, compressed), optionally copied to S3.
#
# Runs nightly via usam-backup.timer and before every deploy (deploy.sh).
# Layers of protection (use all three):
#   1. RDS automated backups + point-in-time recovery (enable on the instance;
#      7-35 day retention) - this is your PRIMARY recovery path.
#   2. This script: portable pg_dump files, kept 14 days locally and (if
#      BACKUP_S3_URI is set) in S3 with versioning/lifecycle.
#   3. Periodic restore drills (see PRODUCTION_DEPLOYMENT_GUIDE.md).
#
# Reads DATABASE_URL (or DB_* vars) from the environment (the systemd unit loads
# /etc/usam-communities/env). The dump contains personal data: files are 0600,
# and the S3 bucket must be private + encrypted.
set -euo pipefail
umask 077

DEST="${BACKUP_DIR:-/var/backups/usam-communities}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$DEST/usam-$STAMP.dump"
mkdir -p "$DEST"

if [ -n "${DATABASE_URL:-}" ]; then
  CONN="$DATABASE_URL"
else
  : "${DB_HOST:?DATABASE_URL or DB_HOST required}"
  export PGPASSWORD="${DB_PASSWORD:-}"
  CONN="host=$DB_HOST port=${DB_PORT:-5432} dbname=${DB_NAME:?} user=${DB_USER:?}"
fi
# RDS requires TLS in most setups; verify-full when a CA bundle is provided.
if [ -n "${DB_SSL_CA:-}" ]; then export PGSSLMODE=verify-full PGSSLROOTCERT="$DB_SSL_CA"
elif [ "${DB_SSL:-}" = "true" ]; then export PGSSLMODE=require; fi

echo "Dumping to $FILE"
pg_dump --format=custom --compress=6 --no-owner --no-privileges --file="$FILE" "$CONN"

# Fail loudly on a truncated/corrupt dump instead of discovering it at restore time.
pg_restore --list "$FILE" >/dev/null
SIZE="$(stat -c %s "$FILE")"
[ "$SIZE" -gt 1024 ] || { echo "Backup suspiciously small ($SIZE bytes)" >&2; rm -f "$FILE"; exit 1; }
echo "OK: $(basename "$FILE") ($SIZE bytes, archive verified)"

if [ -n "${BACKUP_S3_URI:-}" ]; then
  aws s3 cp "$FILE" "${BACKUP_S3_URI%/}/$(basename "$FILE")" --sse AES256 --only-show-errors
  echo "Uploaded to ${BACKUP_S3_URI%/}/"
fi

find "$DEST" -name 'usam-*.dump' -mtime +"$KEEP_DAYS" -delete
