#!/usr/bin/env bash
set -euo pipefail

# brouter-benchmark-prod.sh — Formal NFR latency benchmark for BRouter (story poi-access-1.5).
#
# Runs 30+ routing requests representative of the POI-access workload: SHORT routes
# (~0.5-3 km, i.e. a POI->trace access, per architecture assumption "~200 ms/POI" and
# the ACCESS_EAGER_THRESHOLD_M=1500m corridor), real BRouter profiles available in the
# v1.7.9 image (trekking/fastbike/gravel — note: there is NO "safety" profile), across
# diverse Western & Central European cities (so cold-tile-load variance is exercised).
# Computes p50/p95/p99 latency. Run it twice back-to-back: run 1 = cold tiles, run 2 =
# warm steady-state (the number that maps to user-facing prod latency).
#
# Usage:
#   ./scripts/brouter-benchmark-prod.sh [BASE_URL] > /tmp/bench-$(date +%F)-run1.csv
#
# Output:
#   - CSV  (route,profile,distance_km,duration_ms,status)  -> stdout  (redirect to a file)
#   - Human-readable progress + percentile summary         -> stderr  (stays on terminal)
#
# NFR-PA-002 verdict (overridable via env):
#   p95 < 500 ms (P95_TARGET_MS), p50 < 200 ms (P50_TARGET_MS), no request > 5000 ms (TIMEOUT_MS).
#   Exit code 0 if PASS, 1 if FAIL or no successful requests.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

for cmd in jq python3 sort awk; do
  command -v "$cmd" >/dev/null 2>&1 || { echo "ERROR: $cmd is required but not installed" >&2; exit 1; }
done

if [ -f "$ROOT_DIR/apps/api/.env" ]; then
  BROUTER_BASE_URL=$(grep -E '^BROUTER_BASE_URL=' "$ROOT_DIR/apps/api/.env" 2>/dev/null | cut -d= -f2- | tr -d '"'"'" || true)
fi
BASE_URL="${1:-${BROUTER_BASE_URL:-http://localhost:17777}}"

P95_TARGET_MS="${P95_TARGET_MS:-500}"
P50_TARGET_MS="${P50_TARGET_MS:-200}"
TIMEOUT_MS="${TIMEOUT_MS:-5000}"

millis() { python3 -c 'import time; print(int(time.time()*1000))'; }

# name|from(lon,lat)|to(lon,lat)|profile
# 36 SHORT POI-access-style routes (~0.5-3 km), 18 cities x 2, profiles trekking/fastbike/gravel (12 each).
ROUTES=(
  "Paris-a|2.3488,48.8534|2.3488,48.8624|trekking"
  "Paris-b|2.3488,48.8534|2.3700,48.8714|fastbike"
  "Lyon-a|4.8357,45.7640|4.8357,45.7730|gravel"
  "Lyon-b|4.8357,45.7640|4.8557,45.7460|trekking"
  "Bordeaux-a|-0.5792,44.8378|-0.5792,44.8468|fastbike"
  "Bordeaux-b|-0.5792,44.8378|-0.5592,44.8558|gravel"
  "Amsterdam-a|4.9041,52.3676|4.9041,52.3766|trekking"
  "Amsterdam-b|4.9041,52.3676|4.9241,52.3856|fastbike"
  "Berlin-a|13.4050,52.5200|13.4050,52.5290|gravel"
  "Berlin-b|13.4050,52.5200|13.4350,52.5380|trekking"
  "Munich-a|11.5820,48.1351|11.5820,48.1441|fastbike"
  "Munich-b|11.5820,48.1351|11.6020,48.1531|gravel"
  "Brussels-a|4.3517,50.8503|4.3517,50.8593|trekking"
  "Brussels-b|4.3517,50.8503|4.3717,50.8683|fastbike"
  "Cologne-a|6.9603,50.9375|6.9603,50.9465|gravel"
  "Cologne-b|6.9603,50.9375|6.9803,50.9555|trekking"
  "Prague-a|14.4378,50.0755|14.4378,50.0845|fastbike"
  "Prague-b|14.4378,50.0755|14.4578,50.0935|gravel"
  "Vienna-a|16.3738,48.2082|16.3738,48.2172|trekking"
  "Vienna-b|16.3738,48.2082|16.3938,48.2262|fastbike"
  "Warsaw-a|21.0122,52.2297|21.0122,52.2387|gravel"
  "Warsaw-b|21.0122,52.2297|21.0322,52.2477|trekking"
  "Milan-a|9.1900,45.4642|9.1900,45.4732|fastbike"
  "Milan-b|9.1900,45.4642|9.2100,45.4822|gravel"
  "Zurich-a|8.5417,47.3769|8.5417,47.3859|trekking"
  "Zurich-b|8.5417,47.3769|8.5617,47.3949|fastbike"
  "Barcelona-a|2.1734,41.3851|2.1734,41.3941|gravel"
  "Barcelona-b|2.1734,41.3851|2.1934,41.4031|trekking"
  "Hamburg-a|9.9937,53.5511|9.9937,53.5601|fastbike"
  "Hamburg-b|9.9937,53.5511|10.0137,53.5691|gravel"
  "Lille-a|3.0573,50.6292|3.0573,50.6382|trekking"
  "Lille-b|3.0573,50.6292|3.0773,50.6472|fastbike"
  "Krakow-a|19.9450,50.0647|19.9450,50.0737|gravel"
  "Krakow-b|19.9450,50.0647|19.9650,50.0827|trekking"
  "Budapest-a|19.0402,47.4979|19.0402,47.5069|fastbike"
  "Budapest-b|19.0402,47.4979|19.0602,47.5159|gravel"
)

