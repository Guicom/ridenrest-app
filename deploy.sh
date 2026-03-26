#!/usr/bin/env bash
set -e

APP_DIR="/home/deploy/ridenrest-app"
cd "$APP_DIR"

# Load environment variables
set -a
# shellcheck source=.env
source "$APP_DIR/.env"
set +a

echo "==> [1/6] git pull"
git pull origin main

echo "==> [2/6] pnpm install"
pnpm install --frozen-lockfile

echo "==> [3/6] turbo build"
pnpm turbo build

echo "==> [4/6] Copy Next.js standalone static assets"
cp -rf apps/web/public apps/web/.next/standalone/apps/web/public
cp -rf apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static

echo "==> [5/6] DB migrations (drizzle-kit)"
( cd packages/database && pnpm drizzle-kit migrate )

echo "==> [6/6] PM2 reload (zero-downtime)"
pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js

echo "==> Deploy done. pm2 status:"
pm2 status
