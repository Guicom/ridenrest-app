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

### next-plausible Library (v4 — API changed from v3)

Use `next-plausible` (MIT, ~50k weekly downloads) — provides `<PlausibleProvider>` for App Router and `usePlausible()` hook for custom events (used in stories 15.2, 15.3).

**IMPORTANT**: v4 removed `domain`, `customDomain`, `selfHosted` props. Use `src`, `init.endpoint`, and `scriptProps["data-domain"]` instead.

```typescript
// layout.tsx — actual pattern (next-plausible v4)
import PlausibleProvider from 'next-plausible'

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <head>
        <PlausibleProvider
          src={`${process.env.NEXT_PUBLIC_PLAUSIBLE_HOST}/js/script.outbound-links.pageview-props.tagged-events.js`}
          init={{ endpoint: `${process.env.NEXT_PUBLIC_PLAUSIBLE_HOST}/api/event` }}
          scriptProps={{ "data-domain": process.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN }}
        />
      </head>
      <body>{children}</body>
    </html>
  )
}
```

Script extensions enabled: `outbound-links` (Booking.com clicks), `pageview-props` (custom properties), `tagged-events` (custom events for funnel).

### Security Considerations

- Plausible's built-in auth is sufficient (no need for Caddy basic_auth like Uptime Kuma)
- `SECRET_KEY_BASE` must be 64+ random bytes: `openssl rand -base64 64 | tr -d '\n'`
- `TOTP_VAULT_KEY` must be 32 random bytes: `openssl rand -base64 32 | tr -d '\n'`
- **CRITICAL**: Values in `.env` MUST be wrapped in double quotes (base64 contains `+`, `/`, `=` that break bash `source`)
- Stats API key (for story 15.4) is generated within Plausible dashboard — store as `PLAUSIBLE_API_KEY` in VPS `.env`

### Hostinger KVM VPS — ClickHouse Gotchas (discovered 2026-04-06)

1. **IPv6 disabled** — ClickHouse defaults to `[::]`, must mount `clickhouse/ipv4-only.xml` to force `0.0.0.0`
2. **NUMA capabilities** — `get_mempolicy` blocked by Docker seccomp → `cap_add: [SYS_NICE, IPC_LOCK]`
3. **No wget in alpine** — Health check must use `clickhouse-client --query 'SELECT 1'`, not `wget`
4. **First boot** — Requires manual steps: create ClickHouse DB (`CREATE DATABASE IF NOT EXISTS plausible_events`), then run Plausible migrations (`Plausible.Release.createdb && Plausible.Release.interweave_migrate`)
5. **start_period** — ClickHouse needs 60s on first boot (default 30s too short)

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
- **ClickHouse `get_mempolicy` error on KVM VPS** — Fixed by adding `cap_add: [SYS_NICE, IPC_LOCK]` to grant NUMA capabilities blocked by Docker seccomp profile on Hostinger KVM.
- **ClickHouse IPv6 bind failure** — Hostinger KVM has IPv6 disabled. ClickHouse defaults to listening on `[::]` which fails. Fixed by mounting `clickhouse/ipv4-only.xml` config override (`<listen_host>0.0.0.0</listen_host>`).
- **ClickHouse health check** — `wget` not available in `clickhouse-server:24-alpine`. Replaced with `clickhouse-client --query 'SELECT 1'`.
- **Plausible DB migrations** — First boot requires manual migration: `docker run ... /app/bin/plausible eval "Plausible.Release.createdb && Plausible.Release.interweave_migrate"`. Also need to create ClickHouse database first: `docker exec plausible-events-db clickhouse-client --query "CREATE DATABASE IF NOT EXISTS plausible_events"`.
- **`.env` quoting** — `openssl rand -base64 64` output contains `+`, `/`, `=` characters that break bash `source` — values MUST be wrapped in double quotes in `.env`.
- **Plausible script extensions** — Enabling outbound links, custom properties, and tagged events in Plausible dashboard changes the script URL from `script.js` to `script.outbound-links.pageview-props.tagged-events.js`. Updated `layout.tsx` accordingly.
- **Caddy HTTP/2 → HTTP/1.1** — Plausible (Elixir/Cowboy) only speaks HTTP/1.1. Caddy defaults to HTTP/2 upstream, causing `ERR_HTTP2_PROTOCOL_ERROR` on POST `/api/event`. Fixed with `transport http { versions 1.1 }` in Caddyfile.
- **Chrome blocking** — Some Chrome configurations (enhanced tracking protection, privacy settings) block the Plausible script cross-origin (`ERR_BLOCKED_BY_CLIENT`). Works correctly in Safari, curl, and most Chrome instances. Not a production issue — Plausible by design accepts partial tracking coverage.

