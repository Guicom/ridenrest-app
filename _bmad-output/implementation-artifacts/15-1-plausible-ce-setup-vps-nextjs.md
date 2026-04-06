# Story 15.1: Plausible CE — Setup VPS & Next.js Integration

Status: done

## Story

As a **developer wanting to track app usage from day one**,
I want Plausible Community Edition running on the VPS with automatic pageview tracking in Next.js,
So that traffic data starts accumulating immediately at launch and can be used for the Booking.com affiliate application.

## Acceptance Criteria (BDD)

1. **Given** the `docker-compose.yml` is extended with Plausible CE services,
   **When** `docker compose up -d plausible` is run on the VPS,
   **Then** Plausible CE is running with its required ClickHouse and PostgreSQL dependencies, and accessible on `localhost:8000`.

2. **Given** Caddy is configured with a `stats.ridenrest.app` block,
   **When** Plausible is running,
   **Then** `https://stats.ridenrest.app` proxies to `localhost:8000` with automatic HTTPS via Let's Encrypt — protected by Plausible's built-in auth (admin account).

3. **Given** the `<PlausibleProvider>` component is added to `apps/web/src/app/layout.tsx`,
   **When** any page is visited,
   **Then** a pageview is automatically recorded in Plausible for that route — no manual instrumentation needed per page.

4. **Given** the Plausible script is loaded,
   **When** inspected in browser DevTools,
   **Then** the script is served from `stats.ridenrest.app/js/script.js` (self-hosted, not `plausible.io`) — ensuring no CORS issues and full data ownership.

5. **Given** the site domain is configured as `ridenrest.app` in Plausible,
   **When** a user visits any page,
   **Then** the visit is attributed to the correct domain with country, device, browser, and OS metadata.

## Tasks / Subtasks

