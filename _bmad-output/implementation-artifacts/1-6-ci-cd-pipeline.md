# Story 1.6: CI/CD Pipeline

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer**,
I want GitHub Actions configured to lint, build, and deploy both apps automatically,
So that every push to main is validated and deployed without manual steps.

## Acceptance Criteria

1. **Given** a commit is pushed to the `main` branch,
   **When** the CI pipeline triggers,
   **Then** `turbo lint` and `turbo build` complete successfully using Turborepo's build cache.

2. **Given** the build succeeds,
   **When** Vercel receives the Next.js build output,
   **Then** the web app is deployed and the landing page returns HTTP 200.

3. **Given** the build succeeds,
   **When** Fly.io receives the NestJS Docker build,
   **Then** the API is deployed and `GET /health` returns HTTP 200.

4. **Given** secrets are stored as GitHub Secrets (`DATABASE_URL`, `FLY_API_TOKEN`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`),
   **When** the pipeline runs,
   **Then** no secret values appear in pipeline logs.

## Tasks / Subtasks

- [x] Task 1 — Add webpack bundling to NestJS build (prerequisite for Docker) (AC: #3)
  - [x] 1.1 Update `apps/api/nest-cli.json` — add `"webpack": true` in `compilerOptions` (see Dev Notes — CRITICAL, prevents workspace dep resolution failure at runtime)
  - [x] 1.2 Verify `pnpm --filter @ridenrest/api run build` still succeeds after change
  - [x] 1.3 Verify `node dist/main.js` starts without "Cannot find module '@ridenrest/database'" error

- [x] Task 2 — Create Dockerfile for NestJS API (AC: #3)
  - [x] 2.1 Create `apps/api/Dockerfile` — multi-stage: base → pruner → installer → builder → runner (see Dev Notes for full content)
  - [x] 2.2 Create `.dockerignore` at repo root (see Dev Notes)
  - [x] 2.3 Local smoke test: `docker build -f apps/api/Dockerfile -t ridenrest-api . && docker run -e DATABASE_URL=... -e PORT=3010 -p 3010:3010 ridenrest-api` → verify container starts

- [x] Task 3 — Create GitHub Actions workflow (AC: #1, #2, #3, #4)
  - [x] 3.1 Create `.github/workflows/ci.yml` — two jobs: `ci` (lint + build + test) and `deploy` (migrate + vercel + fly) — see Dev Notes for full workflow
  - [x] 3.2 Ensure `deploy` job has `needs: ci` and `if: github.ref == 'refs/heads/main' && github.event_name == 'push'` — PRs only run CI, never deploy

- [x] Task 4 — One-time setup: Vercel (AC: #2)
  - [x] 4.1 Run `vercel link` in `apps/web/` — links local project to Vercel (creates `.vercel/project.json`)
  - [x] 4.2 Note `VERCEL_ORG_ID` and `VERCEL_PROJECT_ID` from `.vercel/project.json` (do NOT commit this file)
  - [x] 4.3 Add to `.gitignore`: `.vercel/`
  - [x] 4.4 In Vercel dashboard → project settings → General: set Root Directory to `apps/web`; Framework Preset: Next.js; Build Command: override to `cd ../.. && pnpm turbo run build --filter=@ridenrest/web`
  - [x] 4.5 In Vercel dashboard → Environment Variables: add `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_BETTER_AUTH_URL` for Production environment

- [x] Task 5 — One-time setup: Fly.io (AC: #3)
  - [x] 5.1 Verify Fly.io app exists: `fly apps list` → shows `ridenrest-api`
  - [x] 5.2 Set Fly.io secrets: `DATABASE_URL`, `UPSTASH_REDIS_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
  - [x] 5.3 Volume created: `ridenrest_gpx_data` (3GB, region cdg)
  - [x] 5.4 `FLY_API_TOKEN` generated and added as GitHub Secret

- [x] Task 6 — Configure GitHub Secrets (AC: #4)
  - [x] 6.1 GitHub Secrets configured: `DATABASE_URL`, `FLY_API_TOKEN`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`
  - [x] 6.2 Secrets only used via `${{ secrets.XYZ }}` syntax — never echoed in logs

- [x] Task 7 — Add health endpoint to NestJS (AC: #3)
  - [x] 7.1 Create `apps/api/src/health/health.controller.ts` — `GET /health` returns `{ status: 'ok', version: process.env.npm_package_version }` (see Dev Notes)
  - [x] 7.2 Register `HealthModule` in `AppModule`
  - [x] 7.3 Exclude `/health` from `JwtAuthGuard` (it's a public endpoint — Fly.io health check uses it)

- [x] Task 8 — Final validation (AC: #1–#4)
  - [x] 8.1 Push to main → CI job (lint + build + test) ✅ + deploy job ✅
  - [x] 8.2 No secrets in logs — all via `${{ secrets.XYZ }}` ✅
  - [x] 8.3 Web deployed to https://ridenrest-app.vercel.app ✅
  - [x] 8.4 `curl https://ridenrest-api.fly.dev/api/health` → `{ "data": { "status": "ok" } }` ✅

## Dev Notes

### CRITICAL: What's Already Done — Do NOT Redo

From story 1.1 (already implemented):
- ✅ `apps/api/fly.toml` — Fly.io config with `internal_port = 3010`, 512MB RAM, region cdg
- ✅ `turbo.json` — build pipeline configured (`dependsOn: ["^build"]`, outputs: `.next/**`, `dist/**`)
- ✅ `package.json` root scripts: `turbo run build --filter='*'`, `turbo run lint --filter='*'`, `turbo run test --filter='*'`
- ✅ `package.json` root `db:migrate` script using `dotenv-cli` + drizzle-kit

**This story adds:** GitHub Actions CI/CD workflow + NestJS Dockerfile + health endpoint.

### Stories 1.1–1.5 Learnings (CRITICAL)

- **Port:** API on `:3010`, Web on `:3011` (not 3000/3001)
- **`turbo run --filter='*'`** — always use this flag for Turborepo v2
- **`moduleResolution: "nodenext"`** in `apps/api` — requires `.js` extensions in ALL relative imports. NOT applicable in packages/ (they use `"bundler"`)
- **Aiven SSL** — always `NODE_TLS_REJECT_UNAUTHORIZED=0` for drizzle-kit CLI; pool config has `ssl: { rejectUnauthorized: false }`
- **Pool max: 10** — mandatory in apps/api; budget: 10 NestJS + 5 CI/CD migrations + 10 margin = 25 Aiven connections max
- **ResponseInterceptor** — wraps all controller returns as `{ "data": {...} }`. Health endpoint returns `{ "data": { "status": "ok" } }` — NOT `{ "status": "ok" }` directly
- **Jest moduleNameMapper** — `"^(\\.{1,2}/.*)\\.js$": "$1"` already in `apps/api/package.json`

### CRITICAL: NestJS Webpack Build (Task 1 — Why It's Mandatory for Docker)

`nest build` by default uses `tsc`. The compiled `dist/main.js` contains:
```js
const database_1 = require("@ridenrest/database");
```
At runtime in Docker's runner stage, Node.js resolves this to `packages/database/src/index.ts` — **a TypeScript file that Node.js cannot execute**. This causes "SyntaxError: Cannot use import statement in a module" or similar errors.

**Fix:** Add `"webpack": true` to `nest-cli.json` → `nest build` bundles everything (including workspace packages) into `dist/main.js`. The runner image only needs the bundled file — no workspace dependencies at runtime.

```json
// apps/api/nest-cli.json — UPDATED
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": {
    "deleteOutDir": true,
    "webpack": true
  }
}
```

> ⚠️ After this change, `dist/main.js` is a single bundled file (~several MB). `node dist/main.js` starts the API. This is the standard NestJS Docker pattern.

### Dockerfile — apps/api/Dockerfile

```dockerfile
# Multi-stage build: Turborepo prune → pnpm install → nest build (webpack) → minimal runner
# Context: run from repository ROOT (not apps/api/)
# Build command: docker build -f apps/api/Dockerfile -t ridenrest-api .

# ──────────────────────────────────────────
# Stage 1: base — Node.js + package managers
# ──────────────────────────────────────────
FROM node:22-alpine AS base
RUN npm install -g pnpm@10.32.1 turbo@2.6.1

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
```

> **Why no `node_modules` in runner?** Because `webpack: true` bundles all deps (including `pg`, `bullmq`, `nestjs/*`, etc.) into `dist/main.js`. Exception: native modules (like `bcrypt`) are excluded by webpack and would need to be copied separately — but our stack doesn't use native modules.

> **Fly.io volume:** `/data/gpx` is the mount point for the Fly.io volume (GPX file storage). The `fly.toml` needs a `[mounts]` section (see fly.toml update below).

### fly.toml Update — Add Volume Mount

```toml
# apps/api/fly.toml — ADD this section
[[mounts]]
  source = "ridenrest_gpx_data"
  destination = "/data/gpx"
```

> Add this to the existing `fly.toml`. The volume `ridenrest_gpx_data` must exist on Fly.io (created manually once via `fly volumes create ridenrest_gpx_data --region cdg --size 3`).

### .dockerignore — Repo Root

```
# .dockerignore (at REPO ROOT — same level as apps/ packages/)
node_modules
.git
.gitignore
**/.env
**/.env.local
**/.env.*.local
**/dist
**/.next
**/.turbo
**/coverage
**/node_modules
.github
_bmad-output
# Exclude web app from API Docker context (turbo prune handles this, but belt+suspenders)
apps/web
# Keep: apps/api/, packages/, turbo.json, package.json, pnpm-lock.yaml, pnpm-workspace.yaml
```

### GitHub Actions Workflow — .github/workflows/ci.yml

```yaml
name: CI / CD

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

env:
  PNPM_VERSION: '10.32.1'
  NODE_VERSION: '22'

jobs:
  # ─────────────────────────────────────────────────────
  # Job 1: CI — Lint + Build + Test (ALL pushes + PRs)
  # ─────────────────────────────────────────────────────
  ci:
    name: Lint, Build & Test
    runs-on: ubuntu-latest

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 2   # Turborepo needs git history for diff-based caching

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm turbo run lint --filter='*'

      - name: Build
        run: pnpm turbo run build --filter='*'

      - name: Test
        run: pnpm turbo run test --filter='*'

  # ─────────────────────────────────────────────────────
  # Job 2: Deploy — Migrate + Vercel + Fly.io
  # Only runs on push to main (not PRs) after CI passes
  # ─────────────────────────────────────────────────────
  deploy:
    name: Deploy
    runs-on: ubuntu-latest
    needs: ci
    if: github.ref == 'refs/heads/main' && github.event_name == 'push'

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 2

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: ${{ env.PNPM_VERSION }}

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      # ── DB Migrations ──────────────────────────────────
      - name: Run DB migrations
        working-directory: packages/database
        run: NODE_TLS_REJECT_UNAUTHORIZED=0 npx drizzle-kit migrate
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}

      # ── Deploy Web → Vercel ───────────────────────────
      - name: Deploy Web to Vercel
        run: |
          pnpm add -g vercel@latest
          vercel --prod --token=${{ secrets.VERCEL_TOKEN }} \
            --yes \
            --cwd apps/web
        env:
          VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
          VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}

      # ── Deploy API → Fly.io ───────────────────────────
      - name: Deploy API to Fly.io
        uses: superfly/flyctl-actions/setup-flyctl@master

      - name: Fly deploy
        run: flyctl deploy --app ridenrest-api --remote-only
        # --remote-only: Docker build runs on Fly.io's builder (no Docker daemon needed in CI)
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

### Health Endpoint (apps/api/src/health/)

#### `apps/api/src/health/health.controller.ts`

```typescript
import { Controller, Get } from '@nestjs/common'
import { ApiOperation, ApiTags } from '@nestjs/swagger'

@ApiTags('health')
@Controller('health')
export class HealthController {
  @Get()
  @ApiOperation({ summary: 'Health check — used by Fly.io and uptime monitors' })
  check() {
    return {
      status: 'ok',
      version: process.env.npm_package_version ?? '0.0.1',
      timestamp: new Date().toISOString(),
    }
  }
}
```

> Response (via ResponseInterceptor): `{ "data": { "status": "ok", "version": "0.0.1", "timestamp": "..." } }`

#### `apps/api/src/health/health.module.ts`

```typescript
import { Module } from '@nestjs/common'
import { HealthController } from './health.controller.js'

@Module({
  controllers: [HealthController],
})
export class HealthModule {}
```

> ⚠️ Note the `.js` extension in the import — **required** for nodenext moduleResolution in `apps/api`. See stories 1.1–1.4 learnings.

#### Register in AppModule

```typescript
// apps/api/src/app.module.ts — ADD HealthModule import
import { HealthModule } from './health/health.module.js'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // ... existing modules ...
    HealthModule,  // ← ADD THIS
  ],
})
export class AppModule {}
```

#### Exclude /health from JwtAuthGuard

The `JwtAuthGuard` stub from story 1.4 uses `APP_GUARD`. To exclude `/health`:

```typescript
// In health.controller.ts — add @Public() decorator
import { Controller, Get } from '@nestjs/common'
import { Public } from '../auth/decorators/public.decorator.js'  // See story 2.1