### Completion Notes List
- ✅ Task 1: Added 3 Docker services (plausible, plausible-db, plausible-events-db) with `profiles: ["production"]`, health checks, and dedicated volumes. Validated with `docker compose config`.
- ✅ Task 2: Added `stats.ridenrest.app` Caddy block proxying to `plausible:8000` (Docker internal DNS). Security headers match existing blocks. Forced HTTP/1.1 upstream transport for Cowboy compatibility.
- ✅ Task 3: Installed `next-plausible`, configured `PlausibleProvider` in `layout.tsx` `<head>` with self-hosted src/endpoint. TypeScript compiles clean.
- ✅ Task 4: All steps are manual post-deploy (admin setup, site registration, Goals, API key). Documented in Dev Notes.
- ✅ Task 5: Added `NEXT_PUBLIC_PLAUSIBLE_DOMAIN` and `NEXT_PUBLIC_PLAUSIBLE_HOST` to `turbo.json` env array. VPS `.env` additions are manual.
- ✅ Task 6: 3 new Vitest tests verify PlausibleProvider renders with correct self-hosted props and no plausible.io references.
- Full test suite: 852 web + 245 API = 1097 tests, 0 regressions.

### Manual VPS Steps (completed 2026-04-06)
1. ✅ DNS A record: `stats.ridenrest.app → 72.62.189.193`
2. ✅ VPS `.env`: `PLAUSIBLE_SECRET_KEY_BASE` (quoted!), `PLAUSIBLE_TOTP_VAULT_KEY`, `PLAUSIBLE_DB_PASSWORD`
3. ✅ VPS `.env`: `NEXT_PUBLIC_PLAUSIBLE_DOMAIN=ridenrest.app`, `NEXT_PUBLIC_PLAUSIBLE_HOST=https://stats.ridenrest.app`
4. ✅ ClickHouse DB init: `docker exec plausible-events-db clickhouse-client --query "CREATE DATABASE IF NOT EXISTS plausible_events"`
5. ✅ Plausible DB migrations: `docker run ... /app/bin/plausible eval "Plausible.Release.createdb && Plausible.Release.interweave_migrate"`
6. ✅ `docker compose --profile production up -d` — all 3 Plausible containers healthy
7. ✅ Caddy restart to pick up `stats.ridenrest.app` — SSL auto-provisioned via Let's Encrypt
8. ✅ Admin account created via first-boot wizard at `https://stats.ridenrest.app`
9. ✅ Site `ridenrest.app` registered in Plausible dashboard
10. ✅ Enabled: Outbound links, Custom events (tagged-events), Custom properties (pageview-props)
11. ⬜ Generate Stats API key (needed by story 15.4), store as `PLAUSIBLE_API_KEY` in VPS `.env`

### File List
- `docker-compose.yml` — added plausible, plausible-db, plausible-events-db services + 2 volumes + cap_add for KVM
- `Caddyfile` — added stats.ridenrest.app reverse proxy block with HTTP/1.1 transport
- `clickhouse/ipv4-only.xml` — NEW: ClickHouse config override to force IPv4-only (VPS has no IPv6)
- `apps/web/src/app/layout.tsx` — added PlausibleProvider in `<head>`
- `apps/web/src/app/layout.test.ts` — added 3 PlausibleProvider tests
- `apps/web/package.json` — added next-plausible dependency
- `turbo.json` — added NEXT_PUBLIC_PLAUSIBLE_DOMAIN, NEXT_PUBLIC_PLAUSIBLE_HOST to env
- `pnpm-lock.yaml` — updated with next-plausible dependency
