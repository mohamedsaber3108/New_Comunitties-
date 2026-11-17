#!/usr/bin/env bash
# Zero-surprise release deploy with automatic rollback.
#
#   ./deploy/deploy.sh <git-ref> [repo-url]
#
# Flow:  checkout -> npm ci -> build -> BACKUP DB -> migrate -> switch symlink
#        -> restart -> health check -> (auto-rollback on failure)
#
# Releases live in /opt/usam-communities/releases/<timestamp>; `current` is a
# symlink, so rolling back the CODE is instant and atomic.
#
# IMPORTANT (database): migrations are forward-only. A code rollback does NOT
# undo schema changes. Write migrations in "expand/contract" style (additive
# first, destructive later) so the previous release still runs on the new
# schema. See PRODUCTION_DEPLOYMENT_GUIDE.md -> "Migrations & rollback".
set -euo pipefail

REF="${1:?usage: deploy.sh <git-ref> [repo-url]}"
REPO="${2:-${REPO_URL:-}}"
APP_ROOT=/opt/usam-communities
ENV_FILE=/etc/usam-communities/env
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
REL="$APP_ROOT/releases/$STAMP"
PREV="$(readlink -f "$APP_ROOT/current" 2>/dev/null || true)"

log() { printf '\n==> %s\n' "$*"; }
die() { echo "DEPLOY FAILED: $*" >&2; exit 1; }

[ -f "$ENV_FILE" ] || die "$ENV_FILE missing - run ec2-setup.sh and edit it."
[ -n "$REPO" ] || [ -d "$APP_ROOT/repo.git" ] || die "Pass the repo URL on the first deploy."

log "Fetching $REF"
if [ ! -d "$APP_ROOT/repo.git" ]; then
  git clone --bare "$REPO" "$APP_ROOT/repo.git"
else
  git --git-dir="$APP_ROOT/repo.git" fetch --prune origin '+refs/*:refs/*'
fi
git --git-dir="$APP_ROOT/repo.git" rev-parse --verify "$REF^{commit}" >/dev/null || die "unknown ref $REF"
mkdir -p "$REL"
git --git-dir="$APP_ROOT/repo.git" archive "$REF" | tar -x -C "$REL"
COMMIT="$(git --git-dir="$APP_ROOT/repo.git" rev-parse --short "$REF^{commit}")"
echo "$COMMIT" > "$REL/.release-commit"

# Load the production environment for the build/migration steps.
set -a; . "$ENV_FILE"; set +a
export NODE_ENV=production

log "Installing exact dependencies from the lockfile and building the web client"
# vite is a devDependency: install everything for the build, then prune to the
# production set so dev tooling (and its advisories) never ships to the server.
( cd "$REL" && npm ci --no-audit --no-fund && npm run build:ec2 && npm prune --omit=dev )

log "Backing up the database BEFORE migrating"
/usr/local/bin/usam-backup-db || die "pre-deploy backup failed; refusing to migrate"

log "Applying database migrations"
( cd "$REL" && node server/migrate.js status && node server/migrate.js up ) || die "migration failed (DB backup was taken just before)"

log "Switching to the new release"
ln -sfn "$REL" "$APP_ROOT/current.next"
mv -Tf "$APP_ROOT/current.next" "$APP_ROOT/current"
sudo systemctl restart usam-communities

log "Health check"
ok=0
for i in $(seq 1 30); do
  if curl -fsS --max-time 3 http://127.0.0.1:3001/api/v1/health | grep -q '"status":"ok"'; then ok=1; break; fi
  sleep 2
done

if [ "$ok" -ne 1 ]; then
  echo "New release did not become healthy." >&2
  if [ -n "$PREV" ] && [ -d "$PREV" ]; then
    echo "Rolling back code to $PREV" >&2
    ln -sfn "$PREV" "$APP_ROOT/current.next"; mv -Tf "$APP_ROOT/current.next" "$APP_ROOT/current"
    sudo systemctl restart usam-communities
  fi
  die "release $STAMP ($COMMIT) failed its health check"
fi

log "Release $STAMP ($COMMIT) is live. Pruning old releases (keeping 5)."
ls -1dt "$APP_ROOT"/releases/* | tail -n +6 | xargs -r rm -rf