// OR for story 1.6 (before story 2.1 creates @Public()):
// The JwtAuthGuard stub from 1.4 is a stub that doesn't actually validate tokens yet
// (it just checks header presence). /health can be excluded by checking path in the guard:
```

> **Pragmatic approach for story 1.6:** Since `JwtAuthGuard` is a stub that only checks header presence (full JWT validation is story 2.1), `/health` will respond 401 if called without an `Authorization` header. For Fly.io health checks, configure the health check URL in `fly.toml` to NOT use auth — or temporarily bypass by checking path. Document this and fix properly in story 2.1 when `@Public()` decorator is added.

> **Simpler fix:** Add `/api/health` to the matcher exclusion in the guard itself:

> ⚠️ **IMPORTANT**: The global prefix is `/api`, so the full path is `/api/health` — NOT `/health`.

```typescript
// apps/api/src/common/guards/jwt-auth.guard.ts — update canActivate
import { ExecutionContext, Injectable } from '@nestjs/common'
import { CanActivate } from '@nestjs/common'
import { Request } from 'express'

@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>()
    // Public paths — skip auth (use /api/health because global prefix is /api)
    if (request.path === '/api/health') return true
    // Stub: presence check only (signature validation in story 2.1)
    return !!request.headers['authorization']
  }
}
```

### GitHub Secrets — Complete List

Configure in GitHub repo → Settings → Secrets and variables → Actions:

| Secret Name | Value | How to Get |
|---|---|---|
| `DATABASE_URL` | `postgresql://...` (Aiven full URL with `?sslmode=require`) | Aiven Console → Database → Connection string |
| `FLY_API_TOKEN` | `fo1_...` | `fly tokens create deploy -x 999999h` |
| `VERCEL_TOKEN` | `...` | Vercel Dashboard → Account → Tokens |
| `VERCEL_ORG_ID` | `team_...` | `.vercel/project.json` after `vercel link` |
| `VERCEL_PROJECT_ID` | `prj_...` | `.vercel/project.json` after `vercel link` |

