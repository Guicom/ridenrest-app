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
['pois', { segmentId, fromKm, toKm }]      // complex params → object
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
VPS Hostinger (~$8/mois)
├── Docker: PostgreSQL+PostGIS, Redis, Caddy, Uptime Kuma
└── PM2:    Next.js (port 3011), NestJS (port 3010)
```

Deploy via GitHub Actions SSH : `git pull → turbo build → pm2 restart all`

> ⚠️ L'ancienne config Fly.io (`apps/api/fly.toml`) et le `Dockerfile` sont obsolètes — à supprimer lors de l'Epic 14.

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

### Corridor Search — 30 km Max Range

POI search range is capped at **30 km max** (`toKm - fromKm ≤ 30`).

Enforced at two levels:
1. **API**: DTO validation in `search-pois.dto.ts` rejects ranges > 30 km with HTTP 400
2. **UI**: `<SearchRangeSlider />` caps the range programmatically

**Why 30 km**: beyond this, Overpass bbox becomes too large (OOM/timeout risk on fair-use), Redis cache covers too wide a zone (stale at 24h), and planning UX loses precision. 30 km matches a realistic bikepacking daily stage.
