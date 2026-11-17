#!/usr/bin/env bash
# -------------------------------------------------------------------------
# Install / update USAM Communities on a server that ALREADY runs other sites
# (e.g. the USAM Hub box), without disturbing them.
#
#   sudo bash deploy/install-alongside.sh            # first install or update
#
# What it does NOT do (on purpose, to protect the other sites):
#   - no `apt-get upgrade`, no changes to the system Node.js (Hub keeps its
#     own), no edits to existing Nginx sites, no firewall reset.
# What it does:
#   - private Node.js 24 under /opt/usam-communities/node (checksum-verified)
#   - local PostgreSQL database + role with a random password (no RDS cost)
#   - app in /opt/usam-communities/app (git clone of the GitHub repo)
#   - secrets in /etc/usam-communities/env (root:usam 0640, created once)
#   - systemd service `usam-communities` on 127.0.0.1:3101
#   - a NEW Nginx site on port 8080 (validated with `nginx -t`; rolled back
#     automatically if invalid) + `ufw allow 8080/tcp`
#
# Until a domain + TLS exist it runs in explicit STAGING over plain HTTP
# (STAGING_INSECURE_HTTP=true). See PRODUCTION_DEPLOYMENT_GUIDE.md to switch
# to HTTPS once DNS points at this server.
# -------------------------------------------------------------------------
set -euo pipefail
[ "$(id -u)" -eq 0 ] || { echo "Run with sudo." >&2; exit 1; }

REPO="${REPO:-https://github.com/mohamedsaber3108/New_Comunitties-.git}"
BRANCH="${BRANCH:-main}"
ROOT=/opt/usam-communities
APP="$ROOT/app"
NODE_DIR="$ROOT/node"
ENV_DIR=/etc/usam-communities
ENV_FILE="$ENV_DIR/env"
DATA=/var/lib/usam-communities
APP_PORT="${APP_PORT:-3101}"
PUBLIC_PORT="${PUBLIC_PORT:-8080}"
SVC=usam-communities
log() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31mERROR: %s\033[0m\n' "$*" >&2; exit 1; }

# ---- 0. Safety snapshot of what is already running ------------------------
STAMP="$(date +%Y%m%d-%H%M%S)"
SNAP="/root/usam-communities-preinstall-$STAMP"
mkdir -p "$SNAP"
tar -czf "$SNAP/etc-nginx.tgz" -C /etc nginx 2>/dev/null || true
{ ss -tlnp; echo; ls -l /etc/nginx/sites-enabled; } > "$SNAP/state.txt" 2>&1 || true
log "Snapshot of existing Nginx config + ports saved in $SNAP"
if ss -tln | awk '{print $4}' | grep -qE "[:.]$APP_PORT\$" && ! systemctl is-active --quiet "$SVC"; then
  die "Port $APP_PORT is already used by something else. Re-run with APP_PORT=<free port>."
fi
if ss -tln | awk '{print $4}' | grep -qE "[:.]$PUBLIC_PORT\$" && [ ! -f /etc/nginx/sites-enabled/usam-communities.conf ]; then
  die "Port $PUBLIC_PORT is already used. Re-run with PUBLIC_PORT=<free port>."
fi

# ---- 1. Packages (install only; never upgrade the box) --------------------
log "Installing required packages (no system upgrade)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y --no-upgrade --no-install-recommends \
  postgresql postgresql-contrib git curl ca-certificates xz-utils openssl \
  build-essential python3   # only used if a native module has no prebuilt binary

# ---- 2. Private Node.js 24 (does not replace the system node) -------------
if [ ! -x "$NODE_DIR/bin/node" ] || ! "$NODE_DIR/bin/node" -v | grep -q '^v24'; then
  log "Installing private Node.js 24 in $NODE_DIR"
  ARCH="$(uname -m)"; case "$ARCH" in x86_64) NARCH=x64;; aarch64) NARCH=arm64;; *) die "unsupported arch $ARCH";; esac
  TMP="$(mktemp -d)"
  curl -fsSL https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt -o "$TMP/SHASUMS256.txt"
  FILE="$(grep -oE "node-v24\.[0-9]+\.[0-9]+-linux-$NARCH\.tar\.xz" "$TMP/SHASUMS256.txt" | head -1)"
  [ -n "$FILE" ] || die "could not find a Node 24 build for $NARCH"
  curl -fsSL "https://nodejs.org/dist/latest-v24.x/$FILE" -o "$TMP/$FILE"
  (cd "$TMP" && grep " $FILE\$" SHASUMS256.txt | sha256sum -c -) || die "Node.js checksum mismatch"
  mkdir -p "$NODE_DIR"
  tar -xJf "$TMP/$FILE" -C "$NODE_DIR" --strip-components=1
  rm -rf "$TMP"
