#!/usr/bin/env bash
set -e

APP_DIR="/home/deploy/ridenrest-app"
cd "$APP_DIR"

# Load DATABASE_URL from .env (explicit — avoids quoting/CRLF issues with source)
export DATABASE_URL
DATABASE_URL="$(grep '^DATABASE_URL=' "$APP_DIR/.env" | cut -d'=' -f2- | tr -d '\r' | sed "s/^['\"]//;s/['\"]$//")"
if [[ -z "$DATABASE_URL" ]]; then
  echo "ERROR: DATABASE_URL not found in $APP_DIR/.env" >&2
  exit 1
fi

mkdir -p /data/gpx

echo "==> [1/7] git pull"
git pull origin main

echo "==> [2/7] pnpm install"
pnpm install --frozen-lockfile

echo "==> [3/7] turbo build"
set -a
# shellcheck source=.env
source "$APP_DIR/.env" 2>/dev/null || true
set +a
if [[ -z "$NEXT_PUBLIC_API_URL" ]]; then
  echo "WARNING: NEXT_PUBLIC_API_URL not found in $APP_DIR/.env — Next.js will embed empty API URL" >&2
fi
pnpm turbo build

# ─── BRouter (POI Access Routing) — start + health-gate ─────────────────────
# Image is BUILT FROM SOURCE (abrensch/brouter#v1.7.9 in docker-compose.yml), NOT
# pulled from a registry — there is no published nrenner/brouter:1.7.9 (story
# poi-access-1.1). `up -d` reuses the existing image, and auto-builds from source
# only if the image is absent or its tag changed. The health-gate blocks the rest
# of the deploy (migrations, pm2 reload) until BRouter is healthy, so the API never
# reloads ahead of its routing dependency.
echo "==> [4/7] BRouter start + health-gate"
docker compose up -d brouter
if ! timeout 300 sh -c 'until docker inspect --format="{{.State.Health.Status}}" ridenrest-brouter | grep -q healthy; do sleep 5; done'; then
  echo "ERROR: BRouter failed to become healthy within 5 min" >&2
  exit 1
fi
echo "    BRouter healthy"

echo "==> [5/7] Copy Next.js standalone static assets"
rm -rf apps/web/.next/standalone/apps/web/public
rm -rf apps/web/.next/standalone/apps/web/.next/static
cp -r apps/web/public apps/web/.next/standalone/apps/web/public
cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static

echo "==> [6/7] DB migrations (drizzle-kit)"
( cd packages/database && pnpm drizzle-kit migrate )

echo "==> [7/7] PM2 reload (zero-downtime)"
pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js

echo "==> Deploy done. pm2 status:"
pm2 status

echo "==> Health check (port availability)"
sleep 3
nc -z localhost 3010 && echo "OK  ridenrest-api  :3010" || echo "WARN ridenrest-api :3010 not responding"
nc -z localhost 3011 && echo "OK  ridenrest-web  :3011" || echo "WARN ridenrest-web :3011 not responding"
