#!/usr/bin/env bash
# dev-setup.sh — Reproducible local dev environment bootstrap
# Usage: bash scripts/dev-setup.sh
# Requires: docker, pnpm

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$ROOT_DIR"

echo "==> Checking prerequisites..."
command -v docker >/dev/null 2>&1 || { echo "ERROR: docker not found. Install Docker Desktop or Docker Engine."; exit 1; }
command -v pnpm >/dev/null 2>&1 || { echo "ERROR: pnpm not found. Run: npm install -g pnpm"; exit 1; }

# Step 1: Copy .env.example to .env if .env doesn't exist
if [ ! -f .env ]; then
  echo "==> Creating .env from .env.example..."
  cp .env.example .env
  echo "    .env created. Edit if you need non-default credentials."
else
  echo "==> .env already exists, skipping copy."
fi

# Load .env into shell so POSTGRES_USER/POSTGRES_DB are available for healthcheck and scripts
# shellcheck disable=SC2046
export $(grep -v '^#' .env | grep -v '^$' | xargs)

# Create packages/database/.env if it doesn't exist (required by drizzle-kit migrate)
if [ ! -f packages/database/.env ]; then
  echo "==> Creating packages/database/.env for drizzle-kit..."
  echo "DATABASE_URL=postgresql://${POSTGRES_USER:-ridenrest}:${POSTGRES_PASSWORD:-ridenrest}@localhost:5432/${POSTGRES_DB:-ridenrest}" > packages/database/.env
  echo "    packages/database/.env created."
else
  echo "==> packages/database/.env already exists, skipping."
fi

# Step 2: Start infrastructure services
echo "==> Starting Docker services (db, redis)..."
docker compose up -d db redis

# Step 3: Wait for PostgreSQL to be healthy
echo "==> Waiting for PostgreSQL to be healthy..."
RETRIES=30
until docker compose exec db pg_isready -U "${POSTGRES_USER:-ridenrest}" -d "${POSTGRES_DB:-ridenrest}" >/dev/null 2>&1; do
  RETRIES=$((RETRIES - 1))
  if [ $RETRIES -eq 0 ]; then
    echo "ERROR: PostgreSQL did not become healthy in time."
    docker compose logs db
    exit 1
  fi
  echo "    Waiting... ($RETRIES retries left)"
  sleep 2
done
echo "    PostgreSQL is healthy."

# Step 4: Run Drizzle migrations
echo "==> Running Drizzle migrations..."
pnpm --filter @ridenrest/database exec drizzle-kit migrate

# Step 5: Verify PostGIS extension
echo "==> Verifying PostGIS..."
POSTGIS_VERSION=$(docker compose exec db psql -U "${POSTGRES_USER:-ridenrest}" -d "${POSTGRES_DB:-ridenrest}" -t -c "SELECT PostGIS_version();" 2>/dev/null | xargs)
if [ -z "$POSTGIS_VERSION" ]; then
  echo "WARNING: PostGIS not detected. Run manually if needed:"
  echo "  docker compose exec db psql -U ridenrest -d ridenrest -c \"CREATE EXTENSION IF NOT EXISTS postgis;\""
else
  echo "    PostGIS: $POSTGIS_VERSION"
fi

echo ""
echo "✅ Dev environment ready!"
echo ""
echo "   Start the full stack:"
echo "   turbo dev"
echo ""
echo "   Next.js: http://localhost:3011"
echo "   NestJS:  http://localhost:3010"
echo "   Health:  curl http://localhost:3010/health"