fi
export PATH="$NODE_DIR/bin:$PATH"
log "Node $(node -v), npm $(npm -v) (system node untouched: $(/usr/bin/node -v 2>/dev/null || echo none))"

# ---- 3. Service user + directories ----------------------------------------
id -u usam >/dev/null 2>&1 || useradd --system --home-dir "$ROOT" --shell /usr/sbin/nologin usam
install -d -o usam -g usam -m 755 "$ROOT"
install -d -o usam -g usam -m 750 "$DATA" "$DATA/media" "$DATA/backups"
install -d -o root -g usam -m 750 "$ENV_DIR"
chown usam:usam "$NODE_DIR" 2>/dev/null || true

# ---- 4. Code ----------------------------------------------------------------
log "Fetching code ($REPO @ $BRANCH)"
if [ -d "$APP/.git" ]; then
  sudo -u usam git -C "$APP" fetch --quiet origin "$BRANCH"
  sudo -u usam git -C "$APP" checkout --quiet -B "$BRANCH" "origin/$BRANCH"
else
  rm -rf "$APP"
  sudo -u usam git clone --quiet --branch "$BRANCH" "$REPO" "$APP"
fi
REV="$(sudo -u usam git -C "$APP" rev-parse --short HEAD)"
log "Code at $REV"

# ---- 5. Database (local PostgreSQL, created once) -------------------------
systemctl enable --now postgresql >/dev/null
DB_NAME=usam_communities
DB_USER=usam_communities
if [ ! -f "$ENV_FILE" ]; then
  DB_PASS="$(openssl rand -hex 24)"
  if sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
    sudo -u postgres psql -qc "ALTER ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS'"
  else
    sudo -u postgres psql -qc "CREATE ROLE $DB_USER WITH LOGIN PASSWORD '$DB_PASS'"
  fi
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1 \
    || sudo -u postgres createdb -O "$DB_USER" "$DB_NAME"
  IP="$(TOKEN=$(curl -fsS -m 3 -X PUT http://169.254.169.254/latest/api/token -H 'X-aws-ec2-metadata-token-ttl-seconds: 60') \
        && curl -fsS -m 3 -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/public-ipv4 || true)"
  [ -n "$IP" ] || IP="$(curl -fsS -m 5 https://checkip.amazonaws.com | tr -d '\n' || true)"
  [ -n "$IP" ] || die "could not determine the public IP; set it in $ENV_FILE manually"
  ORIGIN="http://$IP:$PUBLIC_PORT"
  log "Writing $ENV_FILE (origin $ORIGIN)"
  umask 027
  cat > "$ENV_FILE" <<EOF
