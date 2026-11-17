#!/usr/bin/env bash
# Create (or promote) the first super admin on a server installed with
# install-alongside.sh. Prompts for the details; the password is never echoed
# and never appears in shell history or the process list.
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo." >&2; exit 1; }
ROOT=/opt/usam-communities
read -rp "Admin email: " ADMIN_EMAIL
read -rp "Admin display name: " ADMIN_NAME
read -rsp "Admin password (16+ characters): " ADMIN_PASSWORD; echo
read -rsp "Repeat password: " CONFIRM; echo
[ "$ADMIN_PASSWORD" = "$CONFIRM" ] || { echo "Passwords do not match." >&2; exit 1; }
export ADMIN_EMAIL ADMIN_NAME ADMIN_PASSWORD ADMIN_ROLE=super_admin PROMOTE_EXISTING=yes
sudo -E -u usam bash -c "set -a; . /etc/usam-communities/env; set +a; cd $ROOT/app; $ROOT/node/bin/node server/create-admin.js"
