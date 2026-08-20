---
project_name: 'ridenrest-app'
user_name: 'Guillaume'
date: '2026-06-13'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'code_quality', 'workflow_rules', 'critical_rules', 'mobile_rules']
existing_patterns_found: 9
status: 'complete'
optimized_for_llm: true
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

| Layer | Technology | Version | Notes |
|---|---|---|---|
| Monorepo | Turborepo + pnpm workspaces | 2.6.1 / pnpm 9+ | `pnpm create turbo@latest` base |
| Web app | Next.js (React 19) | 15.x | App Router, VPS deploy (Node.js natif + PM2 + Caddy) |
| API | NestJS | 11.x | VPS deploy (Node.js natif + PM2) |
| Database | PostgreSQL + PostGIS | 16 + 3.4 | Docker sur VPS Hostinger, ST_Buffer, ST_DWithin corridor search |
| ORM | Drizzle ORM + drizzle-kit | latest | Schemas in `packages/database/`, pool max:10, idleTimeout:30s, connTimeout:5s |
| Cache | Redis | 7 | Docker sur VPS, dual role: API cache + BullMQ backend (pas de limite cmds/jour) |
| Job queue | BullMQ | v5 | `@nestjs/bullmq`, async GPX parsing |
| File storage | VPS disk | — | GPX files, `/data/gpx/`, limité par disque VPS (~100GB) |
| Server state | TanStack Query | v5 | Fetch, cache, invalidation + polling job status |
| Client state | Zustand | v5 | Live mode GPS, map layers, UI state |
| UI components | shadcn/ui + Tailwind CSS | latest / v4 | Radix UI base, dark/light native |
| Map | MapLibre GL JS + OpenFreeMap | v4 | WebGL, MIT tiles, OSM attribution required |
| Validation | Zod (shared) + class-validator | v4 / latest | Zod in `packages/shared/`, cv in NestJS |
| Forms | React Hook Form + Zod resolver | v7 | Validation shared with backend |
| Auth | Better Auth | latest | Drizzle adapter, Email + Google OAuth + Strava OAuth |
| Testing | Vitest (web/packages), Jest (api) | latest | Co-located `.test.ts` files |
| CI/CD | GitHub Actions | — | Turborepo-aware pipeline, SSH deploy vers VPS |
| Reverse proxy | Caddy 2 | latest | Docker sur VPS, auto Let's Encrypt, HTTPS |
| Process manager | PM2 | latest | Gère Next.js + NestJS sur VPS, restart auto |
| Monitoring | Uptime Kuma | latest | Docker sur VPS, alertes email/Telegram |
| Analytics | PostHog (`@ridenrest/analytics`) | posthog-js 1.x (web) / posthog-react-native (mobile) | A remplacé Plausible (amendement 2026-06-07). **Web** : consentement RGPD + proxy anti-adblock. **Mobile** : pas de bandeau de consentement (zéro cookie, `distinct_id` AsyncStorage, pas d'IDFA → pas d'ATT requis) — décision architecturale MOB-6.1. Plausible CE reste en infra VPS historique. |
| Mobile | Expo SDK 56 / React Native 0.85 | voir section Mobile | App native iOS/Android, monorepo `apps/mobile` |

---

## Critical Implementation Rules

### Naming Conventions

**Database (Drizzle schemas in `packages/database/`):**
- Tables: `snake_case` plural → `adventure_segments`, `accommodations_cache`
- Columns: `snake_case` → `user_id`, `order_index`, `created_at`
- Foreign keys: `{singular}_id` → `adventure_id`, `segment_id`
- Indexes: `idx_{table}_{column}` → `idx_adventure_segments_adventure_id`

**REST Endpoints (NestJS controllers):**
- Resources: plural kebab-case → `/adventures`, `/adventure-segments`, `/pois`
- Route params: `:id` (UUID string)
- Query params: camelCase → `?fromKm=10&toKm=50`
- Max 1 nesting level: `/adventures/:id/segments`

**TypeScript code:**
- Variables/functions: `camelCase` → `adventureId`, `parseGpxFile()`
- Types/Interfaces/Classes: `PascalCase` → `Adventure`, `GpxSegment`, `JwtAuthGuard`
- Constants: `SCREAMING_SNAKE_CASE` → `MAX_GPX_POINTS`, `OVERPASS_CACHE_TTL`
- Next.js files: `kebab-case.tsx` → `adventure-card.tsx`, `map-view.tsx`
- NestJS files: `kebab-case.{type}.ts` → `adventures.module.ts`, `adventures.controller.ts`

**API JSON fields:** `camelCase` → `adventureId`, `totalDistanceKm`

---

### NestJS Architecture Rules

**Feature modules — mandatory structure:**
```
src/{feature}/
  {feature}.module.ts
  {feature}.controller.ts
  {feature}.service.ts
  {feature}.repository.ts    ← ALL Drizzle queries go here, NEVER in service
  {feature}.service.test.ts  ← co-located test
  dto/
    create-{feature}.dto.ts
    update-{feature}.dto.ts
```

**ResponseInterceptor — ALWAYS active:**
- Controllers return raw data → ResponseInterceptor wraps automatically
- NEVER return `{ success: true, data: ... }` from a controller
- Format: `{ "data": {...} }` / `{ "data": [...], "meta": {...} }` / `{ "error": {...} }`

**Error handling:**
- Services throw typed HttpExceptions: `NotFoundException`, `BadRequestException`, etc.
- Controllers: NO try/catch — `HttpExceptionFilter` handles globally
- BullMQ processors: log errors + let job fail → auto-retry (max 3)

**Auth guard:**
- `JwtAuthGuard` verifies Better Auth JWT on every protected endpoint
- Extracts `req.user = { id, email }` from token
- Use `@CurrentUser()` decorator to access user in controllers

**Validation:**
- `ValidationPipe` global — validates all DTOs via `class-validator`
- Import Zod schemas from `packages/shared/schemas/` — NEVER duplicate

---

### Next.js App Router Rules

**Route group strategy:**
- `(marketing)/` — SSG pages: landing, about, privacy, terms (SEO-indexed)
- `(app)/` — CSR/client pages: auth-gated, `noindex` (adventures, map, live, settings)
- `api/` — Route Handlers for Better Auth catch-all handler ONLY (`api/auth/[...all]/`)

**Private components:** `_components/` folder inside each route segment

**Auth:**
- `middleware.ts` + Better Auth middleware manages session server-side
- `lib/auth/client.ts` (browser) + `lib/auth/server.ts` (server components)

**VPS deployment (Next.js standalone + PM2):**
- Full Node.js runtime — `output: 'standalone'` in `next.config.ts`
- SSG for `(marketing)/` (SEO), CSR for `(app)/` (auth-gated)
- Caddy reverse proxy handles HTTPS + CDN (Cloudflare optionnel devant)

**Data fetching:**
- Server state: TanStack Query v5 hooks (useQuery, useMutation)
- Client state: Zustand stores (`useMapStore`, `useLiveStore`, `useUIStore`)
- Job status polling: TanStack Query `refetchInterval` conditionnel sur `parse_status`

---

### TanStack Query — Query Key Convention (STRICT)

```typescript
['adventures']                              // list
['adventures', adventureId]                 // single item
['adventures', adventureId, 'segments']     // sub-resource
['pois', { segmentId, fromKm, toKm, layer, overpassEnabled, source }]  // per-layer ET per-source
['weather', segmentId]
['density', adventureId]
```

NEVER invent query keys like `['getAdventure', id]` or `['adventure-list']`.

`source` (`'google' | 'overpass'`) est une dimension à part entière depuis la story 17.14 : les deux sources d'une même recherche sont deux requêtes indépendantes, chacune avec son entrée de cache et son état de chargement. Voir la règle 10 ci-dessous.

---

### Zustand Stores — Convention

- Naming: `use{Domain}Store` → `useMapStore`, `useLiveStore`, `useUIStore`
- File: `stores/{domain}.store.ts`
- Structure: flat (no deep nesting)
- Actions: imperative verbs → `setActiveLayer()`, `activateLiveMode()`, `updateGpsPosition()`

---

### Testing Rules

**Co-located tests — always:**
```
adventures.service.ts
adventures.service.test.ts   ← same folder, same name + .test
```

**Test runners:**
- `apps/api` + `packages/`: Jest
- `apps/web` + `packages/`: Vitest
- Run via Turborepo: `turbo test`

**Coverage scope:**
- Unit tests: services, repositories, processors, utilities
- Integration tests: controllers (with mocked services)
- No E2E for MVP — deferred

---

### Data Format Rules