# USAM Communities - generated $(date -u +%FT%TZ). Root-owned; readable by the service group only.
NODE_ENV=production
PORT=$APP_PORT
# STAGING over plain HTTP until a domain + TLS exist. Remove these three lines
# and set https:// origins + COOKIE_SECURE=true when going live.
STAGING_INSECURE_HTTP=true
COOKIE_SECURE=false
APP_ORIGIN=$ORIGIN
FRONTEND_URL=$ORIGIN
DB_DIALECT=postgres
DATABASE_URL=postgres://$DB_USER:$DB_PASS@127.0.0.1:5432/$DB_NAME
# No email provider yet -> verification cannot be delivered, so it is off for
# staging. Turn REQUIRE_EMAIL_VERIFICATION=true once EMAIL_PROVIDER=ses works.
EMAIL_PROVIDER=console
REQUIRE_EMAIL_VERIFICATION=false
REGISTRATION_ENABLED=true
STORAGE_DRIVER=local
MEDIA_ROOT=$DATA/media
MFA_ENCRYPTION_KEY=$(openssl rand -hex 32)
REQUIRE_ADMIN_MFA=false
PAYMOB_ENABLED=false
WORKER_ENABLED=true
LOG_LEVEL=info
EOF
  chown root:usam "$ENV_FILE"; chmod 640 "$ENV_FILE"
else
  log "Keeping existing $ENV_FILE (secrets are never regenerated)"
fi

# ---- 6. Build -----------------------------------------------------------------
log "Installing dependencies and building (this takes a few minutes)"
cd "$APP"
sudo -u usam env PATH="$PATH" HOME="$ROOT" npm ci --no-audit --no-fund --loglevel=error
sudo -u usam env PATH="$PATH" HOME="$ROOT" npm run build:ec2 --silent
sudo -u usam env PATH="$PATH" HOME="$ROOT" npm prune --omit=dev --no-audit --no-fund --loglevel=error

# ---- 7. Back up (if data exists) and migrate --------------------------------
if sudo -u postgres psql -d "$DB_NAME" -tAc "SELECT to_regclass('public.schema_migrations')" | grep -q schema_migrations; then
  log "Backing up the database before migrating"
  sudo -u postgres pg_dump -Fc "$DB_NAME" > "$DATA/backups/pre-$REV-$STAMP.dump"
  chown usam:usam "$DATA/backups/pre-$REV-$STAMP.dump"
fi
log "Running database migrations"
sudo -u usam bash -c "set -a; . '$ENV_FILE'; set +a; cd '$APP'; '$NODE_DIR/bin/node' server/migrate.js up"

