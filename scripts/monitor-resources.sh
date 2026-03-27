#!/usr/bin/env bash
# VPS resource monitor — posts to Uptime Kuma Push monitor
# Configured push URL stored in /home/deploy/ridenrest-app/.uptime-push-url
# Runs via cron every 5 minutes: */5 * * * * /home/deploy/ridenrest-app/scripts/monitor-resources.sh

set -e

APP_DIR="/home/deploy/ridenrest-app"
PUSH_URL_FILE="$APP_DIR/.uptime-push-url"

if [[ ! -f "$PUSH_URL_FILE" ]]; then
  echo "ERROR: Push URL file not found at $PUSH_URL_FILE" >&2
  exit 1
fi

PUSH_URL="$(cat "$PUSH_URL_FILE" | tr -d '\n')"

DISK_USAGE=$(df / | awk 'NR==2 {print $5}' | tr -d '%')
MEM_USAGE=$(free | awk '/^Mem:/ {printf "%.0f", $3/$2 * 100}')

MSG="Disk:${DISK_USAGE}pct+RAM:${MEM_USAGE}pct"

if [ "$DISK_USAGE" -ge 80 ] || [ "$MEM_USAGE" -ge 90 ]; then
  curl -sf "${PUSH_URL}?status=down&msg=${MSG}&ping=" > /dev/null \
    || echo "[$(date -u +%FT%TZ)] ERROR — curl failed (push URL unreachable)" >> /var/log/ridenrest-monitor.log
  echo "[$(date -u +%FT%TZ)] ALERT — $MSG" >> /var/log/ridenrest-monitor.log
else
  curl -sf "${PUSH_URL}?status=up&msg=${MSG}&ping=" > /dev/null \
    || echo "[$(date -u +%FT%TZ)] ERROR — curl failed (push URL unreachable)" >> /var/log/ridenrest-monitor.log
fi
