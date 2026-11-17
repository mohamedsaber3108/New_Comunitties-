#!/usr/bin/env bash
# Restore a backup made by backup-db.sh.
#
#   ./deploy/restore-db.sh <dump-file> <target-database-url>
#
# SAFE BY DEFAULT: restore into a NEW/EMPTY database first (a restore drill, or
# to inspect data), and only repoint the app after verifying. Restoring over the
# live production database requires FORCE_OVERWRITE=yes and stops the app first.
#
#   # drill:  create an empty DB, restore, inspect
#   createdb -h <rds-host> -U <admin> usam_restore_check
#   ./deploy/restore-db.sh /var/backups/usam-communities/usam-XXXX.dump \
#       postgres://admin:***@<rds-host>:5432/usam_restore_check
set -euo pipefail

DUMP="${1:?usage: restore-db.sh <dump-file> <target-database-url>}"
TARGET="${2:?target database url required}"
[ -f "$DUMP" ] || { echo "No such file: $DUMP" >&2; exit 1; }
pg_restore --list "$DUMP" >/dev/null || { echo "Archive is corrupt/unreadable." >&2; exit 1; }

# Refuse to clobber a database that already has tables unless explicitly forced.
EXISTING="$(psql "$TARGET" -Atc "select count(*) from information_schema.tables where table_schema='public'")"
if [ "$EXISTING" != "0" ] && [ "${FORCE_OVERWRITE:-}" != "yes" ]; then
  echo "Target already has $EXISTING tables. Restore into an empty database, or set FORCE_OVERWRITE=yes." >&2
  exit 1
fi
if [ "$EXISTING" != "0" ]; then
  echo "FORCE_OVERWRITE=yes: stopping the application first."
  sudo systemctl stop usam-communities
  CLEAN=(--clean --if-exists)
else
  CLEAN=()
fi

pg_restore --no-owner --no-privileges --exit-on-error "${CLEAN[@]}" --dbname="$TARGET" "$DUMP"

echo "Restored. Sanity counts:"
psql "$TARGET" -Atc 'select '"'"'users'"'"', count(*) from "Users" union all select '"'"'subscriptions'"'"', count(*) from "Subscriptions" union all select '"'"'payments'"'"', count(*) from "PaymentAttempts"'
echo "If this was an overwrite: sudo systemctl start usam-communities"