# ---- 8. systemd service ------------------------------------------------------
log "Installing systemd service $SVC"
cat > /etc/systemd/system/$SVC.service <<EOF
[Unit]
Description=USAM Communities (Node.js API + SPA)
After=network-online.target postgresql.service
Wants=network-online.target
[Service]
Type=simple
User=usam
Group=usam
WorkingDirectory=$APP
EnvironmentFile=$ENV_FILE
ExecStart=$NODE_DIR/bin/node server/index.js
Restart=always
RestartSec=3
StartLimitIntervalSec=120
StartLimitBurst=10
KillSignal=SIGTERM
TimeoutStopSec=35
StandardOutput=journal
StandardError=journal
SyslogIdentifier=$SVC
NoNewPrivileges=true
PrivateTmp=true
PrivateDevices=true
ProtectSystem=strict
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
ReadWritePaths=$DATA
MemoryMax=900M
LimitNOFILE=65536
[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable $SVC >/dev/null
systemctl restart $SVC
for i in $(seq 1 30); do
  curl -fsS "http://127.0.0.1:$APP_PORT/api/v1/health" >/dev/null 2>&1 && break
  sleep 1
done
curl -fsS "http://127.0.0.1:$APP_PORT/api/v1/health" >/dev/null 2>&1 \
  || { journalctl -u $SVC -n 60 --no-pager; die "the app did not become healthy (log above)"; }
log "App healthy on 127.0.0.1:$APP_PORT"

# ---- 9. Nginx site (new file only; existing sites untouched) ---------------
SITE=/etc/nginx/sites-available/usam-communities.conf
cat > "$SITE" <<EOF
# USAM Communities (staging, plain HTTP on :$PUBLIC_PORT). Generated by install-alongside.sh.
# Path-only access log: tokens in query strings (verify/reset links) never hit disk.
log_format usam_communities '\$remote_addr [\$time_local] "\$request_method \$uri" \$status \$body_bytes_sent \$request_time "\$http_user_agent"';
limit_req_zone \$binary_remote_addr zone=usamc_api:10m rate=10r/s;
limit_req_zone \$binary_remote_addr zone=usamc_auth:10m rate=10r/m;
upstream usam_communities_app { server 127.0.0.1:$APP_PORT; keepalive 16; }
server {
    listen $PUBLIC_PORT;
    listen [::]:$PUBLIC_PORT;
    server_name _;
    server_tokens off;
    client_max_body_size 256k;
    access_log /var/log/nginx/usam-communities.access.log usam_communities;
    error_log  /var/log/nginx/usam-communities.error.log warn;
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$remote_addr;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Request-Id \$request_id;
    proxy_read_timeout 60s;
    location ~ /\.(?!well-known) { return 404; }
    location ~ ^/api/v1/auth/(login|signup|password/forgot|password/reset|verify-email|resend-verification)\$ {
        limit_req zone=usamc_auth burst=10 nodelay;
        limit_req_status 429;
        proxy_pass http://usam_communities_app;
    }
    location ~ ^/api/v1/(users/me/avatar|media/images)\$ {
        client_max_body_size 15m;
        limit_req zone=usamc_api burst=5 nodelay;
        proxy_pass http://usam_communities_app;
    }
    location = /api/v1/stream {
        proxy_buffering off;
        proxy_read_timeout 1h;
        proxy_pass http://usam_communities_app;
    }
    location /api/ {
        limit_req zone=usamc_api burst=40 nodelay;
        limit_req_status 429;
        proxy_pass http://usam_communities_app;
    }
    location / { proxy_pass http://usam_communities_app; }
}
EOF
ln -sf "$SITE" /etc/nginx/sites-enabled/usam-communities.conf
if ! nginx -t 2>/tmp/usamc-nginx-test.txt; then
  cat /tmp/usamc-nginx-test.txt
  rm -f /etc/nginx/sites-enabled/usam-communities.conf
  die "Nginx rejected the new site; it was removed again and the existing sites are unchanged."
fi
systemctl reload nginx
log "Nginx site enabled on port $PUBLIC_PORT (existing sites untouched)"

# ---- 10. Firewall: open only the new port ----------------------------------
if ufw status | grep -q "Status: active"; then
  ufw allow "$PUBLIC_PORT/tcp" comment 'USAM Communities' >/dev/null
  log "ufw: allowed $PUBLIC_PORT/tcp"
fi

# ---- 11. Daily database backup (keeps 14) -----------------------------------
cat > /etc/cron.daily/usam-communities-backup <<EOF
#!/bin/sh
f="$DATA/backups/daily-\$(date +%F).dump"
sudo -u postgres pg_dump -Fc $DB_NAME > "\$f" && chown usam:usam "\$f"
ls -1t $DATA/backups/daily-*.dump 2>/dev/null | tail -n +15 | xargs -r rm -f
EOF
chmod 755 /etc/cron.daily/usam-communities-backup

# ---- 12. Verify through Nginx ------------------------------------------------
HEALTH="$(curl -fsS "http://127.0.0.1:$PUBLIC_PORT/api/v1/health" || true)"
HOME_CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PUBLIC_PORT/")"
ORIGIN_NOW="$(grep '^APP_ORIGIN=' "$ENV_FILE" | cut -d= -f2-)"
echo
echo "------------------------------------------------------------------"
echo " USAM Communities $REV installed"
echo "   health via nginx : $HEALTH"
echo "   home page        : HTTP $HOME_CODE"
echo "   public URL       : $ORIGIN_NOW"
echo "   service          : systemctl status $SVC   |  logs: journalctl -u $SVC -f"
echo "   secrets          : $ENV_FILE"
echo "   pre-install snap : $SNAP"
echo
echo " Still required in the AWS console: Security group -> Inbound rules ->"
echo "   add Custom TCP $PUBLIC_PORT from 0.0.0.0/0 (or your IP while testing)."
echo
echo " Create your admin account (password >= 16 chars, typed, not echoed):"
echo "   sudo bash $APP/deploy/create-admin-local.sh"
echo "------------------------------------------------------------------"