- Dates: ISO 8601 always → `"2026-03-01T14:30:00.000Z"` — NEVER Unix timestamps
- Coordinates: `{ lat: number, lng: number }` — NEVER `[lng, lat]` array
- Booleans: `true/false` — NEVER `1/0`
- API JSON fields: `camelCase` (even though DB columns are `snake_case`)

---

### BullMQ Job Queues

```typescript
// Queue names
'gpx-processing'
'density-analysis'

// Job definitions
{ name: 'parse-segment', data: { segmentId: string, storageUrl: string } }
{ name: 'analyze-density', data: { adventureId: string, segmentIds: string[] } }
```

**Job status — polling strategy (replaces Supabase Realtime):**
```typescript
// Pendant que parse_status === 'pending', poll toutes les 3s
useQuery({
  queryKey: ['adventures', adventureId, 'segments'],
  refetchInterval: (query) =>
    query.state.data?.some(s => s.parseStatus === 'pending') ? 3000 : false,
})
// Idem pour density_status sur l'adventure
```

---

### Package Import Rules

| Import | Source | NEVER |
|---|---|---|
| DB types (Adventure, Segment...) | `packages/database` | Redefine locally |
| Zod schemas | `packages/shared/schemas/` | Duplicate in app |
| GPX utilities (Haversine, RDP, corridor) | `packages/gpx` | Copy-paste in app |
| Shared types (POI, Weather...) | `packages/shared/types/` | Redefine locally |
| Constants (MAX_GPX_POINTS...) | `packages/shared/constants/` | Hardcode in app |

---

### RGPD — Geolocation Rule (CRITICAL)

**GPS position is NEVER sent to or stored on the server.**

- Live mode geolocation: `watchPosition()` client-side only
- Filtering POIs in live mode: computed client-side OR sent as anonymous bounding box (no exact position)
- The NestJS API MUST NOT log, store, or process raw GPS coordinates
- Consent modal (`<GeolocationConsent />`) required before activating Live mode

---

### Anti-Patterns to NEVER Implement

```typescript
// ❌ Raw JSON from controller
return { success: true, adventure: data }
// ✅ Return raw data — ResponseInterceptor wraps it
return data

// ❌ Drizzle query in service
const result = await db.select().from(adventures).where(...)
// ✅ In adventures.repository.ts
async findById(id: string) { return db.select().from(adventures).where(eq(adventures.id, id)) }

// ❌ Invented query key
useQuery({ queryKey: ['getAdventure', id] })
// ✅ Convention
useQuery({ queryKey: ['adventures', id] })

// ❌ Ambiguous coordinates array
{ coordinates: [2.3522, 48.8566] }
// ✅ Named object
{ lat: 48.8566, lng: 2.3522 }

// ❌ Zod schema duplicated in feature
const adventureSchema = z.object({ name: z.string() })  // in component
// ✅ Import from shared
import { adventureSchema } from '@ridenrest/shared/schemas'

// ❌ GPS position in API request body
POST /pois { lat: 48.8566, lng: 2.3522, ... }  // RGPD violation
// ✅ Bounding box only, or client-side filter
GET /pois?segmentId=xxx&fromKm=10&toKm=50  // no GPS
```

---

### Loading States — Required Patterns

- Server state loading: `isPending` from TanStack Query → always show `<Skeleton />`
- Long mutations (GPX upload): `useTransition` + progress indicator
- Async jobs: `useUIStore.pendingJobs` fed by TanStack Query polling (refetchInterval)
- NEVER block entire UI with a global spinner
- Live mode network error: show partial results + `<StatusBanner message="Connexion instable" />`

---

### External API Rate Limits (enforce in NestJS)

| API | Limit | Cache TTL |
|---|---|---|
| Overpass API (OSM) | Fair use, no formal limit | Redis 24h |
| WeatherAPI.com | 1M calls/month | Redis 1h per waypoint |
| Strava API | 100 req/15min, 1000/day | Import only, no polling |
| Geoapify (geocoding) | 3000 req/day | Redis 7d (stable data) |
| Redis (self-hosted) | Illimité (VPS) | N/A — pas de quota externe |

Rate limiting guard: `@nestjs/throttler` global on all NestJS endpoints.
Alert at 80% quota consumed (APIs externes uniquement).

---

### OSM Attribution (Required)

OpenFreeMap tiles use ODbL license — OSM attribution must be visible on all map views.
Component: `<OsmAttribution />` — always rendered, never hidden.

---

### Drizzle Migrations — MANDATORY Workflow (CRITICAL)

**NEVER write migration SQL files manually.** Always use `drizzle-kit generate`.

Every schema change (new table, new column, index, enum…) must follow this exact workflow:

```bash
# 1. Edit the schema file
packages/database/src/schema/{table}.ts

# 2. Generate the migration (auto-updates _journal.json)
cd packages/database && pnpm drizzle-kit generate

# 3. Verify the generated .sql file is correct

# 4. Commit both the schema file AND the generated migration
git add packages/database/src/schema/ packages/database/migrations/
git commit -m "feat(db): add {column} to {table}"
```

**Why this is critical:** `drizzle-kit migrate` (run automatically in `deploy.sh`) only applies migrations listed in `migrations/meta/_journal.json`. A manually-written `.sql` file that is NOT registered in the journal will NEVER be applied to the production database — resulting in missing columns and 500 errors.

**Anti-patterns:**
```bash
# ❌ Writing SQL directly
echo "ALTER TABLE adventures ADD COLUMN start_date date;" > migrations/0009_add_start_date.sql
# ← This bypasses the journal — will NEVER run in prod

# ❌ Editing _journal.json manually (error-prone, fragile)

# ✅ Always
cd packages/database && pnpm drizzle-kit generate
```

---

### Drizzle Pool Configuration

PostgreSQL runs locally on the VPS (Docker) — no external connection limit. Pool config in `apps/api/src/config/database.config.ts`:

```typescript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,                    // Good practice — sufficient for single-VPS setup
  idleTimeoutMillis: 30000,   // release idle connections after 30s
  connectionTimeoutMillis: 5000, // fail fast if DB unreachable
  // No SSL needed — localhost connection
})
```

**`max: 10`** remains a good default. The VPS PostgreSQL has no hard connection limit, but 10 is sufficient for the expected load.

---

### Email Provider: Resend

Better Auth uses **Resend** for transactional emails (password reset + email verification).

```typescript
// apps/web/src/lib/auth/auth.ts
import { Resend } from 'resend'
const resend = new Resend(process.env.RESEND_API_KEY)
// Free tier: 3000 emails/month — commercial ok
```

Required env var: `RESEND_API_KEY` in `apps/web/.env.local`
<!-- Ports: API → 3010, Web → 3011 (3000/3001 reserved by other projects) -->
From address: `Ride'n'Rest <noreply@ridenrest.app>`

---

### GPX File Access Control (Security)

GPX files are stored at `/data/gpx/{segmentId}.gpx` on the VPS disk.
**The UUID alone is NOT sufficient access control** (obscurity ≠ authorization).

**Rule: ALL GPX file access goes through NestJS with ownership verification.**

```typescript
// segments.service.ts — mandatory pattern for every file operation
async getSegmentFile(segmentId: string, userId: string): Promise<Buffer> {
  const segment = await this.segmentsRepository.findByIdAndUserId(segmentId, userId)
  if (!segment) throw new NotFoundException('Segment not found')
  return fs.readFile(`/data/gpx/${segmentId}.gpx`)
}
```

Apply this ownership-check pattern on:
- `POST /segments` (upload) → verify adventure belongs to user before saving
- `GET /segments/:id/gpx` (download) → verify ownership before reading disk
- `DELETE /segments/:id` → verify ownership before deleting file + DB record

NEVER expose a direct public URL to `/data/gpx/*.gpx`.

---

### VPS Deployment Config

**Architecture hybride** — Docker pour infra, Node.js natif pour apps :

```
VPS Hostinger KVM 2 (~$8/mois) — IP: 72.62.189.193
├── Docker: PostgreSQL+PostGIS :5432, Redis :6379, Caddy (SSL auto),
│           Uptime Kuma :3001, Plausible CE :8000 (+ ClickHouse + plausible-db)
└── PM2:    Next.js standalone (port 3011), NestJS (port 3010)
```

**Domaine** : `ridenrest.app` (migré depuis `ridenrest.com` le 2026-03-26)
- `ridenrest.app` → Next.js :3011
- `api.ridenrest.app` → NestJS :3010
- `stats.ridenrest.app` → Plausible CE :8000 (analytics, self-hosted)