echo "==> BRouter NFR benchmark — ${#ROUTES[@]} requests" >&2
echo "    URL: ${BASE_URL}" >&2
echo "    Targets: p50 < ${P50_TARGET_MS}ms, p95 < ${P95_TARGET_MS}ms, no req > ${TIMEOUT_MS}ms" >&2
echo "" >&2

# CSV header -> stdout
echo "route,profile,distance_km,duration_ms,status"

DURATIONS=()
PASS=0
FAIL=0
OVER_TIMEOUT=0

for R in "${ROUTES[@]}"; do
  NAME="${R%%|*}"; rest="${R#*|}"
  FROM="${rest%%|*}"; rest="${rest#*|}"
  TO="${rest%%|*}"; PROFILE="${rest##*|}"

  START=$(millis)
  RESP=$(curl -sS --connect-timeout 5 --max-time 30 \
    "${BASE_URL}/brouter?lonlats=${FROM}|${TO}&profile=${PROFILE}&alternativeidx=0&format=geojson" 2>/dev/null || true)
  END=$(millis)
  DUR=$((END - START))

  if echo "$RESP" | jq -e '.features[0].geometry.type == "LineString"' >/dev/null 2>&1; then
    LEN=$(echo "$RESP" | jq -r '.features[0].properties["track-length"] // "0"' 2>/dev/null)
    KM=$(awk -v l="${LEN:-0}" 'BEGIN { printf "%.1f", l / 1000 }')
    STATUS=ok
    DURATIONS+=("$DUR")
    PASS=$((PASS + 1))
    if [ "$DUR" -gt "$TIMEOUT_MS" ]; then OVER_TIMEOUT=$((OVER_TIMEOUT + 1)); fi
  else
    KM="0.0"
    STATUS=fail
    FAIL=$((FAIL + 1))
  fi

  echo "${NAME},${PROFILE},${KM},${DUR},${STATUS}"
  printf '  %-26s %-9s %6sms  %6skm  %s\n' "$NAME" "$PROFILE" "$DUR" "$KM" "$STATUS" >&2
done

N=${#DURATIONS[@]}
if [ "$N" -eq 0 ]; then
  echo "" >&2
  echo "ERROR: 0 successful requests — cannot compute percentiles. Check BRouter / segments." >&2
  exit 1
fi

SORTED=$(printf '%s\n' "${DURATIONS[@]}" | sort -n)
pct() { # $1 = percentile (nearest-rank, ceil)
  echo "$SORTED" | awk -v p="$1" -v n="$N" 'BEGIN { r = int((p * n + 99) / 100); if (r < 1) r = 1; if (r > n) r = n } NR == r { print; exit }'
}
P50=$(pct 50)
P95=$(pct 95)
P99=$(pct 99)
MIN=$(echo "$SORTED" | head -1)
MAX=$(echo "$SORTED" | tail -1)
AVG=$(printf '%s\n' "${DURATIONS[@]}" | awk '{ s += $1 } END { printf "%d", s / NR }')

VERDICT=PASS
if [ "$P95" -ge "$P95_TARGET_MS" ]; then VERDICT=FAIL; fi
if [ "$P50" -ge "$P50_TARGET_MS" ]; then VERDICT=FAIL; fi
if [ "$OVER_TIMEOUT" -gt 0 ]; then VERDICT=FAIL; fi

{
  echo ""
  echo "==> Results (${PASS} ok / ${FAIL} fail / ${#ROUTES[@]} total)"
  echo "    min=${MIN}ms  p50=${P50}ms  avg=${AVG}ms  p95=${P95}ms  p99=${P99}ms  max=${MAX}ms"
  echo "    requests > ${TIMEOUT_MS}ms : ${OVER_TIMEOUT}"
  echo "    NFR-PA-002 verdict: ${VERDICT}  (p50<${P50_TARGET_MS} & p95<${P95_TARGET_MS} & no req>${TIMEOUT_MS}ms)"
} >&2

[ "$VERDICT" = "PASS" ] && exit 0 || exit 1
