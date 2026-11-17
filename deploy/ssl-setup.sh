#!/usr/bin/env bash
# Issue a free Let's Encrypt certificate and switch Nginx to the full HTTPS
# configuration. Run AFTER:  (a) ec2-setup.sh  (b) DNS A record -> this host.
#
#   sudo DOMAIN=usam.example EMAIL=ops@usam.example ./deploy/ssl-setup.sh
#
# Certbot installs a systemd timer that renews automatically twice a day; this
# script also installs a deploy hook that reloads Nginx after each renewal and
# performs a dry-run renewal to prove the renewal path works.
set -euo pipefail

: "${DOMAIN:?Set DOMAIN}"
: "${EMAIL:?Set EMAIL (expiry notices go here)}"
[ "$(id -u)" -eq 0 ] || { echo "Run as root (sudo)." >&2; exit 1; }
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Fail early with a clear message if DNS is not pointing here yet.
PUBLIC_IP="$(curl -fsS --max-time 5 https://checkip.amazonaws.com | tr -d '[:space:]')"
DNS_IP="$(getent hosts "$DOMAIN" | awk '{print $1; exit}')"
if [ "$PUBLIC_IP" != "$DNS_IP" ]; then
  echo "DNS check failed: $DOMAIN resolves to '${DNS_IP:-nothing}' but this host is $PUBLIC_IP." >&2
  echo "Fix the A record (and wait for propagation) before requesting a certificate." >&2
  exit 1
fi

certbot certonly --webroot -w /var/www/certbot \
  -d "$DOMAIN" -d "www.$DOMAIN" \
  --email "$EMAIL" --agree-tos --no-eff-email --non-interactive \
  --keep-until-expiring

# Reload Nginx whenever a renewal succeeds.
install -d /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'EOF'
#!/bin/sh
systemctl reload nginx
EOF
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

# Switch to the full HTTPS server config.
sed "s/usam\.example/${DOMAIN}/g" "$SRC_DIR/nginx.conf" > /etc/nginx/sites-available/usam-communities
nginx -t
systemctl reload nginx

echo "Proving automatic renewal works (dry run)..."
certbot renew --dry-run

echo "HTTPS is live: https://${DOMAIN}"
echo "Next: confirm APP_ORIGIN/FRONTEND_URL in /etc/usam-communities/env are https://${DOMAIN}, then deploy."
