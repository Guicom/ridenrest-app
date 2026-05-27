#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

for cmd in jq python3; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: $cmd is required but not installed"; exit 1; }
done

if [ -f "$ROOT_DIR/apps/api/.env" ]; then
  BROUTER_BASE_URL=$(grep -E '^BROUTER_BASE_URL=' "$ROOT_DIR/apps/api/.env" 2>/dev/null | cut -d= -f2- | tr -d '"'"'" || true)
fi
BASE_URL="${1:-${BROUTER_BASE_URL:-http://localhost:17777}}"
PROFILE="${PROFILE:-trekking}"

millis() { python3 -c 'import time; print(int(time.time()*1000))'; }

ROUTES=(
  "Paris>Versailles|2.3488,48.8534|2.1301,48.8014"
  "Lyon>Vienne|4.8357,45.7640|4.8743,45.5235"
  "Bordeaux>Arcachon|-0.5792,44.8378|-1.1797,44.6584"
  "Berlin>Potsdam|13.4050,52.5200|13.0635,52.3906"
  "Amsterdam>Utrecht|4.9041,52.3676|5.1214,52.0907"
)

EXIT_CODE=0
TOTAL_MS=0
PASSED=0

echo "==> BRouter smoke test (profile: ${PROFILE})"
echo "    URL: ${BASE_URL}"
echo ""

for ROUTE in "${ROUTES[@]}"; do
  NAME=$(echo "$ROUTE" | cut -d'|' -f1)
  FROM=$(echo "$ROUTE" | cut -d'|' -f2)
  TO=$(echo "$ROUTE" | cut -d'|' -f3)

  START=$(millis)
  CURL_ERR=$(mktemp)
  RESPONSE=$(curl -sS --connect-timeout 5 --max-time 30 \
    "${BASE_URL}/brouter?lonlats=${FROM}|${TO}&profile=${PROFILE}&alternativeidx=0&format=geojson" 2>"$CURL_ERR") || true
  END=$(millis)
  DURATION=$((END - START))

  if echo "$RESPONSE" | jq -e '.features[0].geometry.type == "LineString"' >/dev/null 2>&1; then
    TRACK_LEN=$(echo "$RESPONSE" | jq -r '.features[0].properties["track-length"]' 2>/dev/null || echo "?")
    TRACK_KM=$(echo "scale=1; ${TRACK_LEN:-0} / 1000" | bc 2>/dev/null || echo "?")
    echo "  OK  ${NAME}  ${DURATION}ms  ${TRACK_KM}km"
    TOTAL_MS=$((TOTAL_MS + DURATION))
    PASSED=$((PASSED + 1))
  else
    echo "  FAIL  ${NAME}  ${DURATION}ms"
    [ -s "$CURL_ERR" ] && cat "$CURL_ERR" || echo "$RESPONSE" | head -3
    EXIT_CODE=1
  fi
  rm -f "$CURL_ERR"
done

if [ "$PASSED" -gt 0 ]; then
  AVG_MS=$((TOTAL_MS / PASSED))
  echo ""
  echo "==> ${PASSED}/${#ROUTES[@]} passed, avg latency: ${AVG_MS}ms"
fi

exit $EXIT_CODE