**Deploy** : GitHub Actions → SSH → `deploy.sh` sur le VPS :
```
git pull → source .env → turbo build → copy static assets → drizzle-kit migrate → pm2 reload
```

**Fichiers clés :**
- `deploy.sh` — script de déploiement complet (6 steps)
- `ecosystem.config.js` — config PM2 + chargement `.env` via fs natif
- `turbo.json` — env vars déclarées pour invalidation cache (`NEXT_PUBLIC_*`)
- `.env` sur VPS — source de vérité des secrets (jamais commité)

**GitHub Actions secrets requis** : `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`

**GPX storage** : `/data/gpx/` sur le VPS (créé automatiquement par `deploy.sh`)

**Gotchas découverts en prod (2026-03-26) :**
- `.env` : pas de commentaires inline (`KEY=value # comment` → la valeur inclut le commentaire)
- `.env` : les valeurs base64 (`openssl rand`) contiennent `+/=` → TOUJOURS les wrapper en double quotes
- Turbo cache : les `NEXT_PUBLIC_*` doivent être dans `turbo.json#env` sinon le cache ignore les changements
- PM2 : les vars d'env doivent être dans la section `env` de l'app explicitement (pas juste `process.env`)
- Next.js standalone static : faire `rm -rf` avant `cp` pour éviter l'accumulation de chunks entre builds
- `deploy.sh` via SSH : `source .env` requis avant `turbo build` pour embarquer les `NEXT_PUBLIC_*`

**Gotchas ClickHouse / Hostinger KVM (2026-04-06) :**
- IPv6 désactivé → monter `clickhouse/ipv4-only.xml` (`<listen_host>0.0.0.0</listen_host>`)
- NUMA bloqué par seccomp → `cap_add: [SYS_NICE, IPC_LOCK]`
- Pas de `wget` dans alpine → health check via `clickhouse-client --query 'SELECT 1'`
- Premier boot : créer la DB ClickHouse + lancer les migrations Plausible manuellement

> Fly.io config moved to `_deprecated/` (14.7). `apps/api/Dockerfile` removed (14.7).

---

### Doc Sync Rule (CRITICAL)

**When implementing a change that deviates from the story or epics — due to a user request, a technical constraint, or a design decision made during implementation — the dev agent MUST update the relevant documents BEFORE or IMMEDIATELY AFTER implementing the change.**

Documents to keep in sync:
- `_bmad-output/planning-artifacts/epics.md` — update the AC or story description
- `_bmad-output/implementation-artifacts/{story-file}.md` — update tasks/subtasks/notes
- `_bmad-output/implementation-artifacts/sprint-status.yaml` — if scope changes

**Why this matters:** The code review agent uses the story file and epics as the source of truth. If the implementation diverges without updating the docs, the code review will flag it as incorrect and recommend a rollback — even if the change was intentional and validated by Guillaume.

**Never** leave a gap between what was implemented and what the docs describe.

---

### POI Search — Explicit Trigger Gate (`searchCommitted`)

POI searches (planning mode) are **never fired automatically**. The user must click "Rechercher".

- `useMapStore.searchCommitted: boolean` — gate, default `false`
- `setSearchRange()` resets `searchCommitted: false` on every slider move
- `setSearchCommitted(true)` also sets `searchRangeInteracted: true` (corridor highlight + weather panel)
- `use-pois.ts` returns empty `segmentRanges` when `!searchCommitted` → no TanStack Query fires
- `isPending` in `usePois` reflects **only real HTTP requests** (not slider movement)
- Button label is always **"Rechercher"** (never changes to "Mettre à jour")
- On SPA unmount (`map-view.tsx` cleanup): `setSearchCommitted(false)` prevents auto-search on back-navigation

### Overpass Opt-in (`overpassEnabled`)

Overpass API calls are **opt-in** — disabled by default for all users.

- `profiles.overpass_enabled boolean DEFAULT false` — persisted in DB
- NestJS: `GET /api/profile` + `PATCH /api/profile` — `ProfileModule`
- Frontend: `useProfile()` hook reads the flag, passes it to `getPois()` and `getLivePois()`
- Gate applies to **both planning and live mode**: when `overpassEnabled=false`, only Google Places (primary source) is used via DB cache; when `overpassEnabled=true`, Overpass complements Google Places results
- TQ query keys include `overpassEnabled` to avoid cache sharing between opt-in/opt-out
- Settings page: `OverpassToggle` component, section "Recherche de points d'intérêt"

### Map Interaction UX — Story 16.3 Patterns

#### `traceClickedKm` — Click-on-trace CTA

`useMapStore.traceClickedKm: number | null` stores the km position of a click on the GPX trace line. When non-null, `<TraceClickCta />` renders a floating mini-panel.

- Set by a click handler on layer `'trace-line-click-target'` (invisible 16px-wide line on top of `'trace-line'`) in `map-canvas.tsx`
- Guard: if `stageClickModeRef.current` is active, the click handler is a no-op
- Cleared on: ✕ button, Escape key, `searchCommitted` becoming `true`
- `TraceClickCta` uses `setSearchRange(clickedKm, clickedKm + rangeWidth)` — preserves the current range width from the store (`toKm - fromKm`)

**WeakMap cleanup pattern** — trace click handlers use the same `WeakMap<maplibregl.Map, handler>` pattern as `densityEventHandlers` for proper cleanup on style reload (keyed by `styleVersion`).

#### `MapCanvasHandle` / `LiveMapCanvasHandle` — Imperative Methods

`MapCanvasHandle` (planning, `map-canvas.tsx`) and `LiveMapCanvasHandle` (live, `live-map-canvas.tsx`) both expose zoom methods:

```typescript
// Both handles
resetZoom(): void           // fitToTrace with animate: true — called by ResetZoomButton

// Planning only
fitToCorridorRange(fromKm: number, toKm: number, segments: MapSegmentData[]): void
  // Zooms to waypoints in [fromKm, toKm] with 10% padding; fallback to fitToTrace if none found
```

Both `fitToTrace()` functions accept an optional `animate = false` parameter — always pass `true` for user-triggered zoom resets.

`<ResetZoomButton>` is rendered in **both** planning and live modes:
- Planning: `absolute bottom-20 right-4 z-10` (above `MapStylePicker` at `bottom-6`)
- Live: `absolute top-14 right-4 z-10` (below `MapStylePicker` at `top-4`; bottom-right is hidden under `LiveControls`)

#### Auto-zoom after POI search

In `map-view.tsx`, a `useEffect` detects the `isPending: true → false` transition (via `prevIsPendingRef`) while `searchCommitted === true`, then calls `mapRef.current?.fitToCorridorRange(mapFromKm, mapToKm, readySegments)`.

- `readySegments` is wrapped in `useMemo` (not computed inline) to avoid spurious re-renders
- `prevIsPendingRef` is reset to `false` in the effect cleanup (React Strict Mode safety) — **ON WEB ONLY**, where the effect deps are limited to `[isPending, searchCommitted]`, so the cleanup runs only on unmount / those two transitions.
- ⚠️ **Do NOT copy the cleanup-reset to an effect whose deps include frequently-changing values** (e.g. the mobile auto-zoom in `map/[id].tsx` depends on `[isFetching, searchCommitted, waypoints, fromKm, toKm, segments]`). There, React runs the cleanup **before every re-execution**, resetting `prev` to `false` right before the `true→false` transition check → the zoom never fires. On mobile the transition-detection ref is updated at the **end of the effect body** with **no cleanup reset**. (Regression introduced 2026-06-16 by a code review mechanically applying this web pattern; reverted.)
- The auto-zoom fires **once per search commit**, not on re-renders

#### MapSearchOverlay — Loading indicator

`<MapSearchOverlay visible={searchCommitted && poisPending} />` renders a centered semi-transparent overlay over the map canvas (not the full viewport).

- Uses `absolute inset-0` inside the relatively-positioned map wrapper → scoped to map, never covers sidebar
- `pointer-events-none` — no interaction blocking
- `z-20` — above map canvas, below sidebar (`z-10`) and POI popup (`z-40`)
- Do NOT use `fixed` positioning — that would cover the sidebar

#### `useMapStore` — Initial Range State

Store initializes `fromKm: 0, toKm: 15` (range = 15 km). The sidebar `<SearchRangeControl />` derives `rangeKm` directly from `toKm - fromKm`.

**Never use `toKm: 30` as initial value** — that was a legacy artifact that caused `TraceClickCta` to compute a 30km range width instead of 15km.

#### "Aucun résultat" — No-Results Banner

After a committed search returns zero POIs, an orange banner (`bg-orange-500/90 text-white backdrop-blur-sm`) is shown inside the map container.

