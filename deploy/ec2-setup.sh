#!/usr/bin/env bash
# One-time (and safely re-runnable) bootstrap of a fresh Ubuntu 22.04 EC2 host.
#
#   sudo DOMAIN=usam.example ./deploy/ec2-setup.sh
#
# It installs and configures: Node 24, Nginx, Certbot, PostgreSQL client 16
# (for backups), AWS CLI v2, fail2ban, unattended security upgrades, UFW,
# the CloudWatch agent, the systemd service and log rotation.
#
# It does NOT create any AWS resources (no RDS, S3, SES, IAM, DNS) and does not
# issue the TLS certificate - see PRODUCTION_DEPLOYMENT_GUIDE.md for the order.
set -euo pipefail

: "${DOMAIN:?Set DOMAIN, e.g. sudo DOMAIN=usam.example ./deploy/ec2-setup.sh}"
[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo)." >&2; exit 1; }

APP_USER=usam
# The human/CI account that runs deploy.sh (default: the login user of a stock
# Ubuntu AMI). It joins the `usam` group so it can write releases/backups and
# read the env file, and gets ONE passwordless sudo command (restart the app).
DEPLOY_USER="${DEPLOY_USER:-ubuntu}"
APP_ROOT=/opt/usam-communities
ENV_DIR=/etc/usam-communities
DATA_DIR=/var/lib/usam-communities
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

log() { printf '\n==> %s\n' "$*"; }

log "Base packages & security updates"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl gnupg unzip git ufw fail2ban nginx \
  certbot python3-certbot-nginx unattended-upgrades logrotate jq

log "Node.js 24 (NodeSource)"
if ! command -v node >/dev/null || ! node -v | grep -q '^v24'; then
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
node -v

log "PostgreSQL 16 client (pg_dump / psql for backups)"
if ! command -v pg_dump >/dev/null || ! pg_dump --version | grep -q ' 16\.'; then
  install -d /usr/share/postgresql-common/pgdg
  curl -fsSL https://www.postgresql.org/media/keys/ACCC4CF8.asc \
    -o /usr/share/postgresql-common/pgdg/apt.postgresql.org.asc
  echo "deb [signed-by=/usr/share/postgresql-common/pgdg/apt.postgresql.org.asc] https://apt.postgresql.org/pub/repos/apt $(. /etc/os-release && echo "$VERSION_CODENAME")-pgdg main" \
    > /etc/apt/sources.list.d/pgdg.list
  apt-get update -y
  apt-get install -y postgresql-client-16
fi

log "AWS CLI v2"
if ! command -v aws >/dev/null; then
  tmp="$(mktemp -d)"
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-$(uname -m).zip" -o "$tmp/awscli.zip"
  unzip -q "$tmp/awscli.zip" -d "$tmp"
  "$tmp/aws/install"
  rm -rf "$tmp"
fi

log "Service user and directories"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
id -u "$DEPLOY_USER" >/dev/null 2>&1 || { echo "DEPLOY_USER '$DEPLOY_USER' does not exist (set DEPLOY_USER=...)." >&2; exit 1; }
usermod -aG "$APP_USER" "$DEPLOY_USER"
# Group-writable so the deploy user can add releases and write pre-deploy
# backups; the service itself only ever reads the code.
install -d -o "$APP_USER" -g "$APP_USER" -m 775 "$APP_ROOT" "$APP_ROOT/releases" "$APP_ROOT/shared"
install -d -o "$APP_USER" -g "$APP_USER" -m 750 "$DATA_DIR"
install -d -o "$APP_USER" -g "$APP_USER" -m 770 /var/backups/usam-communities
install -d -o root -g "$APP_USER" -m 750 "$ENV_DIR"

log "Passwordless sudo for exactly one command: restarting the service"
cat > /etc/sudoers.d/usam-deploy <<EOF
${DEPLOY_USER} ALL=(root) NOPASSWD: /bin/systemctl restart usam-communities
EOF
chmod 440 /etc/sudoers.d/usam-deploy
visudo -cf /etc/sudoers.d/usam-deploy
if [ ! -f "$ENV_DIR/env" ]; then
  install -o root -g "$APP_USER" -m 640 /dev/null "$ENV_DIR/env"
  cat "$SRC_DIR/../.env.example" > "$ENV_DIR/env"
  echo "Created $ENV_DIR/env from .env.example - EDIT IT before the first deploy."
fi

log "systemd service"
install -m 644 "$SRC_DIR/usam-communities.service" /etc/systemd/system/usam-communities.service
systemctl daemon-reload
systemctl enable usam-communities