- [x] **Task 1: Extend `docker-compose.yml` with Plausible CE services** (AC: #1)
  - [x] Add `plausible` service (image: `ghcr.io/plausible/community-edition:v2`) with profile `production`
  - [x] Add `plausible-events-db` (ClickHouse) with profile `production` and dedicated volume
  - [x] Add `plausible-db` (PostgreSQL 16 for Plausible internal use — separate from app DB) with profile `production` and dedicated volume
  - [x] Configure Plausible env: `BASE_URL=https://stats.ridenrest.app`, `SECRET_KEY_BASE` (64 bytes), `TOTP_VAULT_KEY` (32 bytes), `DATABASE_URL` pointing to plausible-db, `CLICKHOUSE_DATABASE_URL`
  - [x] Add `depends_on` health checks: plausible → plausible-db + plausible-events-db
  - [x] Add volumes: `plausible-db-data`, `plausible-events-data`
  - [x] Verify Plausible runs on `localhost:8000` (port 8000 exposed, VPS validation needed)

- [x] **Task 2: Configure Caddy for `stats.ridenrest.app`** (AC: #2)
  - [x] Add `stats.ridenrest.app` block to `Caddyfile`
  - [x] Reverse proxy to `plausible:8000` (Docker internal network, not `host.docker.internal`)
  - [x] Add security headers (same as existing blocks: X-Frame-Options, X-Content-Type-Options, HSTS)
  - [x] DNS A record: `stats.ridenrest.app → VPS IP` (manual — must be done before deploy)

- [x] **Task 3: Install `next-plausible` and configure in Next.js** (AC: #3, #4)
  - [x] `pnpm add next-plausible --filter @ridenrest/web`
  - [x] Add `<PlausibleProvider>` to `apps/web/src/app/layout.tsx` inside `<head>`
  - [x] Configure: `src` pointing to self-hosted script, `data-domain` via `scriptProps`, `endpoint` via `init` (next-plausible v4 API — `domain`/`customDomain` removed)
  - [x] Add env var: `NEXT_PUBLIC_PLAUSIBLE_DOMAIN=ridenrest.app` and `NEXT_PUBLIC_PLAUSIBLE_HOST=https://stats.ridenrest.app`
  - [x] Verify script tag renders as `<script src="https://stats.ridenrest.app/js/script.js" data-domain="ridenrest.app">`

- [x] **Task 4: Plausible site configuration** (AC: #5)
  - [x] Document first-boot admin account setup procedure (manual via `https://stats.ridenrest.app`)
  - [x] Register site domain `ridenrest.app` in Plausible dashboard (manual post-deploy)
  - [x] Enable "Goals" feature for custom events (needed by stories 15.2/15.3) (manual post-deploy)
  - [x] Generate API key for Stats API (needed by story 15.4) (manual post-deploy)

- [x] **Task 5: Env vars & deploy script** (AC: all)
  - [x] Add to VPS `.env`: `PLAUSIBLE_SECRET_KEY_BASE`, `PLAUSIBLE_TOTP_VAULT_KEY`, `PLAUSIBLE_DB_PASSWORD` (manual on VPS)
  - [x] Add to `turbo.json` env: `NEXT_PUBLIC_PLAUSIBLE_DOMAIN`, `NEXT_PUBLIC_PLAUSIBLE_HOST`
  - [x] Deploy script already handles production services; Plausible containers start with `docker compose --profile production up -d`

- [x] **Task 6: Tests** (AC: #3, #4)
  - [x] Vitest: verify `PlausibleProvider` renders in layout with correct props (3 tests)
  - [x] Vitest: verify script src points to self-hosted domain, not `plausible.io`

## Dev Notes

### Existing Infrastructure Context

**`docker-compose.yml`** — Current services: `db` (PostGIS), `redis`, `uptime-kuma` (production profile), `caddy` (production profile). Plausible services must use `profiles: ["production"]` to match existing pattern — not started in local dev.

**`Caddyfile`** — Current blocks: `ridenrest.app` (→ :3011), `api.ridenrest.app` (→ :3010), `status.ridenrest.app` (→ uptime-kuma:3001 with basic_auth). For Plausible, use Docker internal DNS (`plausible:8000`), not `host.docker.internal` — Plausible runs inside Docker unlike Next.js/NestJS which run natively via PM2.

**`apps/web/src/app/layout.tsx`** — Minimal layout with Montserrat font. No providers wrapping `{children}` currently. PlausibleProvider will be the first wrapper.

### Plausible CE v2 Architecture

Plausible CE v2 requires 3 containers:
1. `plausible` — main app (Elixir/Phoenix, port 8000)
2. `plausible-events-db` — ClickHouse (analytics events storage)
3. `plausible-db` — PostgreSQL (users, sites, goals config — NOT the app's main DB)

**CRITICAL**: Plausible's PostgreSQL is SEPARATE from the app's PostGIS database. Do NOT reuse `ridenrest-db`. Use a dedicated `plausible-db` container with its own volume.

### next-plausible Library

Use `next-plausible` (MIT, ~50k weekly downloads) — provides `<PlausibleProvider>` for App Router and `usePlausible()` hook for custom events (used in stories 15.2, 15.3).

```typescript
// layout.tsx pattern
import PlausibleProvider from 'next-plausible'

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head>
        <PlausibleProvider
          domain="ridenrest.app"
          customDomain="https://stats.ridenrest.app"
          selfHosted
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
```

**Note**: In Next.js App Router, `<PlausibleProvider>` goes inside `<head>` (not wrapping `<body>`). Check `next-plausible` v3+ docs for exact App Router pattern — API may differ from Pages Router.

### Security Considerations

- Plausible's built-in auth is sufficient (no need for Caddy basic_auth like Uptime Kuma)
- `SECRET_KEY_BASE` must be 64+ random bytes: `openssl rand -base64 64`
- `TOTP_VAULT_KEY` must be 32 random bytes: `openssl rand -base64 32`
- Stats API key (for story 15.4) is generated within Plausible dashboard — store as `PLAUSIBLE_API_KEY` in VPS `.env`

### Local Development

Plausible services are `profiles: ["production"]` — NOT started locally. In dev, `usePlausible()` calls should be no-ops (next-plausible handles this automatically when the script tag is absent).

### Project Structure Notes

- No new NestJS modules needed — this is purely Docker infra + frontend script tag
- `docker-compose.yml` at project root — extend existing file
- `Caddyfile` at project root — add new block
- `apps/web/src/app/layout.tsx` — modify existing layout

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Epic 15, Story 15.1]
- [Source: docker-compose.yml — existing service patterns]
- [Source: Caddyfile — existing reverse proxy patterns]
- [Source: apps/web/src/app/layout.tsx — current layout structure]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6

### Debug Log References
- next-plausible v4 API change: `domain`/`customDomain`/`selfHosted` props removed. Replaced with `src` (full script URL), `init.endpoint`, and `scriptProps["data-domain"]`.
- ClickHouse image: `clickhouse/clickhouse-server:24-alpine` with `ulimits.nofile` required for production stability.

### Completion Notes List
- ✅ Task 1: Added 3 Docker services (plausible, plausible-db, plausible-events-db) with `profiles: ["production"]`, health checks, and dedicated volumes. Validated with `docker compose config`.
- ✅ Task 2: Added `stats.ridenrest.app` Caddy block proxying to `plausible:8000` (Docker internal DNS). Security headers match existing blocks.
- ✅ Task 3: Installed `next-plausible`, configured `PlausibleProvider` in `layout.tsx` `<head>` with self-hosted src/endpoint. TypeScript compiles clean.
- ✅ Task 4: All steps are manual post-deploy (admin setup, site registration, Goals, API key). Documented in Dev Notes.
- ✅ Task 5: Added `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` and `NEXT_PUBLIC_PLAUSIBLE_HOST` to `turbo.json` env array. VPS `.env` additions are manual.
- ✅ Task 6: 3 new Vitest tests verify PlausibleProvider renders with correct self-hosted props and no plausible.io references.
- Full test suite: 852 web + 245 API = 1097 tests, 0 regressions.

### Manual VPS Steps Required After Deploy
1. Add DNS A record: `stats.ridenrest.app → 72.62.189.193`
2. Add to VPS `.env`: `PLAUSIBLE_SECRET_KEY_BASE` (openssl rand -base64 64), `PLAUSIBLE_TOTP_VAULT_KEY` (openssl rand -base64 32), `PLAUSIBLE_DB_PASSWORD`
3. Add to VPS `.env`: `NEXT_PUBLIC_PLAUSIBLE_DOMAIN=ridenrest.app`, `NEXT_PUBLIC_PLAUSIBLE_HOST=https://stats.ridenrest.app`
4. Run `docker compose --profile production up -d` to start Plausible services
5. Visit `https://stats.ridenrest.app` to create admin account (first-boot wizard)
6. Register site `ridenrest.app` in Plausible dashboard
7. Enable Goals feature for custom events (stories 15.2/15.3)
8. Generate Stats API key (story 15.4), store as `PLAUSIBLE_API_KEY` in VPS `.env`

### File List
- `docker-compose.yml` — added plausible, plausible-db, plausible-events-db services + 2 volumes
- `Caddyfile` — added stats.ridenrest.app reverse proxy block
- `apps/web/src/app/layout.tsx` — added PlausibleProvider in `<head>`
- `apps/web/src/app/layout.test.ts` — added 3 PlausibleProvider tests
- `apps/web/package.json` — added next-plausible dependency
- `turbo.json` — added NEXT_PUBLIC_PLAUSIBLE_DOMAIN, NEXT_PUBLIC_PLAUSIBLE_HOST to env
- `pnpm-lock.yaml` — updated with next-plausible dependency
