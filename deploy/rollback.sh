#!/usr/bin/env bash
# Roll the CODE back to a previous release (instant, atomic symlink switch).
#
#   ./deploy/rollback.sh            # go back to the release before `current`
#   ./deploy/rollback.sh 20261104T081500Z   # go to a specific release
#
# This does NOT undo database migrations. If a bad migration must be reverted,
# restore the pre-deploy backup with deploy/restore-db.sh (data written after
# the backup is lost - decide deliberately). Prefer expand/contract migrations
# so the older code keeps working on the newer schema.
set -euo pipefail

APP_ROOT=/opt/usam-communities
CUR="$(readlink -f "$APP_ROOT/current")"
TARGET="${1:-}"

if [ -z "$TARGET" ]; then
  TARGET_DIR="$(ls -1dt "$APP_ROOT"/releases/* | grep -vxF "$CUR" | head -n1 || true)"
else
  TARGET_DIR="$APP_ROOT/releases/$TARGET"
fi
[ -n "${TARGET_DIR:-}" ] && [ -d "$TARGET_DIR" ] || { echo "No earlier release found." >&2; exit 1; }

echo "current : $CUR ($(cat "$CUR/.release-commit" 2>/dev/null || echo ?))"
echo "rollback: $TARGET_DIR ($(cat "$TARGET_DIR/.release-commit" 2>/dev/null || echo ?))"
read -r -p "Switch to the rollback release? [y/N] " yn
[ "$yn" = "y" ] || { echo "Aborted."; exit 1; }

ln -sfn "$TARGET_DIR" "$APP_ROOT/current.next"
mv -Tf "$APP_ROOT/current.next" "$APP_ROOT/current"
sudo systemctl restart usam-communities

for i in $(seq 1 30); do
  if curl -fsS --max-time 3 http://127.0.0.1:3001/api/v1/health | grep -q '"status":"ok"'; then
    echo "Rolled back and healthy."; exit 0
  fi
  sleep 2
done
echo "Rolled back but the health check is failing - inspect: journalctl -u usam-communities -n 100" >&2
exit 1