**Planning mode** (`map-view.tsx`) — condition:
```ts
searchCommitted && !poisPending && !poisError
  && allPois.length === 0
  && readySegments.length > 0
  && visibleLayers.size > 0
```
Positioned `absolute bottom-20 left-1/2 -translate-x-1/2 z-30` — centered above map controls, below `TraceClickCta`.

**Live mode** (`live/[id]/page.tsx`) — condition:
```ts
isLiveModeActive && !poisFetching && !poisError
  && poisHasFetched      // data !== undefined — a real fetch completed at this queryKey
  && pois.length === 0
```
Positioned `absolute top-16 left-1/2 -translate-x-1/2 z-40` — above LiveControls panel (`bottom-0`, ~200px height). Not shown if offline or error banner is already visible.

**Why `hasFetched` instead of `searchTrigger > 0`**: With TanStack Query `enabled: false`, `data` stays `undefined` until the first fetch for that queryKey. Using `?? []` collapses `undefined` and `[]` into the same value, making it impossible to distinguish "never searched here" from "searched here, got nothing". `hasFetched = data !== undefined` is the correct gate. It also auto-resets when `targetKm` changes (new queryKey → new cache entry → `data = undefined`), so the banner hides correctly when the user moves the slider before re-searching.

**NEVER use `pois.length === 0` alone as a no-results indicator in live mode** — it's true before the first search too.

#### Repaint obligatoire après ajout de calques/images POI (règle durable, 2026-08-19)

Le placement des symboles MapLibre est calculé **dans le cycle de rendu**. Les hooks de calques POI (`use-poi-layers.ts`, `use-live-poi-layers.ts`) construisent leurs calques dans un `.then()` (l'enregistrement des images de pins est async) — donc **pendant** l'animation de caméra de l'auto-zoom post-recherche (`fitToCorridorRange`). Sans repaint explicite, la source et les calques contiennent les bons POI mais **rien n'est peint jusqu'à ce que l'utilisateur pan/zoome** : compteurs sidebar corrects, carte vide, indiscernable de « la recherche n'a rien trouvé ».

- **Terminer toute construction/mise à jour de calques POI par `map.triggerRepaint()`** (planning ET live).
- **`registerPoiPinImages` demande un repaint si au moins une image a été ajoutée** : un calque symbole qui a déjà rendu avec un `icon-image` manquant ne se redessine pas tout seul quand l'image arrive (cf. la dégradation silencieuse « pin invisible, pas d'erreur »).
- Symptôme à reconnaître : **un seul cran de zoom fait apparaître tous les pins d'un coup** → ce n'est pas un problème de données, c'est un repaint manquant.

#### Icons — lucide-react usage in map controls

| Element | Icon |
|---|---|
| Reset zoom button | `ZoomOut` |
| TraceClickCta km position | `MapPin` |
| MapSearchOverlay spinner | `Loader2` |

#### z-index Stack (map area)

| Element | z-index |
|---|---|
| Map canvas | base (z-0) |
| Map controls (ResetZoom, StylePicker) | z-10 |
| MapSearchOverlay | z-20 |
| Sidebar collapse toggle | z-20 |
| TraceClickCta | z-30 |
| POI popup | z-40 |

---

### Corridor Search — 50 km Max Range

POI search range is capped at **50 km max** (`toKm - fromKm ≤ 50`).

**Source de vérité unique : `MAX_SEARCH_RANGE_KM` dans `packages/shared/src/constants/gpx.constants.ts`.** Ne jamais redéclarer la valeur ailleurs — web (`search-range-control.tsx`, `search-range-slider.tsx`), mobile (`search-range-control.tsx`) et l'API (`find-pois.dto.ts` + validation service) l'importent tous.

Enforced at two levels:
1. **API**: DTO validation in `find-pois.dto.ts` + `PoisService.findPois` reject ranges > `MAX_SEARCH_RANGE_KM` with HTTP 400
2. **UI**: `<SearchRangeSlider />` / `<SearchRangeControl />` cap the range programmatically

**Historique** : la valeur était 30 km au design initial (2026-03), portée à 50 km en MOB-4.3 (2026-06-14) sans mise à jour de ce document — dérive corrigée le 2026-08-19. La justification d'origine (bbox Overpass trop large au-delà) reste un vrai risque : **la zone de recherche est le rectangle englobant** les waypoints de la plage, pas un couloir. Sur une plage de 50 km à trace sinueuse, ce rectangle peut couvrir plusieurs centaines de km² — d'où le filtre corridor à la lecture (voir ci-dessous). Si Overpass se remet à timeouter sur les grandes plages, réduire `MAX_SEARCH_RANGE_KM` est le premier levier.

---

### POI Search — Sources, Cache & Dédoublonnage (règles durables, 2026-08-19)

Quatre règles issues du RCA « mêmes résultats en ON/OFF, 0 résultat avec Overpass activé, local ≠ prod » (story 17.13). Toute évolution de `PoisService` doit les préserver.

#### 1. Overpass exige un `User-Agent` explicite

Le `fetch` global de Node (undici) **n'envoie aucun `User-Agent`**. Sans en-tête : `overpass-api.de` → **406 Not Acceptable**, `overpass.kumi.systems` → **429 « Please include a meaningful User-Agent string »**. Overpass était donc injoignable depuis l'API du 2026-03-29 au 2026-08-19 (dernier POI `source='overpass'` inséré : 29/03).

- `OverpassProvider` envoie toujours un UA identifiant (surchargeable via `OVERPASS_USER_AGENT`).
- **Toute rotation d'instance doit être exhaustive** : ne JAMAIS `throw` sur un statut inattendu depuis la boucle — un seul statut non prévu (406) suffisait à sauter les instances saines. Statut inconnu / erreur réseau / corps illisible → instance suivante. `429` → attente puis retry de la MÊME instance (file d'attente serveur), puis rotation.
- La même règle vaut pour toute autre API publique appelée en `fetch` depuis NestJS.

#### 2. Google Places est la source primaire — jamais conditionnée à Overpass

