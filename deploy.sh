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

echo "==> [1/6] git pull"
git pull origin main

echo "==> [2/6] pnpm install"
pnpm install --frozen-lockfile

echo "==> [3/6] turbo build"
set -a
# shellcheck source=.env
source "$APP_DIR/.env" 2>/dev/null || true
set +a
pnpm turbo build

echo "==> [4/6] Copy Next.js standalone static assets"
rm -rf apps/web/.next/standalone/apps/web/public
rm -rf apps/web/.next/standalone/apps/web/.next/static
cp -r apps/web/public apps/web/.next/standalone/apps/web/public
cp -r apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static

echo "==> [5/6] DB migrations (drizzle-kit)"
( cd packages/database && pnpm drizzle-kit migrate )

echo "==> [6/6] PM2 reload (zero-downtime)"
pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js

echo "==> Deploy done. pm2 status:"
pm2 status