> ⚠️ **Never put secrets in workflow yaml files.** Always use `${{ secrets.SECRET_NAME }}`.

### Vercel Project Setup — Step by Step

1. Install Vercel CLI globally: `npm install -g vercel`
2. In `apps/web/`: run `vercel link` → follow prompts → creates `.vercel/project.json`
3. Note `orgId` and `projectId` from `.vercel/project.json` → add as GitHub Secrets
4. Add `.vercel/` to root `.gitignore`
5. Vercel Dashboard → Project → Settings → General:
   - **Root Directory**: `apps/web`
   - **Framework Preset**: Next.js (auto-detected)
   - **Build Command**: override with `cd ../.. && pnpm turbo run build --filter=@ridenrest/web`
   - **Install Command**: `pnpm install --frozen-lockfile`
6. Vercel Dashboard → Project → Settings → Environment Variables (Production):
   ```
   BETTER_AUTH_SECRET=<same as apps/api>
   BETTER_AUTH_URL=https://ridenrest.com (your production domain)
   NEXT_PUBLIC_API_URL=https://ridenrest-api.fly.dev
   NEXT_PUBLIC_BETTER_AUTH_URL=https://ridenrest.com
   ```

### Fly.io First Deploy — Setup Steps

The `fly.toml` was created in story 1.4 with app name `ridenrest-api`.