Overpass **complète** Google Places, il ne le précède pas. Le prefetch Google doit rester **en dehors** du `try` Overpass : quand il était dedans, un échec Overpass annulait aussi Google → « Overpass ON » renvoyait 0 POI sur un segment froid alors que « Overpass OFF » renvoyait des résultats (symptôme utilisateur : bandeau « Aucun résultat dans cette zone » uniquement quand l'option est activée).

#### 3. Le cache se gate sur la COUVERTURE, pas sur « ai-je un résultat à afficher ? »

Interdit : `const cached = await findCachedPois(...); if (cached.length > 0) return cached`. Cette condition gèle un jeu partiel pour toute la TTL (7 j) : en prod, une première recherche sur `[86,89]` km a inséré des POI se projetant à 89–93 km (la bbox est un rectangle, la trace y revient), et **toutes** les fenêtres suivantes contenant une de ces lignes — `[80,95]`, `[83,93]`… — ont renvoyé ces 8 résultats sans jamais rappeler Google. D'où « même trace, résultats différents » entre environnements : c'est la première fenêtre recherchée qui décide.

Règle : marqueur Redis `pois:google:seg:{segmentId}:bbox:{minLat}:{minLng}:{maxLat}:{maxLng}` (TTL = `GOOGLE_PLACES_CACHE_TTL`), posé **après** un prefetch complet.
- **Scope par segment obligatoire** : les lignes sont insérées par `segment_id`, une clé bbox seule ferait hériter « déjà cherché » au segment d'un autre user, qui resterait vide.
- **Marqueur non posé si un layer a échoué** (`{ complete: false }`) → la zone retente au lieu d'être verrouillée 7 jours.

#### 4. Dédoublonnage cross-source uniquement + correspondance de nom

`findNearbyPoisFromOtherSources(lat, lng, POI_DEDUP_RADIUS_M, segmentId, 'google')` + `isLikelySamePlace(nom, nom)` (`poi-dedup.ts`).

L'ancien garde-fou (`hasNearbyPoi`, 100 m, agnostique de la source) supprimait des établissements bel et bien distincts : les 4 layers du prefetch tournant en `Promise.allSettled`, il dédoublonnait les POI Google **entre eux** (8 hébergements sur 10 jetés dans un village suisse, le survivant dépendant de l'ordre d'exécution → non déterminisme entre environnements). Deux POI Google ne peuvent pas être doublons : `place_id` unique + index `uq_accommodations_cache_segment_external_source`.

#### 5. Filtre corridor à la lecture

`findCachedPois` filtre `dist_from_trace_m <= CORRIDOR_WIDTH_M` (3000 m) en plus de la plage km. Sans ce filtre, l'affichage héritait de la forme du **rectangle** de recherche : des POI à 4+ km de la trace apparaissaient, et le jeu résultant variait avec la fenêtre demandée. `findPoisNearPoint` (live) n'est PAS concerné — sa sémantique est un rayon autour d'un point, pas un couloir.

#### 6. Les filtres de tags OSM doivent être restrictifs par défaut

`CATEGORY_FILTERS` (`overpass.provider.ts`) est un `Record<string, string[][]>` : chaque variante est une **liste de prédicats ANDés** (`node["a"="b"]["c"~"d"](bbox);`). C'est ce qui permet de qualifier un tag trop générique.

Cas de référence : `amenity=shelter` seul renvoyait **241 abribus sur 294 éléments** (`shelter_type=public_transport`, 237 sans nom) → « Refuge / Abri (189) » sans presque aucun abri exploitable. On exige donc un `shelter_type` dans `SLEEPABLE_SHELTER_TYPES` ; les refuges de montagne passent par `tourism=alpine_hut|wilderness_hut`.

Deux règles qui en découlent :
- **`resolveCategory` (`pois.service.ts`) doit rester aligné sur `CATEGORY_FILTERS`.** Sinon un élément remonté via un autre tag est reclassé dans la catégorie qu'on vient d'exclure — ou, pire, tombe dans le `return 'hotel'` final.
- **Avant d'élargir un filtre OSM, mesurer la composition réelle des tags** sur une bbox représentative (`select raw_data->>'…', count(*) … group by 1`). Un tag OSM générique est presque toujours dominé par un usage qui n'est pas le nôtre.

⚠️ **En cas de changement d'un filtre de tags, purger les clés Redis `pois:bbox:*` / `pois:live:bbox:*`** : elles stockent les POI **bruts** de l'ancienne requête (TTL 30 j) et les ré-insèrent au prochain cache HIT, annulant le nouveau filtre. Purger aussi les lignes `accommodations_cache` devenues hors-critère.

#### 7. Une option « source de données » doit filtrer À LA LECTURE, pas seulement à la collecte

`overpassEnabled=false` ne faisait que sauter l'appel Overpass. Les POI `source='overpass'` déjà en cache (TTL **30 j**, contre 7 j pour Google) continuaient d'être renvoyés → dès qu'une zone avait été cherchée une fois avec l'option active, ON et OFF donnaient **exactement** le même jeu, et l'option paraissait ignorée (retour utilisateur 2026-08-19).

Règle : `findCachedPois` / `findPoisNearPoint` prennent un `excludeSources: string[]`, et le service passe `OVERPASS_SOURCES` quand l'option est OFF. Toute future option de source (Amadeus, autre fournisseur) doit suivre le même schéma : **gate sur la collecte + filtre sur la lecture**. Ordre de grandeur mesuré sur une fenêtre de 15 km : ON = 66 POI, OFF = 16.

#### 8. I/O externes en lot : concurrence bornée, jamais de série ni de `Promise.all` nu

Le prefetch Google enchaînait ses Place Details un par un (`for … await`) : 50 à 90 allers-retours HTTP séquentiels sur une bbox froide, soit 10-25 s — la vraie raison de la lenteur de la première recherche d'une zone (les 4 calques étaient parallèles, pas les POI à l'intérieur).

Utiliser `mapWithConcurrency(items, limit, fn)` (`apps/api/src/common/utils/`) : ordre d'entrée préservé, limite clampée à ≥ 1. Un `Promise.all` non borné est aussi à éviter (quotas fournisseur + chaque item fait ici une requête PostGIS). Limite actuelle : `GOOGLE_DETAILS_CONCURRENCY = 6`. Corollaire : préférer **une insertion batchée** par lot à un INSERT par élément.

⚠️ Prérequis à toute parallélisation de ce prefetch : le dédoublonnage doit être **indépendant de l'ordre** (cf. règle 4, cross-source uniquement). Avec l'ancien dédoublonnage par simple proximité, paralléliser aurait rendu le résultat encore plus aléatoire.

#### 9. Un flag de profil qui pilote une requête doit gater sur `ready`, jamais se replier sur une valeur par défaut

`const overpassEnabled = profile?.overpassEnabled ?? false` est correct pour **afficher** un toggle, et faux pour **déclencher une requête** : pendant le chargement du profil le flag vaut `false`, donc une 1re requête part avec la mauvaise valeur, puis une 2e part avec la bonne (nouvelle clé TanStack Query). Coût constaté le 2026-08-19 : prefetch Google complet inutile, résultat OFF rendu en premier, et après un toggle le jeu OFF déjà en cache client réaffiché **instantanément à l'identique** → option perçue comme totalement inopérante.

Règle : exposer un helper `useOverpassEnabled(): { overpassEnabled, ready }` et gater le déclencheur (`enabled`, `canSearch`, construction des queries) sur `ready`.
- `ready = isSuccess || isError || fetchStatus === 'paused'` — inclure **error** (repli explicite) et **paused** (hors-ligne sans profil en cache), sinon la recherche est bloquée indéfiniment.
- Faire porter l'attente par l'indicateur de chargement (`isPending`), sinon l'écran annonce « aucun résultat » le temps que le profil arrive.
- Les 4 points concernés : web `use-pois` / `use-live-poi-search`, mobile `map/[id].tsx` / `use-live-poi-search`. Les usages d'affichage seul gardent `?? false`.

Vaut pour tout futur flag de profil (unités, devise, tier) consommé par une requête.

#### 11. Google Places : le SKU se décide dans le field mask, et un appel Text Search amortit 20 POI

Google facture **au SKU le plus élevé des champs demandés**. Deux conséquences structurantes.

**Le prefetch carte n'appelle plus Place Details du tout.** `searchLayerPlaces` demande `places.id,places.displayName,places.location,places.types,nextPageToken` — SKU **Text Search Pro** (32 $/1000, 5 000 gratuits/mois) — soit exactement les quatre champs nécessaires à un pin, pour 20 POI par appel facturé. Un Place Details, lui, n'en amortit qu'un. Mesuré sur une bbox froide réelle :

| | appels facturés | coût | POI | coût/POI | bboxes froides gratuites/mois |
|---|---|---|---|---|---|
| avant (IDs Only + un Place Details par POI) | 32 | 0,16 $ | 32 | 0,0050 $ | ~312 |
| après (Text Search Pro paginé) | 10 | 0,32 $ | 114 | **0,0028 $** | **~500** |

`getPlaceDetails` (SKU **Place Details Pro**) ne sert plus qu'à **l'ouverture d'une fiche POI** : note, horaires, téléphone, site. Clé Redis `google_place_details:{placeId}`.

**⚠️ Le chemin « comptage » doit rester en IDs Only, gratuit.** `searchLayerPlaceIds` (masque `places.id,nextPageToken`) est consommé par l'analyse de densité, qui découpe l'aventure en tronçons de 10 km et appelle une fois par tronçon **et par type** : une aventure de 837 km = 84 tronçons × 16 types = **1 344 requêtes pour une seule analyse**. Basculer cette méthode sur le masque Pro coûterait ~43 $ et 27 % du quota gratuit mensuel par analyse — pour une donnée dont le processeur ne lit que « 0, 1, ou ≥ 2 ». Ne jamais ajouter `location`, `displayName` ou `types` à ce masque, et ne pas y activer la pagination.

#### 11b. `includedType` ne filtre pas — le `textQuery` décide, et il se calibre par type

Google score d'abord par **pertinence textuelle** : un `textQuery` qui ne colle pas au `includedType` écrase le résultat, silencieusement. Avec l'ancien `textQuery` unique par calque (`"accommodation"`), mesuré sur une bbox Alsace/Vosges :

| `includedType` | avec `"accommodation"` | avec une requête adaptée |
|---|---|---|
| `campground` | **0** | **10** (`"camping"`) |
| `motel` | **0** | **3** (`"motel"`) |
| `hostel` | 1 | 2 (`"auberge de jeunesse"`) |

Zéro camping et zéro motel sur 50 km, pour une app de bikepacking — et le même défaut faussait l'**analyse de densité**, qui signalait « gap critique » un tronçon ne contenant que des campings. Source de vérité : `TYPE_TEXT_QUERY` dans `google-places.provider.ts`.

L'inverse est vrai aussi : **trop spécifique tue le résultat** (`"camping caravaneige"` → 0). Il faut une requête courte et naturelle, proche de ce qu'un humain taperait. Avant d'ajouter un type, mesurer sa réponse réelle sur une bbox représentative — le Text Search en IDs Only est gratuit et illimité, donc la sonde ne coûte rien.

