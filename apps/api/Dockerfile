# Multi-stage build: Turborepo prune → pnpm install → nest build (webpack) → minimal runner
# Context: run from repository ROOT (not apps/api/)
# Build command: docker build -f apps/api/Dockerfile -t ridenrest-api .

# ──────────────────────────────────────────
# Stage 1: base — Node.js + package managers
# ──────────────────────────────────────────
FROM node:22-alpine AS base
# RUN npm install -g pnpm@10.32.1 turbo@2.6.1
RUN npm install -g pnpm@10.32.1 turbo@2.3.3

# ──────────────────────────────────────────
# Stage 2: pruner — extract only API + its deps
# ──────────────────────────────────────────
FROM base AS pruner
WORKDIR /app
COPY . .
# turbo prune creates:
#   out/json/  — package.json files only (for layer-cached install)
#   out/full/  — full source of @ridenrest/api + its workspace deps
RUN turbo prune @ridenrest/api --docker

# ──────────────────────────────────────────
# Stage 3: installer — install dependencies
# ──────────────────────────────────────────
FROM base AS installer
WORKDIR /app
# Copy pruned package.json files + lockfile (cached layer if unchanged)
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
# --no-frozen-lockfile: turbo prune generates an incomplete lockfile for peer deps
# (known issue with pnpm v9+ and turbo prune). Resolution is still deterministic
# because the pruned package.json files pin exact versions.
RUN pnpm install --no-frozen-lockfile

# ──────────────────────────────────────────
# Stage 4: builder — compile NestJS with webpack
# ──────────────────────────────────────────
FROM installer AS builder
WORKDIR /app
# Copy full pruned source (workspace packages + apps/api/src/)
COPY --from=pruner /app/out/full/ .
# webpack: true in nest-cli.json → bundles workspace deps into dist/main.js
RUN pnpm --filter @ridenrest/api run build

# ──────────────────────────────────────────
# Stage 5: runner — minimal production image
# ──────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

# Non-root user (security best practice)
RUN addgroup -S nodejs -g 1001 && adduser -S nestjs -u 1001

# Only copy the bundled dist — no node_modules needed (webpack bundled everything)
COPY --from=builder --chown=nestjs:nodejs /app/apps/api/dist ./dist

# GPX file storage mount point
RUN mkdir -p /data/gpx && chown nestjs:nodejs /data/gpx

USER nestjs
EXPOSE 3010

CMD ["node", "dist/main.js"]
