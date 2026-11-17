#!/usr/bin/env bash
# Runs every minute (usam-health.timer). Probes the app; on repeated failure it
# restarts the service once and logs a JSON line that a CloudWatch metric filter
# turns into an alarm (see cloudwatch-agent.json / the deployment guide).
set -uo pipefail

URL="${HEALTH_URL:-http://127.0.0.1:3001/api/v1/health}"
STATE=/run/usam-health.fails

if curl -fsS --max-time 5 "$URL" | grep -q '"status":"ok"'; then
  rm -f "$STATE"
  exit 0
fi

fails=$(( $(cat "$STATE" 2>/dev/null || echo 0) + 1 ))
echo "$fails" > "$STATE"
logger -t usam-health -p user.err "{\"level\":\"error\",\"msg\":\"health.failed\",\"consecutiveFailures\":$fails}"

# 3 consecutive failures (~3 min) -> one restart attempt, then keep alarming.
if [ "$fails" -eq 3 ]; then
  logger -t usam-health -p user.err '{"level":"error","msg":"health.restarting_service"}'
  systemctl restart usam-communities
fi
exit 1
