#!/usr/bin/env bash
set -e

APP_DIR="/home/deploy/ridenrest-app"
cd "$APP_DIR"

echo "==> [1/5] git pull"
git pull origin main

echo "==> [2/5] pnpm install"
pnpm install --frozen-lockfile

echo "==> [3/5] turbo build"
pnpm turbo build

echo "==> [4/5] Copy Next.js standalone static assets"
cp -rf apps/web/public apps/web/.next/standalone/apps/web/public
cp -rf apps/web/.next/static apps/web/.next/standalone/apps/web/.next/static

echo "==> [5/5] PM2 reload (zero-downtime)"
pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js

echo "==> Deploy done. pm2 status:"
pm2 status