1. If not already created: `fly apps create ridenrest-api`
2. Create GPX volume (once): `fly volumes create ridenrest_gpx_data --region cdg --size 3 --app ridenrest-api`
3. Set production secrets (once, not in CI):
   ```bash
   fly secrets set \
     DATABASE_URL="postgresql://..." \
     UPSTASH_REDIS_URL="rediss://..." \
     BETTER_AUTH_SECRET="..." \
     BETTER_AUTH_URL="https://ridenrest.com" \
     --app ridenrest-api
   ```
4. First deploy (from local, to verify): `flyctl deploy --app ridenrest-api`
5. After success: CI/CD handles all subsequent deploys via `flyctl deploy --remote-only`

### DB Migration in CI — Why Not the Root Script

The root `db:migrate` script uses `dotenv-cli` to load `.env` from `apps/api/.env`:
```bash
dotenv -e apps/api/.env -- sh -c 'cd packages/database && NODE_TLS_REJECT_UNAUTHORIZED=0 drizzle-kit migrate'
```

In CI, there's no `.env` file — GitHub Secrets are injected as environment variables. So the CI step runs drizzle-kit directly with `DATABASE_URL` from the environment:

```yaml
- name: Run DB migrations
  working-directory: packages/database
  run: NODE_TLS_REJECT_UNAUTHORIZED=0 npx drizzle-kit migrate
  env:
    DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

This reads `packages/database/drizzle.config.ts` which uses `process.env.DATABASE_URL!`.

### Aiven Connection Budget During Migrations

The `drizzle-kit migrate` command opens a DB connection for migration. Aiven free tier allows ~25 connections max.

Budget with CI:
- NestJS production pool: `max: 10`
- CI/CD migrations: `max: 5` (drizzle-kit is sequential, typically 1-2 connections)
- Better Auth pool: `max: 2` (from story 1.5)
- Remaining margin: ~8

✅ Within budget. No pool configuration change needed for migrations.

### File Structure After Story 1.6

```
ridenrest-app/
├── .github/
│   └── workflows/
│       └── ci.yml                        ← NEW: CI/CD pipeline
├── .dockerignore                         ← NEW: repo root dockerignore
├── apps/
│   └── api/
│       ├── Dockerfile                    ← NEW: multi-stage Docker build
│       ├── fly.toml                      ← UPDATED: add [[mounts]] section
│       ├── nest-cli.json                 ← UPDATED: add webpack: true
│       └── src/
│           ├── health/
│           │   ├── health.controller.ts  ← NEW: GET /health
│           │   └── health.module.ts      ← NEW
│           ├── auth/guards/
│           │   └── jwt-auth.guard.ts     ← UPDATED: exclude /health path
│           └── app.module.ts             ← UPDATED: import HealthModule
```

### Scope Boundaries — What NOT to Implement in This Story

- ❌ NO Sentry / error monitoring (post-MVP)
- ❌ NO Turborepo Remote Cache (post-MVP — deferred in architecture.md)
- ❌ NO E2E tests in CI (deferred — no E2E for MVP)
- ❌ NO preview deployments on PRs (complexity vs. solo dev benefit)
- ❌ NO `@Public()` decorator (story 2.1) — use path-based exclusion in guard for now
- ❌ NO Docker Compose for local development (team not needed for solo dev)
- ❌ NO staging environment (MVP ships directly to production)

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 1.6 ACs]
- [Source: _bmad-output/planning-artifacts/architecture.md — CI/CD pipeline, Fly.io config, Vercel deploy]
- [Source: _bmad-output/project-context.md — NestJS nodenext `.js` import rule]
- [Source: _bmad-output/project-context.md — Aiven connection pool budget (max:10 NestJS + 5 CI/CD = 15)]
- [Source: _bmad-output/implementation-artifacts/1-4-nestjs-api-foundation.md — fly.toml, port :3010, JwtAuthGuard stub]
- [Source: _bmad-output/implementation-artifacts/1-2-database-schema-aiven-configuration.md — Aiven SSL, drizzle-kit migrate]

---

## Dev Agent Record

### Implementation Plan

1. **Task 1**: Added `"webpack": true` + `webpackConfigPath` to `nest-cli.json`. Required custom `webpack.config.js` to handle `nodenext` `.js` extension alias — webpack doesn't resolve `.js` → `.ts` by default.
2. **Task 2**: Created multi-stage `Dockerfile` per Dev Notes. Docker daemon not running locally (OrbStack off) — Docker build validated via Fly.io `--remote-only` in CI.
3. **Task 3**: Created `.github/workflows/ci.yml` with `ci` and `deploy` jobs. Deploy is gated on `needs: ci` + `if: main branch push`.
4. **Task 7**: Created `health/` module with `HealthController`. Updated `JwtAuthGuard` to bypass `/api/health` path (global prefix is `/api`). Updated `AppModule`.
5. **ESLint fix**: `tsconfig.eslint.json` + `project` config in `eslint.config.mjs` — fixes pre-existing lint failure for co-located `.test.ts` files. Also removed unnecessary type assertion in `http-exception.filter.ts`.
6. **fly.toml**: Added `[[mounts]]` section for `ridenrest_gpx_data` volume → `/data/gpx`.
7. **Tasks 4, 5, 6, 8**: Manual setup tasks (Vercel link, Fly.io secrets, GitHub Secrets, final deploy validation) — require user action.

### Debug Log

- `nest build` with `webpack: true` failed with "Can't resolve './app.module.js'" — root cause: webpack doesn't support TypeScript's `nodenext` extension alias by default. Fix: custom `webpack.config.js` with `extensionAlias: { '.js': ['.ts', '.js'] }`.
- ESLint `allowDefaultProject` with `**` patterns is disallowed (performance). Fix: `tsconfig.eslint.json` + `parserOptions.project`.

### Completion Notes

**Implemented (code tasks):**
- ✅ `nest-cli.json`: webpack bundling enabled with custom config for nodenext compatibility
- ✅ `apps/api/webpack.config.js`: extensionAlias for `.js` → `.ts` resolution
- ✅ `apps/api/Dockerfile`: 5-stage build (base/pruner/installer/builder/runner)
- ✅ `.dockerignore`: excludes web, _bmad, env files, node_modules, dist
- ✅ `.github/workflows/ci.yml`: CI (lint+build+test on all pushes) + deploy (main only)
- ✅ `health/health.controller.ts` + `health.module.ts`: `GET /health` → `{ data: { status: 'ok', version, timestamp } }`
- ✅ `app.module.ts`: HealthModule imported
- ✅ `jwt-auth.guard.ts`: `/api/health` path excluded from auth (global prefix = `/api`)
- ✅ `apps/api/fly.toml`: `[[mounts]]` added for GPX volume
- ✅ `tsconfig.eslint.json` + `eslint.config.mjs`: lint now works for co-located test files
- ✅ All 19 tests pass, lint clean, webpack build succeeds

**Pending (manual tasks):**
- ⏳ Task 4: `vercel link` + Vercel dashboard config + env vars
- ⏳ Task 5: Fly.io secrets + volume verification + `FLY_API_TOKEN` generation
- ⏳ Task 6: GitHub Secrets configuration
- ⏳ Task 8: Final validation after first real push to main
- ⏳ Task 2.3: Docker smoke test (run when OrbStack started: `docker build -f apps/api/Dockerfile -t ridenrest-api .`)

### Review Follow-ups (AI)

- [ ] [AI-Review][LOW] `health.controller.test.ts` — test version env var trop faible: vérifier que le fallback est bien `'0.0.1'` et que `process.env.npm_package_version` est correctement lue. Ajouter: `process.env.npm_package_version = '1.2.3'; expect(controller.check().version).toBe('1.2.3')` [health.controller.test.ts:19]
- [ ] [AI-Review][LOW] `ci.yml` — `fetch-depth: 2` insuffisant pour Turborepo diff cross-branches; envisager `fetch-depth: 0` si Remote Cache activé en post-MVP [ci.yml:25]
- [ ] [AI-Review][INFO] `vercel@39` dans ci.yml — pinner à la version exacte après vérification de la version en prod (actuellement `@39`, à mettre à jour si breaking change) [ci.yml:93]

---

## File List

**New files:**
- `apps/api/webpack.config.js`
- `apps/api/Dockerfile`
- `.dockerignore`
- `.github/workflows/ci.yml`
- `apps/api/src/health/health.controller.ts`
- `apps/api/src/health/health.controller.test.ts`
- `apps/api/src/health/health.module.ts`
- `apps/api/tsconfig.eslint.json`

**Modified files:**
- `apps/api/nest-cli.json` — added webpack + webpackConfigPath
- `apps/api/src/app.module.ts` — imported HealthModule
- `apps/api/src/common/guards/jwt-auth.guard.ts` — /health bypass + path property
- `apps/api/src/common/guards/jwt-auth.guard.test.ts` — added path to mock + /health test
- `apps/api/src/common/filters/http-exception.filter.ts` — removed unnecessary type assertion
- `apps/api/eslint.config.mjs` — tsconfig.eslint.json project config
- `apps/api/fly.toml` — added [[mounts]] section
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — story status updated

---

## Change Log

- 2026-03-14: Story 1.6 implementation started — code tasks (1, 2, 3, 7) complete; manual setup tasks (4, 5, 6, 8) pending user action
- 2026-03-14: Code review — 3 HIGH + 4 MEDIUM fixes applied: `setup-flyctl@master`→`@v1` (supply chain), `vercel@latest`→`@39` + `--cwd apps/web` (deploy correctness), `_bmad/` added to .dockerignore, Dev Notes corrected (`/health`→`/api/health`, `--frozen-lockfile`→`--no-frozen-lockfile`); 2 LOW action items added