log "Nginx (domain: $DOMAIN)"
install -d /etc/nginx/snippets /var/www/certbot
install -m 644 "$SRC_DIR/usam-proxy.conf" /etc/nginx/snippets/usam-proxy.conf
sed "s/usam\.example/${DOMAIN}/g" "$SRC_DIR/nginx.conf" > /etc/nginx/sites-available/usam-communities
# Until Certbot issues a certificate the 443 block cannot load; serve HTTP only.
if [ ! -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
  echo "No certificate yet -> installing HTTP-only bootstrap config. Run deploy/ssl-setup.sh next."
  cat > /etc/nginx/sites-available/usam-communities <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN} www.${DOMAIN};
    location /.well-known/acme-challenge/ { root /var/www/certbot; }
    location / { include /etc/nginx/snippets/usam-proxy.conf; }
}
upstream usam_app { server 127.0.0.1:3001; keepalive 16; }
EOF
fi
ln -sf /etc/nginx/sites-available/usam-communities /etc/nginx/sites-enabled/usam-communities
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
systemctl reload nginx

log "Firewall (UFW): SSH + HTTP + HTTPS only"
ufw default deny incoming
ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

log "fail2ban (SSH) and unattended security upgrades"
systemctl enable --now fail2ban
dpkg-reconfigure -f noninteractive unattended-upgrades || true

log "Log rotation (Nginx logs are rotated by the nginx package; app logs live in journald)"
cat > /etc/logrotate.d/usam-communities <<'EOF'
/var/backups/usam-communities/*.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
}
EOF
# Cap journald so a log storm cannot fill the disk.
install -d /etc/systemd/journald.conf.d
cat > /etc/systemd/journald.conf.d/usam.conf <<'EOF'
[Journal]
SystemMaxUse=500M
MaxRetentionSec=14day
EOF
systemctl restart systemd-journald

log "CloudWatch agent (ships journald JSON logs; needs an IAM role on the instance)"
if ! command -v amazon-cloudwatch-agent-ctl >/dev/null && [ ! -x /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl ]; then
  tmp="$(mktemp -d)"
  arch="$(dpkg --print-architecture)"
  curl -fsSL "https://amazoncloudwatch-agent.s3.amazonaws.com/ubuntu/${arch}/latest/amazon-cloudwatch-agent.deb" -o "$tmp/cw.deb"
  dpkg -i "$tmp/cw.deb"
  rm -rf "$tmp"
fi
install -d /opt/aws/amazon-cloudwatch-agent/etc
install -m 644 "$SRC_DIR/cloudwatch-agent.json" /opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json
/opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 \
  -c file:/opt/aws/amazon-cloudwatch-agent/etc/amazon-cloudwatch-agent.json -s \
  || echo "CloudWatch agent not started (attach an IAM role with CloudWatchAgentServerPolicy, then re-run)."

log "Backup & health timers"
install -m 755 "$SRC_DIR/backup-db.sh"   /usr/local/bin/usam-backup-db
install -m 755 "$SRC_DIR/healthcheck.sh" /usr/local/bin/usam-healthcheck
cat > /etc/systemd/system/usam-backup.service <<'EOF'
[Unit]
Description=USAM Communities database backup
[Service]
Type=oneshot
User=usam
EnvironmentFile=/etc/usam-communities/env
ExecStart=/usr/local/bin/usam-backup-db
EOF
cat > /etc/systemd/system/usam-backup.timer <<'EOF'
[Unit]
Description=Nightly USAM Communities database backup
[Timer]
OnCalendar=*-*-* 02:30:00
Persistent=true
RandomizedDelaySec=600
[Install]
WantedBy=timers.target
EOF
cat > /etc/systemd/system/usam-health.service <<'EOF'
[Unit]
Description=USAM Communities health probe
[Service]
Type=oneshot
ExecStart=/usr/local/bin/usam-healthcheck
EOF
cat > /etc/systemd/system/usam-health.timer <<'EOF'
[Unit]
Description=USAM Communities health probe every minute
[Timer]
OnBootSec=2min
OnUnitActiveSec=1min
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now usam-backup.timer usam-health.timer

log "Done. Next steps:"
cat <<EOF
  1. Edit $ENV_DIR/env  (DATABASE_URL, APP_ORIGIN=https://${DOMAIN}, EMAIL_*, S3_*, PAYMOB_*).
  2. Point DNS A record for ${DOMAIN} at this instance's Elastic IP.
  3. sudo DOMAIN=${DOMAIN} EMAIL=you@${DOMAIN} ./deploy/ssl-setup.sh
  4. As the deploy user:  ./deploy/deploy.sh <git-ref>
  5. Create the first admin:  cd ${APP_ROOT}/current && sudo -u ${APP_USER} env \$(cat ${ENV_DIR}/env | xargs) ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_ROLE=super_admin npm run create:admin
EOF