**Suivre le `nextPageToken`** sur le chemin d'affichage : `lodging` sature à 20 résultats en renvoyant un token, ignoré pendant 5 mois. Union des 16 types sur une page = 32 `place_id` ; avec pagination = 114. Plafond Google : 20 par page, 60 par type, et `maxResultCount` est plafonné à 20 côté serveur quoi qu'on demande.

#### 13. Avant de conclure qu'un correctif ne marche pas, vérifier que c'est bien lui qui tourne

Le 2026-08-20, une régression a été diagnostiquée à tort : « le nouveau code trouve moins de
campings que l'ancien ». En réalité le serveur local exécutait le code de la veille —
`nest start --watch` n'avait pas repris les modifications et le process tournait depuis 16 h.
Le test ne mesurait donc rien du correctif, et la conclusion était inversée.

Trois signaux, à vérifier **avant** d'ouvrir un RCA, et non après :

1. **Une signature de log propre au nouveau code.** Ici l'ancien loguait `layer=X → N place_ids`,
   le nouveau `layer=X → N lieux (Text Search Pro, paginé)`. Écrire cette différence
   intentionnellement dans tout changement de chemin critique rend la vérification triviale.
2. **Un effet de bord observable côté état.** Le format des marqueurs Redis avait changé
   (`:layer:` ajouté) : `0` clé au nouveau format prouvait qu'aucun prefetch récent n'était passé
   par le nouveau code.
3. **L'ancienneté du process** (`ps -eo pid,etime`). Un uptime antérieur à la modification
   suffit à invalider le test.

Corollaire : les mesures faites dans le navigateur ou l'app ne valent que si l'on sait quel
binaire répond. Sur ce projet, `pnpm sim` (mobile) et le redémarrage explicite de l'API sont
plus fiables que le rechargement à chaud.

---

#### 12. Un réglage que l'utilisateur possède déjà ailleurs ne doit pas être une constante en dur

