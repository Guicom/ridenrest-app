#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

BROUTER_CONTAINER="${BROUTER_CONTAINER:-ridenrest-brouter}"
SEGMENTS_URL="https://brouter.de/brouter/segments4"
SEGMENTS_DIR="/segments4"

LONS=(-15 -10 -5 0 5 10 15 20 25 30 35 40)
LATS=(35 40 45 50 55 60 65 70)

DOWNLOADED=0
SKIPPED=0
FAILED=0
TOTAL_BYTES=0
START_TIME=$(date +%s)

if ! docker inspect "$BROUTER_CONTAINER" >/dev/null 2>&1; then
  echo "ERROR: container $BROUTER_CONTAINER not found. Run: docker compose up -d brouter"
  exit 1
fi

TMPDIR=$(mktemp -d)
trap 'rm -rf "$TMPDIR"' EXIT

echo "==> Downloading BRouter Europe segments into container $BROUTER_CONTAINER"
echo "    Grid: lon ${LONS[0]}..${LONS[-1]}, lat ${LATS[0]}..${LATS[-1]}"
echo ""

for LON in "${LONS[@]}"; do
  for LAT in "${LATS[@]}"; do
    if [ "$LON" -lt 0 ]; then
      TILE="W$(( -LON ))_N${LAT}.rd5"
    else
      TILE="E${LON}_N${LAT}.rd5"
    fi

    EXISTS=$(docker exec "$BROUTER_CONTAINER" sh -c "[ -f ${SEGMENTS_DIR}/${TILE} ] && echo yes || echo no")
    if [ "$EXISTS" = "yes" ]; then
      SKIPPED=$((SKIPPED + 1))
      continue
    fi

    TMPFILE="$TMPDIR/$TILE"
    if curl -fsSL --connect-timeout 10 --max-time 300 -o "$TMPFILE" "${SEGMENTS_URL}/${TILE}" 2>/dev/null; then
      FILE_SIZE=$(stat -f%z "$TMPFILE" 2>/dev/null || stat -c%s "$TMPFILE" 2>/dev/null || echo 0)
      docker cp "$TMPFILE" "${BROUTER_CONTAINER}:${SEGMENTS_DIR}/${TILE}"
      rm -f "$TMPFILE"
      TOTAL_BYTES=$((TOTAL_BYTES + FILE_SIZE))
      DOWNLOADED=$((DOWNLOADED + 1))
      SIZE_MB=$(echo "scale=1; $FILE_SIZE / 1048576" | bc 2>/dev/null || echo "?")
      echo "  ${TILE}  ${SIZE_MB} MB"
    else
      FAILED=$((FAILED + 1))
    fi
  done
done

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
TOTAL_MB=$(echo "scale=1; $TOTAL_BYTES / 1048576" | bc 2>/dev/null || echo "?")
EXISTING=$(docker exec "$BROUTER_CONTAINER" sh -c "ls ${SEGMENTS_DIR}/*.rd5 2>/dev/null | wc -l")

echo ""
echo "==> Done in ${DURATION}s"
echo "    Downloaded: ${DOWNLOADED} files (${TOTAL_MB} MB)"
echo "    Skipped (already present): ${SKIPPED}"
echo "    Not found on server (ocean tiles): ${FAILED}"
echo "    Total segments in volume: ${EXISTING} files"
