#!/bin/sh
# Validates the deployment artifacts without touching any server.
# Runs inside a throwaway nginx container (see npm run validate:deploy):
#   - `nginx -t` against deploy/nginx.conf with a self-signed cert
#   - `bash -n` syntax check of every deploy/*.sh
#   - JSON validity of the CloudWatch agent config
set -eu
apk add --no-cache bash openssl jq >/dev/null 2>&1

echo "== nginx -t =="
mkdir -p /etc/letsencrypt/live/usam.example /etc/nginx/snippets /var/www/certbot
openssl req -x509 -nodes -newkey rsa:2048 -days 1 -subj "/CN=usam.example" \
  -keyout /etc/letsencrypt/live/usam.example/privkey.pem \
  -out /etc/letsencrypt/live/usam.example/fullchain.pem >/dev/null 2>&1
cp /deploy/usam-proxy.conf /etc/nginx/snippets/usam-proxy.conf
cp /deploy/nginx.conf /etc/nginx/conf.d/usam.conf
rm -f /etc/nginx/conf.d/default.conf
nginx -t

echo "== bash -n =="
for f in /deploy/*.sh; do
  bash -n "$f" && echo "ok  $(basename "$f")"
done

echo "== JSON =="
jq -e . /deploy/cloudwatch-agent.json >/dev/null && echo "ok  cloudwatch-agent.json"
echo "ALL VALID"
