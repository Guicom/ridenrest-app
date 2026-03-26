#!/usr/bin/env bash
set -e

# ── Configuration ─────────────────────────────────────────────────────────────
APP_DIR="/home/deploy/ridenrest-app"
BACKUP_DIR="/opt/ridenrest/backups"
RETENTION_DAYS=14

# PostgreSQL credentials (from .env at APP_DIR root)
# Note: container must have container_name: ridenrest-db in docker-compose.yml
CONTAINER="ridenrest-db"
PG_USER="${POSTGRES_USER:-ridenrest}"
PG_DB="${POSTGRES_DB:-ridenrest}"

# Optional rclone config — uncomment and fill if external backup is desired
# RCLONE_REMOTE="b2"           # or "r2" — configured via `rclone config`
# RCLONE_BUCKET="ridenrest-backups"

# ── Logging helper (dynamic timestamp per call) ────────────────────────────────
log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] [backup] $*"; }

# ── Generate filename ──────────────────────────────────────────────────────────
TIMESTAMP=$(date '+%Y-%m-%d_%H-%M')
BACKUP_FILE="${BACKUP_DIR}/ridenrest_${TIMESTAMP}.dump"

# ── Error trap: log failure and remove partial dump file ───────────────────────
cleanup_on_error() {
  log "ERROR: backup failed — removing partial file if exists"
  rm -f "${BACKUP_FILE}"
}
trap cleanup_on_error ERR

# ── Ensure backup directory exists ────────────────────────────────────────────
mkdir -p "${BACKUP_DIR}"

# ── Backup ─────────────────────────────────────────────────────────────────────
log "Starting backup → ${BACKUP_FILE}"

# Load .env vars (for POSTGRES_USER, POSTGRES_DB if not in environment)
if [ -f "${APP_DIR}/.env" ]; then
  set -a
  # shellcheck disable=SC1091
  source "${APP_DIR}/.env"
  set +a
fi

# Re-apply after sourcing .env
PG_USER="${POSTGRES_USER:-ridenrest}"
PG_DB="${POSTGRES_DB:-ridenrest}"

docker exec "${CONTAINER}" pg_dump \
  --format=custom \
  --no-acl \
  --no-owner \
  -U "${PG_USER}" \
  "${PG_DB}" \
  > "${BACKUP_FILE}"

log "Backup created: $(du -sh "${BACKUP_FILE}" | cut -f1)"

# ── Retention cleanup ──────────────────────────────────────────────────────────
log "Cleaning up backups older than ${RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -name "*.dump" -mtime "+${RETENTION_DAYS}" -delete
REMAINING=$(find "${BACKUP_DIR}" -name "*.dump" | wc -l | tr -d ' ')
log "Retention done — ${REMAINING} backup(s) kept"

# ── Optional: rclone external backup ──────────────────────────────────────────
# Uncomment to enable external backup to Backblaze B2 or Cloudflare R2
#
# if command -v rclone &> /dev/null; then
#   [[ -z "${RCLONE_REMOTE}" ]] && log "ERROR: RCLONE_REMOTE not set" && exit 1
#   [[ -z "${RCLONE_BUCKET}" ]] && log "ERROR: RCLONE_BUCKET not set" && exit 1
#   log "Uploading to ${RCLONE_REMOTE}:${RCLONE_BUCKET}..."
#   rclone copy "${BACKUP_DIR}/" "${RCLONE_REMOTE}:${RCLONE_BUCKET}/backups/" \
#     --include "*.dump" \
#     --transfers 1 \
#     --quiet
#   log "rclone upload complete"
# else
#   log "rclone not installed — skipping external backup"
# fi

log "Done ✓"