Le corridor de planning valait **3 km, en dur et invisible**, alors que le mode live laissait
choisir son rayon depuis MOB-5.3 (défaut 5 km, jusqu'à 20). L'app était plus généreuse sur le
vélo qu'au bureau, et ne laissait ajuster que là où c'est le moins pratique. Corrigé le
2026-08-20 : `radiusKm` de bout en bout, `MAX_SEARCH_RADIUS_KM = 20` partagé par les deux modes.

Symptôme qui l'a révélé : un camping à **3 263 m** de la trace, écarté pour 263 m, avec
« Camping (0) » à l'écran — indiscernable d'une absence réelle. Le premier correctif comptait
les exclus et l'annonçait ; **approche abandonnée** — un message qui dit qu'un résultat existe
puis refuse de le montrer est plus frustrant que le silence, surtout quand la donnée est déjà en
base et que l'afficher ne coûte **aucun appel externe** (le filtre est une clause `WHERE`).

**Une constante par décision.** Trois désormais, dans `packages/shared/src/constants/gpx.constants.ts` :

| constante | décision | où |
|---|---|---|
| `POI_BBOX_BUFFER_M` | largeur par défaut de la zone **interrogée** | `pois.service.ts` |
| `CORRIDOR_WIDTH_M` | seuil d'**affichage** par défaut | `pois.repository.ts` |
| `DEFAULT_SEARCH_RADIUS_KM` / `MAX_SEARCH_RADIUS_KM` | ce que l'utilisateur **choisit** | stores web et mobile |

**Le rayon pilote collecte ET affichage, jamais l'un sans l'autre.** Les découpler afficherait un
sous-ensemble arbitraire : la bbox est un rectangle, sa couverture lointaine dépend de la forme
de la trace et pas d'un couloir régulier. Mesuré : 228 POI entre 3 et 4 km, 29 entre 7 et 8 —
la décroissance traduit une recherche moins bonne au loin, pas une absence d'hébergements.
Depuis la story 17.15 cet élargissement est quasi gratuit (un appel Text Search Pro amortit
20 POI), donc le principal argument contre a disparu.

**Changer le rayon dégage `searchCommitted`.** Sinon on afficherait le jeu de l'ancien rayon en
laissant croire qu'il correspond au nouveau.

⚠️ **`findPoisNearPoint` (live) garde sa sémantique de rayon autour d'un point** — pas un couloir
le long d'une trace. Ne pas y transposer la logique corridor.

**Corollaire d'API** : le `ResponseInterceptor` place la charge utile **directement** dans `data`.
Ajouter un champ à une réponse existante transforme donc `data` d'un tableau en objet et casse
les **binaires mobiles déjà distribués**, qui parlent à l'API de prod. Tout nouveau besoin
d'information passe par un **endpoint séparé** ou un **paramètre optionnel** — jamais par un
enrichissement en place. C'est pourquoi `radiusKm` est optionnel et retombe sur 3 km.

---

#### 13. Avant de conclure qu'un correctif ne marche pas, vérifier que c'est bien lui qui tourne

Le 2026-08-20, une régression a été diagnostiquée à tort : « le nouveau code trouve moins de
campings que l'ancien ». En réalité le serveur local exécutait le code de la veille —
`nest start --watch` n'avait pas repris les modifications et le process tournait depuis 16 h.
Le test ne mesurait donc rien du correctif, et la conclusion était inversée.

Trois signaux, à vérifier **avant** d'ouvrir un RCA, et non après :

1. **Une signature de log propre au nouveau code.** Ici l'ancien loguait `layer=X → N place_ids`,
   le nouveau `layer=X → N lieux (Text Search Pro, paginé)`. Écrire cette différence
   intentionnellement dans tout changement de chemin critique rend la vérification triviale.
2. **Un effet de bord observable côté état.** Le format des marqueurs Redis avait changé
   (`:layer:` ajouté) : `0` clé au nouveau format prouvait qu'aucun prefetch récent n'était passé
   par le nouveau code.
3. **L'ancienneté du process** (`ps -eo pid,etime`). Un uptime antérieur à la modification
   suffit à invalider le test.

Corollaire : les mesures faites dans le navigateur ou l'app ne valent que si l'on sait quel
binaire répond. Sur ce projet, `pnpm sim` (mobile) et le redémarrage explicite de l'API sont
plus fiables que le rechargement à chaud.

---

#### 12. Un filtre qui exclut doit le dire, et une constante ne doit gouverner qu'une décision

Deux règles issues du même incident : un camping à **3 263 m** de la trace, écarté par le filtre
corridor à 3 000 m — pour 263 mètres — avec « Camping (0) » à l'écran, indiscernable d'une
absence réelle.

**Une exclusion silencieuse est un défaut, pas une optimisation.** C'est la même forme que la
panne Overpass restée invisible cinq mois : l'utilisateur ne peut pas distinguer « il n'y a
rien » de « quelque chose a été écarté juste au-delà de la limite ». Volumétrie mesurée :
**599 POI** en base au-delà de 3 000 m (469 Google, 130 Overpass), collectés puis masqués sans
un mot. `GET /pois/near-miss-count` + `NearMissNotice` (web et mobile) le disent désormais.
Toute future règle de filtrage à la lecture doit prévoir comment elle se rend visible.

**Une constante par décision.** `CORRIDOR_WIDTH_M` gouvernait à la fois le tampon de la bbox
envoyée aux fournisseurs externes et le seuil d'affichage — donc impossible d'élargir l'un sans
l'autre. Trois constantes désormais, dans `packages/shared/src/constants/gpx.constants.ts` :

| constante | décision | où |
|---|---|---|
| `POI_BBOX_BUFFER_M` | largeur de la zone **interrogée** chez Google/Overpass | `pois.service.ts` |
| `CORRIDOR_WIDTH_M` | seuil d'**affichage** d'un POI | `pois.repository.ts` (`findCachedPois`) |
| `POI_NEAR_MISS_MAX_M` | borne du **signalement** des masqués | `countNearMissPois` |

Les trois valent 3 000 / 3 000 / 6 000 : la séparation n'a rien changé au comportement, elle a
rendu les leviers indépendants.

⚠️ **`findPoisNearPoint` (live) n'est PAS concerné** : sa sémantique est un **rayon autour d'un
point**, pas un couloir le long d'une trace. La notion de quasi-manqué corridor n'y a pas de
sens, et y appliquer le filtre supprimerait des POI que le live veut légitimement.

**Corollaire d'API** : le `ResponseInterceptor` place la charge utile **directement** dans `data`.
Ajouter un champ à une réponse existante transforme donc `data` d'un tableau en objet et casse
les **binaires mobiles déjà distribués**, qui parlent à l'API de prod. Un nouveau besoin
d'information passe par un **endpoint séparé**, jamais par un enrichissement en place.

---

#### 10. Deux sources de latences incomparables ⇒ deux flux, jamais une attente commune

Google Places répond en ~200 ms (bbox déjà prefetchée) à ~2 s (froide) ; Overpass a été mesuré entre **1 s et 31 s** sur les instances publiques, avec des 504 et des instances mortes — et il n'existe aucun plan B en ligne fiable. Les attendre ensemble fait payer à chaque utilisateur le pire des deux.

- L'API accepte `source=google|overpass` : une requête par source, `resolveSourcePlan()` décide de ce qu'on interroge **et** de ce qu'on masque à la lecture. Sans le paramètre, comportement combiné historique (contrat du mobile, non découplé).
- Côté client, **`isPending` ne suit que la source primaire**. Overpass ne doit retenir ni le premier affichage, ni l'auto-zoom, ni les squelettes de calque. Idem `hasError` : un échec Overpass donne des résultats *partiels*, pas une recherche en erreur.
- **Parité sur les 4 points, nommés.** Une règle qui dit « parité obligatoire » se contourne sans que personne le remarque : c'est exactement ce qui est arrivé le 2026-08-19, où le découplage a été livré web-only alors que cette règle existait déjà. Les points d'application sont donc listés, et se vérifient en une commande :

| plateforme | planning | live |
|---|---|---|
| web | `apps/web/src/hooks/use-pois.ts` | `apps/web/src/hooks/use-live-poi-search.ts` |
| mobile | `apps/mobile/src/hooks/use-pois.ts` | `apps/mobile/src/hooks/use-live-poi-search.ts` |

  Les quatre émettent une requête par source, exposent `overpassPending` / `overpassError`, et montent `ExtendedSearchStatus` (`apps/web/src/app/(app)/map/[id]/_components/extended-search-status.tsx`, `apps/mobile/src/components/map/extended-search-status.tsx`). En live c'est le plus critique — l'utilisateur est sur son vélo et n'attendra pas 30 s devant un écran figé.
- Corollaires à ne pas oublier quand on touche à cette zone :
  - l'**auto-zoom** se déclenche sur la source primaire uniquement — le rejouer à l'arrivée d'Overpass ferait sauter la carte sous les doigts de l'utilisateur ;
  - la bannière **« Aucun résultat »** exige `!overpassPending` : Google peut renvoyer 0 alors qu'Overpass va en ramener 50 ;
  - une source lente qui travaille en silence est un piège UX (c'est ce silence qui a masqué 5 mois de panne Overpass) → `ExtendedSearchStatus` annonce l'attente, la lenteur au-delà de 5 s, et l'échec.
- **Ne pas raccourcir les timeouts** pour compenser une UI bloquante : régler l'UI, puis laisser la source lente prendre son temps. Le budget global (`OVERPASS_TOTAL_BUDGET_MS`) protège le serveur (connexions tenues), pas l'utilisateur.

---

### Button Component — Tailles réelles (custom, pas shadcn standard)

Le composant `Button` dans ce projet a des tailles différentes du shadcn/ui standard :

| size | height | usage |
|------|--------|-------|
| `default` | `h-8` (32px) | Usage général UI |
| `sm` | `h-7` (28px) | Petits boutons inline |
| `lg` | `h-11` (44px) | **WCAG touch target** — dialogs, CTAs principaux |

**Règles dialog** :
- Tous les boutons dans un `DialogFooter` (CTA primaire ET "Annuler") → `size="lg"`
- `DialogFooter` a `[&_button]:min-h-[44px]` comme filet de sécurité automatique
- Ne jamais utiliser `className="rounded-full px-6 py-6"` sur des boutons dialog — crée une incohérence visuelle avec les autres dialogs

### UI Components — Card (story 16.6)

`Card`, `CardHeader`, `CardContent` disponibles dans `@/components/ui/card` :
- Usage : pages settings, listes avec sections (même design language que adventures list)
- `Card` accepte `className` pour override (ex: `className="border-destructive"`)
- Composants internes (StravaConnectionCard, OverpassToggle…) ne doivent PAS avoir leur propre `rounded-lg border` wrapper si wrappés dans une Card

### SectionTooltip — Tooltips sidebar (story 16.6)

`SectionTooltip` dans `@/components/shared/section-tooltip` :
- Hover desktop → tooltip immédiat
- Long-press mobile (≥500ms, `pointerType === 'touch'`) → tooltip
- Affiche automatiquement un `Info` icon (lucide) pour indiquer qu'une tooltip existe
- Pattern : wrapper le div icon+titre uniquement, pas le chevron collapse

---

### POI Color System (story 16.11)

Source de vérité : `packages/shared/src/constants/poi-colors.ts`
- `POI_CATEGORY_COLORS` — couleur par PoiCategory (pins + chips)
- `POI_LAYER_COLORS` — couleur représentative par MapLayer (boutons filtre)
- `POI_CLUSTER_COLOR = '#2D6A4A'` — vert brand, unifié tous clusters
- Ne jamais hardcoder une couleur POI dans un composant — toujours importer depuis shared
- Couleurs dynamiques UI : style inline uniquement (jamais `bg-[${color}]` Tailwind)

Pins sur carte : SVGs complets (goutte + icône) fournis par Guillaume, chargés via `map.addImage()`
- Factory : `apps/web/src/lib/poi-pin-factory.ts`
- SVGs : `apps/web/public/images/poi-icons/{key}.svg` (viewBox 0 0 40 50, fond transparent, pointe en bas)
- `icon-anchor: 'bottom'` obligatoire dans le layer symbol
- Taille de rastérisation : **120×150** avec `pixelRatio: window.devicePixelRatio` → 60×75 CSS px — net sur Retina
- Dégradation gracieuse si SVG manquant (pin invisible, pas d'erreur)
- `registerPoiPinImages` est async — pattern `void fn().then(() => { if (cancelled) return; /* add layers */ })`
- ⚠️ Race condition : double `hasImage` check obligatoire — une fois avant le `await loadSvgImage()`, une fois après (deux hooks peuvent appeler `registerPoiPinImages` en parallèle)

Filtres live mode (`use-live-poi-search.ts`) :
- `categories` passées à l'API = `visibleLayers` × `activeAccommodationTypes` (pour accommodations seulement)
- `categories` **exclu du queryKey** — la recherche est toujours explicite (`refetch()`), exclure évite que le changement de filtre efface les compteurs affichés avant re-search
- Chips `AccommodationSubTypes` : prop `onlyCountActive` — masque le badge `(0)` pour les types non recherchés (live mode uniquement)

Popup POI (`poi-popup.tsx`) :
- **Fermeture au clic extérieur** : `map.on('click', handleMapClick)` enregistré tant que le popup est monté. Guard `queryRenderedFeatures(e.point).some(f => f.layer.id.endsWith('-points') && !f.properties?.point_count)` — ne ferme pas si un pin individuel a été cliqué (un autre POI s'ouvre). MapLibre ne fire pas `click` sur un drag → pas de logique drag supplémentaire.
- **Stabilité handler** : `onCloseRef` (ref mise à jour chaque render) dans le `useEffect` — évite de re-enregistrer le listener map à chaque changement d'identité de `onClose`.
- **Recentrage automatique sur clic pin** (hooks `use-poi-layers` + `use-live-poi-layers`) : `map.easeTo({ center: coordinates, offset: [0, 100], duration: 300 })` dans `handlePoiClick` — positionne le pin 100px sous le centre du viewport, laissant la moitié supérieure pour le popup. `easeTo` programmatique ne déclenche pas la détection de pan manuel du suivi GPS live.

---

## Mobile App — Expo / React Native Rules

> Source de vérité opérationnelle : `apps/mobile/AGENTS.md` (toolchain native).
> Cette section résume les règles que l'agent rate le plus souvent.

### Stack mobile

| Layer | Techno | Version | Note |
|---|---|---|---|
| Runtime | Expo SDK | **56** (pinné `~56.x`) | Docs versionnées : https://docs.expo.dev/versions/v56.0.0/ |
| RN | react-native | 0.85.3 | React 19.2.3 (aligné web) |
| Routing | expo-router | ~56 | File-based, groupes `(app)` / `(auth)` |
| Styling | NativeWind | 4.2.5 | Tailwind **v3** (`tailwindcss@3.4`), preset `@ridenrest/design-tokens` |
| Carte | @maplibre/maplibre-react-native | 11.3.4 | API Camera v10/v11 — breaking changes |
| Auth | better-auth + @better-auth/expo | **1.5.5 exact** | Tokens en `expo-secure-store` uniquement |
| Data | TanStack Query + persist (AsyncStorage) | 5.x | Cache offline |
| i18n | i18next + react-i18next | 26 / 17 | — |
| Reanimated | react-native-reanimated | 4.3.1 | + react-native-worklets 0.8.3 |

### Toolchain native (CRITIQUE)
- Build iOS local exige **Xcode 26.4** (deployment target 16.4). Vérifier `xcodebuild -version` avant tout `run:ios`.
- `expo start` = sert le bundle JS (pas de natif). `expo run:ios` / `eas build` = compile le natif.
- **Après ajout d'un module natif** (`expo-secure-store`, `react-native-svg`, netinfo…) ou changement de plugins `app.config.ts` : `npx expo prebuild --clean -p ios` **OBLIGATOIRE** avant `run:ios`, sinon `Cannot find native module` au boot.
- Toute icône **lucide-react-native / SVG dépend de `react-native-svg` (natif)** → pas de rendu sans rebuild du dev client (boîtes roses "Unimplemented component: RNSVG…").
- **Tester en local = `pnpm sim` (build standalone, le flux STABLE).** Produit un build Release avec bundle JS embarqué → app autonome, **zéro Metro** (donc zéro « Cannot find native module » / « Could not connect to development server »). L'agent lance `pnpm sim` en fin de dev ; l'humain rouvre juste l'app. Prérequis : backend local up + ATS localhost (déjà dans `app.config.ts`). Détails + flux alternatif Fast Refresh : `apps/mobile/AGENTS.md` §« Tester l'app sur simulateur ». (Validé 2026-06-27.)

### Tests — JAMAIS sous `src/app/` (CRITIQUE)
- expo-router bundle TOUT `.[tj]sx` sous `src/app` via `require.context` (regex figée, non configurable). Un `*.test.tsx` placé là casse `expo export`.
- Tests qui **importent une route** → `src/__tests__/`. Tests logique/composants → co-localisés (`src/lib/**`, `src/components/**`).
- Runner : Jest + jest-expo + `@testing-library/react-native`.
- Mocks auth : mocker le wrapper `@/lib/auth/client` (pas `@better-auth/expo`). **Pas de JSX RN dans une factory `jest.mock`** (le transform NativeWind injecte une variable hors-scope interdite) → `jest.fn(() => null)`.

### Auth mobile
- `better-auth@1.5.5` + `@better-auth/expo@1.5.5` **pinnés exact, alignés sur le serveur** (`apps/web`). Ne jamais bumper sans monter le serveur (peer strict, casse les sessions web prod).
- Tokens **toujours** en `expo-secure-store` (Keychain/Keystore) — **jamais** `AsyncStorage` (présent en dep transitive, interdit pour l'auth).
- Guard d'auth **centralisé** dans `src/app/(app)/_layout.tsx` — un seul point, jamais par écran.
- Deep link scheme custom `ridenrest://` → nécessite un dev build (Expo Go ne gère pas les schemes custom).

### Façade API mobile (CRITIQUE)
- L'API NestJS monte tout sous le préfixe global `/api`. `apiFetch` préfixe **déjà** (`API_BASE = ${EXPO_PUBLIC_API_URL}/api`).
- → Les façades utilisent des chemins **propres** (`/adventures`, **PAS** `/api/adventures`). `EXPO_PUBLIC_API_URL` = hôte seul (`http://localhost:3010`).

### Data mobile — TanStack Query : états offline & polling (CRITIQUE)

Patterns durables issus de MOB-4.1 (vues carte/data). À suivre pour MOB-4.2→4.8 et tout écran consommant `useQuery`.

- **`fetchStatus: 'paused'` hors-ligne** : le QueryClient mobile utilise `networkMode: 'online'` (défaut) + `onlineManager` bridgé sur NetInfo (`use-app-state-refetch.ts`). Hors-ligne **sans donnée en cache**, une query reste `fetchStatus: 'paused'` avec `status: 'pending'` → **`isPending` est vrai indéfiniment**.
  - ⇒ Tout overlay de chargement DOIT garder `query.isPending && query.fetchStatus !== 'paused'`. Sinon **skeleton infini** hors-ligne (bug réel corrigé en MOB-4.1).
  - En `paused`/sans données, retomber sur l'état vide ou un message offline non bloquant — jamais le skeleton.
- **Précédence des états (écran à polling)** : ordre obligatoire des branches de rendu : `loading (isPending && !paused) → error (isError && !data) → parsing (isXxxParsing(data)) → vide (!ready) → contenu`. Oublier la branche **parsing** affiche à tort « ajoutez un segment » pendant un parse en cours (polling actif).
- **Polling conditionnel** : helper pur `xxxPollInterval(data)` branché sur `refetchInterval` — `3000` ms tant qu'une ressource est `pending`/`processing`, `false` sinon (arrêt auto). Parité `segmentsPollInterval` / `mapPollInterval`.
- **Offline N1** : la trace/donnée reste affichable hors-ligne via la persistance TanStack Query (AsyncStorage, `gcTime` ≥ `maxAge` 24 h). Le fond de carte (tuiles), lui, peut être indisponible — dégradation acceptée MVP (bandeau non bloquant).
- **Durcissement des params de route** : `const id = (rawId ?? '').trim()` avant tout usage — un `id` blanc (deep link `…/%20`) passe `!id` ET `Boolean(id)` et déclenche une requête malformée. Trimmer puis gater (`enabled: Boolean(id)`).

### Carte MapLibre Native — GeoJSON à coordonnées finies OBLIGATOIRE (CRITIQUE)

MapLibre **Native** parse la GeoJSON via `mapbox::geojson` (C++) qui **lève une exception
C++ non rattrapée → `SIGABRT` (crash dur de l'app)** dès qu'une coordonnée est non
numérique (`null`/`NaN`/`±Infinity`) — **un seul point GPX corrompu suffit**. MapLibre GL
**JS** (web) tolère et ignore silencieusement → symptôme classique « **ok sur le web,
crash sur iOS** » à l'ouverture de *certaines* aventures. Signature du crash report iOS :
`__cxa_throw` → `MapLibre` → `-[MLRNGeoJSONSource setShape:]` → `std::terminate` → `abort`.

- **Toute** coordonnée passée à un `<GeoJSONSource>` ou `<Marker lngLat>` DOIT être filtrée
  par `isValidLngLat(lng, lat)` (`src/lib/map/maplibre-config.ts`) AVANT de bâtir la feature.
- Filtrer **au niveau du point** (pas seulement « segment ≥ 2 waypoints »), puis re-vérifier
  `coords.length >= 2` (une LineString peut retomber sous 2 points valides après filtrage).
- Points de filtrage en place : `buildTraceFeatureCollection`, `collectTraceWaypoints`,
  `useAdventureWaypoints` (alimente étapes/météo/corridor/marqueurs), `buildDensityColoredFeatures`,
  `buildPoiFeatureCollection`. Tout nouveau builder GeoJSON doit suivre la même garde.
- Diagnostic : les crash reports natifs iOS sont dans `~/Library/Logs/DiagnosticReports/*.ips`
  (header + body JSON ; `faultingThread` → frames). (Régression réelle 2026-06-16.)

### Conventions mobile
- Fichiers : kebab-case ; routes : `_layout.tsx`, `index.tsx`, `[id].tsx`.
- Styling : `className="…"` NativeWind (Tailwind v3 syntaxe). Tokens via `@ridenrest/design-tokens`, jamais de couleur hardcodée.
- Icônes : `lucide-react-native` (mobile) vs `lucide-react` (web).
- Réordre de liste : `react-native-reorderable-list` (Reanimated 4) — pas dnd-kit (web only).
- `.npmrc` : `node-linker=hoisted` requis (Metro ne suit pas les symlinks pnpm) — impact monorepo global, validé non-régression en MOB-1.1.

---

## Usage Guidelines

**Pour les agents IA :**
- Lire ce fichier avant d'implémenter du code dans ce projet.
- Suivre TOUTES les règles à la lettre ; en cas de doute, choisir l'option la plus restrictive.
- Travail mobile → consulter aussi `apps/mobile/AGENTS.md` (source de vérité toolchain native).
- Mettre à jour ce fichier si un nouveau pattern durable émerge.

**Pour les humains :**
- Garder ce fichier lean et focalisé sur les besoins des agents.
- Mettre à jour quand la stack ou les patterns changent ; revoir périodiquement pour retirer les règles devenues évidentes.

Last Updated: 2026-08-19
