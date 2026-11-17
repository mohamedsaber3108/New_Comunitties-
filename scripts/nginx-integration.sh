#!/bin/sh
# Integration test: the REAL Node app behind the REAL deploy/nginx.conf.
# Runs inside a disposable Linux container (nginx:stable-alpine + nodejs):
#   docker run --rm -v <app>:/app:ro -v <app>/deploy:/deploy:ro -v <app>/scripts:/scripts:ro \
#     -e DATABASE_URL=postgres://... nginx:stable-alpine sh /scripts/nginx-integration.sh
set -u
apk add --no-cache nodejs curl openssl >/dev/null 2>&1
PASS=0; FAIL=0
check() { # name, expected, actual
  if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "ok    $1 ($3)"; else FAIL=$((FAIL+1)); echo "FAIL  $1: expected $2, got $3"; fi
}

# ---- nginx with the deploy config + a self-signed cert --------------------
mkdir -p /etc/letsencrypt/live/usam.example /etc/nginx/snippets /var/www/certbot
openssl req -x509 -nodes -newkey rsa:2048 -days 1 -subj "/CN=usam.example" \
  -keyout /etc/letsencrypt/live/usam.example/privkey.pem \
  -out /etc/letsencrypt/live/usam.example/fullchain.pem >/dev/null 2>&1
cp /deploy/usam-proxy.conf /etc/nginx/snippets/usam-proxy.conf
cp /deploy/nginx.conf /etc/nginx/conf.d/usam.conf
rm -f /etc/nginx/conf.d/default.conf
nginx -t >/dev/null 2>&1 || { echo "nginx -t failed"; nginx -t; exit 1; }

# ---- the app, in production mode ------------------------------------------
cd /app
NODE_ENV=production DB_DIALECT=postgres PORT=3001 \
  APP_ORIGIN=https://usam.example FRONTEND_URL=https://usam.example COOKIE_SECURE=true \
  EMAIL_PROVIDER=smtp SMTP_HOST=127.0.0.1 SMTP_PORT=2525 WORKER_ENABLED=false \
  node server/index.js >/tmp/app.log 2>&1 &
for i in $(seq 1 40); do curl -fsS http://127.0.0.1:3001/api/v1/health >/dev/null 2>&1 && break; sleep 1; done
curl -fsS http://127.0.0.1:3001/api/v1/health >/dev/null 2>&1 || { echo "app failed to start"; cat /tmp/app.log; exit 1; }
nginx
sleep 1

H="usam.example"
S() { curl -sk --resolve "$H:443:127.0.0.1" --resolve "$H:80:127.0.0.1" "$@"; }

echo "--- TLS / redirects / headers ---"
check "HTTP redirects to HTTPS"            "301" "$(S -o /dev/null -w '%{http_code}' http://$H/)"
check "redirect target"                    "https://usam.example/x" "$(S -o /dev/null -w '%{redirect_url}' http://$H/x)"
check "HTTPS serves the SPA"               "200" "$(S -o /dev/null -w '%{http_code}' https://$H/)"
check "exactly one HSTS header"            "1" "$(S -I https://$H/ | grep -ci 'strict-transport-security')"
check "exactly one nosniff header"         "1" "$(S -I https://$H/ | grep -ci 'x-content-type-options')"
check "CSP header present (app's, proxied)" "1" "$(S -I https://$H/ | grep -ci 'content-security-policy')"
check "API health through nginx"           "200" "$(S -o /dev/null -w '%{http_code}' https://$H/api/v1/health)"
check "server version hidden"              "0" "$(S -I https://$H/ | grep -i '^server:' | grep -Eci '[0-9]\.[0-9]')"
check "dotfiles blocked (/.env)"           "404" "$(S -o /dev/null -w '%{http_code}' https://$H/.env)"
check "ACME path reachable over HTTP"      "404" "$(S -o /dev/null -w '%{http_code}' http://$H/.well-known/acme-challenge/x)"

echo "--- request body limits per location ---"
head -c 300000 /dev/zero | tr '\0' 'a' > /tmp/big300k.txt
check "300KB JSON to /contact -> 413 (nginx 256k cap)" "413" \
  "$(S -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data-binary @/tmp/big300k.txt https://$H/api/v1/contact)"
head -c 5000000 /dev/zero | tr '\0' 'a' > /tmp/big5m.txt
# The filler isn't valid JSON, so the APP answers 400 before auth. What matters
# is that Nginx did NOT reject it (413): the avatar location allows up to 15 MB.
AV="$(S -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data-binary @/tmp/big5m.txt https://$H/api/v1/users/me/avatar)"
[ "$AV" != "413" ] && check "5MB to avatar path is NOT blocked by nginx (app answered $AV)" "ok" "ok" || check "5MB to avatar path is NOT blocked by nginx" "not 413" "413"
head -c 20000000 /dev/zero | tr '\0' 'a' > /tmp/big20m.txt
check "20MB to avatar path -> 413 (nginx 15m cap)" "413" \
  "$(S -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' --data-binary @/tmp/big20m.txt https://$H/api/v1/users/me/avatar)"

echo "--- client IP / spoofing ---"
S -o /dev/null -H 'X-Forwarded-For: 6.6.6.6' -H 'X-Real-IP: 6.6.6.6' https://$H/api/v1/plans
sleep 1
LAST_IP="$(grep '"path":"/api/v1/plans"' /tmp/app.log | tail -1 | sed -n 's/.*"ip":"\([^"]*\)".*/\1/p')"
# The app must see the real peer (127.0.0.1 / ::1 in this container), NOT the spoofed value.
case "$LAST_IP" in 6.6.6.6) check "spoofed X-Forwarded-For ignored" "not 6.6.6.6" "6.6.6.6";; *) check "spoofed X-Forwarded-For ignored" "ok" "ok";; esac

echo "--- nginx rate limiting on credential endpoints ---"
CODES=""
for i in $(seq 1 40); do
  CODES="$CODES $(S -o /dev/null -w '%{http_code}' -X POST -H 'Content-Type: application/json' -d '{"email":"a@b.co","password":"x"}' https://$H/api/v1/auth/login)"
done
N429="$(echo $CODES | tr ' ' '\n' | grep -c '^429$')"
[ "$N429" -gt 0 ] && check "burst of 40 logins gets throttled (429s: $N429)" "ok" "ok" || check "burst of 40 logins gets throttled" ">0 429s" "0"

echo "--- secrets must not reach the access log ---"
S -o /dev/null "https://$H/verify-email?token=SECRETTOKEN0123456789abcdef"
S -o /dev/null "https://$H/reset-password?token=RESETSECRET9876543210fedcba"
S -o /dev/null "https://$H/api/v1/search?q=PRIVATEQUERY"
sleep 1
LOGHITS="$(cat /var/log/nginx/usam.access.log | grep -c 'SECRETTOKEN0123456789abcdef\|RESETSECRET9876543210fedcba\|PRIVATEQUERY' || true)"
check "no tokens/queries in nginx access log" "0" "$LOGHITS"
check "access log still records the path" "1" "$(grep -c '/verify-email' /var/log/nginx/usam.access.log | awk '{print ($1>0)?1:0}')"

echo "--- request id correlation ---"
RID="$(S -I https://$H/api/v1/plans | grep -i '^x-request-id' | tr -d '\r' | awk '{print $2}')"
[ -n "$RID" ] && check "X-Request-Id returned" "ok" "ok" || check "X-Request-Id returned" "ok" "missing"

echo "== RESULT: $PASS passed, $FAIL failed =="
kill %1 2>/dev/null
[ "$FAIL" -eq 0 ]
