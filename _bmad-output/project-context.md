---
project_name: 'ridenrest-app'
user_name: 'Guillaume'
date: '2026-03-01'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'code_quality', 'workflow_rules', 'critical_rules']
existing_patterns_found: 8
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
['pois', { segmentId, fromKm, toKm, layer }]  // per-layer — stable cache entry per layer
['weather', segmentId]
['density', adventureId]
```

NEVER invent query keys like `['getAdventure', id]` or `['adventure-list']`.

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
- `prevIsPendingRef` MUST be reset to `false` in the effect cleanup (React Strict Mode safety)
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

### Corridor Search — 30 km Max Range

POI search range is capped at **30 km max** (`toKm - fromKm ≤ 30`).

Enforced at two levels:
1. **API**: DTO validation in `search-pois.dto.ts` rejects ranges > 30 km with HTTP 400
2. **UI**: `<SearchRangeSlider />` caps the range programmatically

**Why 30 km**: beyond this, Overpass bbox becomes too large (OOM/timeout risk on fair-use), Redis cache covers too wide a zone (stale at 24h), and planning UX loses precision. 30 km matches a realistic bikepacking daily stage.

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
