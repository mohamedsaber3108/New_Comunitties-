#!/usr/bin/env bash
# Create (or promote) the first super admin on a server installed with
# install-alongside.sh. Prompts for the details; the password is never echoed
# and never appears in shell history, argv or the process list: it is handed
# to the app over stdin (works with both classic sudo and sudo-rs, which
# ignores `sudo -E`).
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo." >&2; exit 1; }
ROOT=/opt/usam-communities
read -rp "Admin email: " ADMIN_EMAIL
read -rp "Admin display name: " ADMIN_NAME
read -rsp "Admin password (16+ characters): " ADMIN_PASSWORD; echo
read -rsp "Repeat password: " CONFIRM; echo
[ "$ADMIN_PASSWORD" = "$CONFIRM" ] || { echo "Passwords do not match." >&2; exit 1; }
[ "${#ADMIN_PASSWORD}" -ge 16 ] || { echo "Password must be at least 16 characters." >&2; exit 1; }
printf '%s\n%s\n%s\n' "$ADMIN_EMAIL" "$ADMIN_NAME" "$ADMIN_PASSWORD" | sudo -u usam bash -c '
  set -euo pipefail
  IFS= read -r ADMIN_EMAIL; IFS= read -r ADMIN_NAME; IFS= read -r ADMIN_PASSWORD
  set -a; . /etc/usam-communities/env; set +a
  export ADMIN_EMAIL ADMIN_NAME ADMIN_PASSWORD ADMIN_ROLE=super_admin PROMOTE_EXISTING=yes
  cd '"$ROOT"'/app
  exec '"$ROOT"'/node/bin/node server/create-admin.js
'
