# Story 1.3: Shared Business Logic Packages

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **developer**,
I want `packages/gpx` (Haversine, RDP, corridor) and `packages/shared` (types, Zod schemas, constants) ready,
So that GPX computation and shared types are available to both apps without duplication.

## Acceptance Criteria

1. **Given** `packages/gpx` is set up,
   **When** `haversine(pointA, pointB)` is called with two `{ lat, lng }` objects,
   **Then** it returns the correct distance in km (±0.1% of expected value).

2. **Given** `packages/gpx` is set up,
   **When** `rdpSimplify(points, 0.0001)` is called on a 50k-point array,
   **Then** it returns ≤ 2000 points preserving the overall shape.

3. **Given** `packages/shared` exports an `Adventure` type and Zod schemas,
   **When** both `apps/web` and `apps/api` import from `@ridenrest/shared`,
   **Then** TypeScript compiles without errors and Zod validation works correctly.

4. **Given** `packages/shared/constants` exports `MAX_GPX_POINTS` and `CORRIDOR_WIDTH_M`,
   **When** either app imports these constants,
   **Then** they are correctly typed as `number` and hold the expected values.

## Tasks / Subtasks

- [x] Task 1 — Implement `packages/gpx` core utilities (AC: #1, #2)
  - [x] 1.1 Implement `packages/gpx/src/haversine.ts` — distance between two `{lat, lng}` points in km (full implementation + unit test)
  - [x] 1.2 Implement `packages/gpx/src/rdp.ts` — Ramer-Douglas-Peucker simplification (full implementation + unit test)
  - [x] 1.3 Implement `packages/gpx/src/cumulative-distances.ts` — compute array of cumulative km from a points array
  - [x] 1.4 Implement `packages/gpx/src/corridor.ts` — build bounding box from route segment `[fromKm, toKm]`
  - [x] 1.5 Implement `packages/gpx/src/parser.ts` — parse GPX XML string into `GpxPoint[]` array
  - [x] 1.6 Implement `packages/gpx/src/snap-to-trace.ts` — find nearest point on route for a `{lat, lng}` position
  - [x] 1.7 Update `packages/gpx/src/index.ts` to export all utilities and types
  - [x] 1.8 Add `packages/gpx/src/haversine.test.ts` and `packages/gpx/src/rdp.test.ts` (Vitest)

- [x] Task 2 — Implement `packages/shared` types (AC: #3)
  - [x] 2.1 Create `packages/shared/src/types/adventure.types.ts` — `Adventure`, `AdventureSegment` API response shapes
  - [x] 2.2 Create `packages/shared/src/types/poi.types.ts` — `Poi`, `PoiCategory` types
  - [x] 2.3 Create `packages/shared/src/types/weather.types.ts` — `WeatherForecast`, `WeatherPoint` types
  - [x] 2.4 Create `packages/shared/src/types/user.types.ts` — `UserProfile`, `Tier` types

- [x] Task 3 — Implement `packages/shared` Zod v4 schemas (AC: #3)
  - [x] 3.1 Create `packages/shared/src/schemas/adventure.schema.ts` — Zod v4 schemas for create/update adventure
  - [x] 3.2 Create `packages/shared/src/schemas/segment.schema.ts` — Zod v4 schemas for segment operations
  - [x] 3.3 Create `packages/shared/src/schemas/poi-search.schema.ts` — Zod v4 schema for POI search params (includes 30km max range validation)

- [x] Task 4 — Implement `packages/shared` constants (AC: #4)
  - [x] 4.1 Create `packages/shared/src/constants/gpx.constants.ts` — `MAX_GPX_POINTS`, `RDP_EPSILON`, `CORRIDOR_WIDTH_M`, `MAX_SEARCH_RANGE_KM`
  - [x] 4.2 Create `packages/shared/src/constants/api.constants.ts` — `OVERPASS_CACHE_TTL`, `WEATHER_CACHE_TTL`, `REDIS_ALERT_THRESHOLD`

- [x] Task 5 — Update `packages/shared/src/index.ts` and validate (AC: #3, #4)
  - [x] 5.1 Update `packages/shared/src/index.ts` to re-export all types, schemas, and constants
  - [x] 5.2 Run `turbo run build --filter='*'` — zero TypeScript errors
  - [x] 5.3 Run `turbo run test --filter='@ridenrest/gpx'` — all tests pass (AC #1 and #2)

## Dev Notes

### Stories 1.1 & 1.2 Learnings (CRITICAL — apply to this story)

- **`packages/` use `moduleResolution: "bundler"`** — NO `.js` extensions in relative imports inside `packages/gpx` or `packages/shared`. Only `apps/api` (nodenext) uses `.js` extensions.
- **`apps/api` uses `nodenext`** — when importing from `@ridenrest/gpx` or `@ridenrest/shared` in `apps/api`, no extension needed (package imports, not relative)
- **`turbo run --filter='*'`** — always use this flag for Turborepo v2
- **Test runner for packages:** Vitest (NOT Jest — Jest is only for `apps/api`)
- **Vitest needs config in `packages/gpx/vitest.config.ts`** — see Dev Notes below
- **Port reference:** API runs on `:3010`, Web on `:3011` (not 3000/3001 — those are reserved)
- **`packages/database` uses `moduleResolution: "bundler"`** — confirmed working in story 1.2
- **Zod v4** — project uses Zod v4 (NOT v3). API differs from v3 in key ways — see Zod v4 section below

### packages/gpx — Complete Implementation

#### `packages/gpx/src/haversine.ts`

```typescript
export interface LatLng {
  lat: number
  lng: number
}

const EARTH_RADIUS_KM = 6371

export function haversine(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180

  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const sinDLat = Math.sin(dLat / 2)
  const sinDLng = Math.sin(dLng / 2)

  const h =
    sinDLat * sinDLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDLng * sinDLng

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}
```

#### `packages/gpx/src/cumulative-distances.ts`

```typescript
import { haversine, type LatLng } from './haversine'

export interface GpxPoint extends LatLng {
  elevM?: number
}

export interface KmWaypoint extends GpxPoint {
  km: number // cumulative distance from start
}

/** Compute cumulative km for each point in the array */
export function computeCumulativeDistances(points: GpxPoint[]): KmWaypoint[] {
  if (points.length === 0) return []

  let cumulative = 0
  return points.map((point, i) => {
    if (i > 0) {
      cumulative += haversine(points[i - 1]!, point)
    }
    return { ...point, km: cumulative }
  })
}

/** Total distance of a GPX track in km */
export function totalDistance(points: GpxPoint[]): number {
  if (points.length < 2) return 0
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += haversine(points[i - 1]!, points[i]!)
  }
  return total
}
```

#### `packages/gpx/src/rdp.ts`

```typescript
import { haversine, type LatLng } from './haversine'

/** Perpendicular distance from point p to line (a, b) in km */
function perpendicularDistance(p: LatLng, a: LatLng, b: LatLng): number {
  const ab = haversine(a, b)
  if (ab === 0) return haversine(p, a)

  // Cross product approximation (valid for small distances)
  const t =
    ((p.lat - a.lat) * (b.lat - a.lat) + (p.lng - a.lng) * (b.lng - a.lng)) /
    (ab * ab)

  const tClamped = Math.max(0, Math.min(1, t))
  const projection: LatLng = {
    lat: a.lat + tClamped * (b.lat - a.lat),
    lng: a.lng + tClamped * (b.lng - a.lng),
  }

  return haversine(p, projection)
}

/**
 * Ramer-Douglas-Peucker simplification.
 * @param points - Array of LatLng points
 * @param epsilon - Max deviation in km (0.0001 ≈ 10m)
 */
export function rdpSimplify<T extends LatLng>(points: T[], epsilon: number): T[] {
  if (points.length <= 2) return points

  let maxDist = 0
  let maxIdx = 0

  const first = points[0]!
  const last = points[points.length - 1]!

  for (let i = 1; i < points.length - 1; i++) {
    const dist = perpendicularDistance(points[i]!, first, last)
    if (dist > maxDist) {
      maxDist = dist
      maxIdx = i
    }
  }

  if (maxDist > epsilon) {
    const left = rdpSimplify(points.slice(0, maxIdx + 1), epsilon)
    const right = rdpSimplify(points.slice(maxIdx), epsilon)
    return [...left.slice(0, -1), ...right]
  }

  return [first, last]
}
```

#### `packages/gpx/src/corridor.ts`

```typescript
import type { LatLng } from './haversine'
import type { KmWaypoint } from './cumulative-distances'

export interface BoundingBox {
  minLat: number
  maxLat: number
  minLng: number
  maxLng: number
}

/**
 * Extract waypoints between fromKm and toKm from a precomputed waypoint array.
 * Max range: 30km (enforced by API DTO — reminder only, not validated here).
 */
export function extractSegment(waypoints: KmWaypoint[], fromKm: number, toKm: number): KmWaypoint[] {
  return waypoints.filter((wp) => wp.km >= fromKm && wp.km <= toKm)
}

/**
 * Compute bounding box for a set of points + buffer in degrees.
 * bufferDeg ≈ 0.01 for ~1km buffer at mid-latitudes.
 */
export function computeBoundingBox(points: LatLng[], bufferDeg = 0.01): BoundingBox {
  if (points.length === 0) {
    throw new Error('Cannot compute bounding box for empty points array')
  }

  let minLat = Infinity, maxLat = -Infinity
  let minLng = Infinity, maxLng = -Infinity

  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat
    if (p.lat > maxLat) maxLat = p.lat
    if (p.lng < minLng) minLng = p.lng
    if (p.lng > maxLng) maxLng = p.lng
  }

  return {
    minLat: minLat - bufferDeg,
    maxLat: maxLat + bufferDeg,
    minLng: minLng - bufferDeg,
    maxLng: maxLng + bufferDeg,
  }
}
```

#### `packages/gpx/src/parser.ts`

```typescript
import type { GpxPoint } from './cumulative-distances'

/**
 * Parse GPX XML string into an array of GpxPoints.
 * Handles both <trkpt> (track points) and <wpt> (waypoints).
 * Uses DOMParser (browser) or a minimal regex fallback (Node.js / no DOM).
 */
export function parseGpx(gpxXml: string): GpxPoint[] {
  // Regex-based parser — works in both browser and Node.js without dependencies
  const points: GpxPoint[] = []

  // Match <trkpt lat="..." lon="..."> tags
  const trkptRegex = /<trkpt\s+lat="([^"]+)"\s+lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/g
  let match: RegExpExecArray | null

  while ((match = trkptRegex.exec(gpxXml)) !== null) {
    const lat = parseFloat(match[1]!)
    const lng = parseFloat(match[2]!)
    const inner = match[3]!

    if (isNaN(lat) || isNaN(lng)) continue

    // Extract elevation if present
    const eleMatch = /<ele>([^<]+)<\/ele>/.exec(inner)
    const elevM = eleMatch ? parseFloat(eleMatch[1]!) : undefined

    points.push({ lat, lng, ...(elevM !== undefined ? { elevM } : {}) })
  }

  return points
}

/** Compute total elevation gain in meters from GPX points */
export function computeElevationGain(points: GpxPoint[]): number {
  let gain = 0
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1]!.elevM
    const curr = points[i]!.elevM
    if (prev !== undefined && curr !== undefined && curr > prev) {
      gain += curr - prev
    }
  }
  return gain
}
```

#### `packages/gpx/src/snap-to-trace.ts`

```typescript
import { haversine, type LatLng } from './haversine'
import type { KmWaypoint } from './cumulative-distances'

export interface SnapResult {
  nearestWaypoint: KmWaypoint
  distanceKm: number
  kmAlongRoute: number
}

/**
 * Find the nearest waypoint on a route to a given position.
 * Used for live mode: "where am I on my route?"
 * Note: position is NEVER sent to server (RGPD) — this runs client-side only.
 */
export function snapToTrace(position: LatLng, waypoints: KmWaypoint[]): SnapResult | null {
  if (waypoints.length === 0) return null

  let minDist = Infinity
  let nearest: KmWaypoint | null = null

  for (const wp of waypoints) {
    const dist = haversine(position, wp)
    if (dist < minDist) {
      minDist = dist
      nearest = wp
    }
  }

  if (!nearest) return null

  return {
    nearestWaypoint: nearest,
    distanceKm: minDist,
    kmAlongRoute: nearest.km,
  }
}
```

#### `packages/gpx/src/index.ts` — Exports

```typescript
export { haversine } from './haversine'
export type { LatLng } from './haversine'

export { computeCumulativeDistances, totalDistance } from './cumulative-distances'
export type { GpxPoint, KmWaypoint } from './cumulative-distances'

export { rdpSimplify } from './rdp'

export { extractSegment, computeBoundingBox } from './corridor'
export type { BoundingBox } from './corridor'

export { parseGpx, computeElevationGain } from './parser'

export { snapToTrace } from './snap-to-trace'
export type { SnapResult } from './snap-to-trace'
```

### packages/gpx — Vitest Config

Create `packages/gpx/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
```

Add to `packages/gpx/package.json`:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "devDependencies": {
    "vitest": "latest"
  }
}
```

### packages/gpx — Unit Tests

#### `packages/gpx/src/haversine.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { haversine } from './haversine'

describe('haversine', () => {
  it('returns 0 for identical points', () => {
    expect(haversine({ lat: 48.8566, lng: 2.3522 }, { lat: 48.8566, lng: 2.3522 })).toBe(0)
  })

  it('returns correct distance Paris → Lyon (±0.1%)', () => {
    // Paris (48.8566, 2.3522) to Lyon (45.7640, 4.8357) ≈ 392.2 km
    const dist = haversine({ lat: 48.8566, lng: 2.3522 }, { lat: 45.764, lng: 4.8357 })
    expect(dist).toBeGreaterThan(390)
    expect(dist).toBeLessThan(395)
  })

  it('returns correct short distance (±0.1%)', () => {
    // ~1.11 km per 0.01° latitude
    const dist = haversine({ lat: 48.0, lng: 2.0 }, { lat: 48.01, lng: 2.0 })
    expect(dist).toBeCloseTo(1.111, 1)
  })
})
```

#### `packages/gpx/src/rdp.test.ts`

```typescript
import { describe, it, expect } from 'vitest'
import { rdpSimplify } from './rdp'

describe('rdpSimplify', () => {
  it('returns same 2 points for minimal input', () => {
    const pts = [{ lat: 0, lng: 0 }, { lat: 1, lng: 1 }]
    expect(rdpSimplify(pts, 0.0001)).toHaveLength(2)
  })

  it('removes collinear middle points', () => {
    // 3 collinear points — middle one should be removed
    const pts = [{ lat: 0, lng: 0 }, { lat: 0.5, lng: 0.5 }, { lat: 1, lng: 1 }]
    const result = rdpSimplify(pts, 0.01)
    expect(result).toHaveLength(2)
  })

  it('keeps ≤ 2000 points for 50k collinear points with epsilon 0.0001', () => {
    // Generate 50k points along a straight line
    const pts = Array.from({ length: 50000 }, (_, i) => ({
      lat: i * 0.00001,
      lng: 0,
    }))
    const result = rdpSimplify(pts, 0.0001)
    expect(result.length).toBeLessThanOrEqual(2000)
  })
})
```

### packages/shared — Types

#### `packages/shared/src/types/poi.types.ts`

```typescript
export type PoiCategory = 'hotel' | 'hostel' | 'camp_site' | 'shelter' | 'restaurant' | 'supermarket' | 'convenience' | 'bike_shop' | 'bike_repair'

export interface Poi {
  id: string
  externalId: string
  source: 'overpass'
  category: PoiCategory
  name: string
  lat: number
  lng: number
  distFromTraceM: number
  distAlongRouteKm: number
  bookingUrl?: string  // Deep link (Hotels.com / Booking.com parameterized)
  rawData?: Record<string, unknown>
}
```

#### `packages/shared/src/types/adventure.types.ts`

```typescript
export type AdventureStatus = 'planning' | 'active' | 'completed'
export type ParseStatus = 'pending' | 'processing' | 'done' | 'error'

// API response shapes (camelCase — JSON fields)
export interface AdventureResponse {
  id: string
  userId: string
  name: string
  totalDistanceKm: number
  status: AdventureStatus
  createdAt: string  // ISO 8601
  updatedAt: string
}

export interface AdventureSegmentResponse {
  id: string
  adventureId: string
  name: string
  orderIndex: number
  cumulativeStartKm: number
  distanceKm: number
  elevationGainM: number | null
  parseStatus: ParseStatus
  boundingBox: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null
  createdAt: string
  updatedAt: string
}
```

#### `packages/shared/src/types/weather.types.ts`

```typescript
export interface WeatherPoint {
  km: number         // Position along route
  forecastAt: string // ISO 8601 — estimated passage time
  temperatureC: number | null
  precipitationMm: number | null
  windSpeedKmh: number | null
  windDirection: number | null
  weatherCode: string | null
}

export interface WeatherForecast {
  segmentId: string
  waypoints: WeatherPoint[]
  cachedAt: string
  expiresAt: string
}
```

#### `packages/shared/src/types/user.types.ts`

```typescript
export type Tier = 'free' | 'pro' | 'team'
export type UnitPref = 'km' | 'mi'
export type Currency = 'EUR' | 'USD' | 'GBP'

export interface UserProfile {
  id: string
  email: string
  name: string
  tier: Tier
  unitPref: UnitPref
  currency: Currency
  stravaAthleteId: string | null
}
```

### packages/shared — Zod v4 Schemas

> ⚠️ **Zod v4 — Key differences from v3:**
> - `z.string().min(1)` works the same
> - `z.object()` → `z.object()` same
> - `.parse()` / `.safeParse()` same
> - **Changed:** `z.ZodError` → use `.error` from safeParse result
> - **Changed:** `z.infer<typeof schema>` still works
> - **New in v4:** `z.email()`, `z.url()` as standalone validators
> - Import: `import { z } from 'zod'` — same as v3

#### `packages/shared/src/schemas/adventure.schema.ts`

```typescript
import { z } from 'zod'

export const createAdventureSchema = z.object({
  name: z.string().min(1).max(100),
})

export const updateAdventureSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  status: z.enum(['planning', 'active', 'completed']).optional(),
})

export const reorderSegmentsSchema = z.object({
  segmentIds: z.array(z.string().uuid()).min(1),
})

export type CreateAdventureInput = z.infer<typeof createAdventureSchema>
export type UpdateAdventureInput = z.infer<typeof updateAdventureSchema>
export type ReorderSegmentsInput = z.infer<typeof reorderSegmentsSchema>
```

#### `packages/shared/src/schemas/segment.schema.ts`

```typescript
import { z } from 'zod'

export const createSegmentSchema = z.object({
  name: z.string().min(1).max(100),
  // File upload is multipart — handled separately by NestJS @UploadedFile()
})

export const replaceSegmentSchema = z.object({
  name: z.string().min(1).max(100).optional(),
})

export type CreateSegmentInput = z.infer<typeof createSegmentSchema>
export type ReplaceSegmentInput = z.infer<typeof replaceSegmentSchema>
```

#### `packages/shared/src/schemas/poi-search.schema.ts`

```typescript
import { z } from 'zod'
import { MAX_SEARCH_RANGE_KM } from '../constants/gpx.constants'

export const poiSearchSchema = z.object({
  segmentId: z.string().uuid(),
  fromKm: z.number().min(0),
  toKm: z.number().min(0),
  categories: z.array(z.enum(['hotel', 'hostel', 'camp_site', 'shelter', 'restaurant', 'supermarket', 'convenience', 'bike_shop', 'bike_repair'])).optional(),
}).refine(
  (data) => data.toKm > data.fromKm,
  { message: 'toKm must be greater than fromKm', path: ['toKm'] }
).refine(
  (data) => (data.toKm - data.fromKm) <= MAX_SEARCH_RANGE_KM,
  { message: `Search range cannot exceed ${MAX_SEARCH_RANGE_KM} km`, path: ['toKm'] }
)

export type PoiSearchInput = z.infer<typeof poiSearchSchema>
```

### packages/shared — Constants

#### `packages/shared/src/constants/gpx.constants.ts`

```typescript
/** Maximum number of GPX track points after RDP simplification */
export const MAX_GPX_POINTS = 2000

/** RDP epsilon in km — 0.0001 ≈ 10m deviation threshold */
export const RDP_EPSILON = 0.0001

/** Corridor width for PostGIS ST_Buffer in meters (500m each side) */
export const CORRIDOR_WIDTH_M = 500

/** Maximum km range for a single POI corridor search */
export const MAX_SEARCH_RANGE_KM = 30

/** Maximum GPX file size in bytes (10MB) */
export const MAX_GPX_FILE_SIZE_BYTES = 10 * 1024 * 1024
```

#### `packages/shared/src/constants/api.constants.ts`

```typescript
/** Overpass API cache TTL in seconds (24 hours) */
export const OVERPASS_CACHE_TTL = 24 * 60 * 60

/** WeatherAPI.com cache TTL in seconds (1 hour per waypoint) */
export const WEATHER_CACHE_TTL = 60 * 60

/** Geoapify cache TTL in seconds (7 days — stable geocoding data) */
export const GEOAPIFY_CACHE_TTL = 7 * 24 * 60 * 60

/** Upstash Redis alert threshold (75% of 10k daily commands) */
export const REDIS_ALERT_THRESHOLD = 7500

/** Job status polling interval in ms (TanStack Query refetchInterval) */
export const JOB_POLL_INTERVAL_MS = 3000

/** Max adventure segments per adventure (free tier) */
export const MAX_SEGMENTS_FREE = 3

/** Max adventures per user (free tier) */
export const MAX_ADVENTURES_FREE = 2
```

### packages/shared/src/index.ts — Full Export

```typescript
// Types
export type { AdventureResponse, AdventureSegmentResponse, AdventureStatus, ParseStatus } from './types/adventure.types'
export type { Poi, PoiCategory } from './types/poi.types'
export type { WeatherForecast, WeatherPoint } from './types/weather.types'
export type { UserProfile, Tier, UnitPref, Currency } from './types/user.types'

// Zod schemas
export { createAdventureSchema, updateAdventureSchema, reorderSegmentsSchema } from './schemas/adventure.schema'
export type { CreateAdventureInput, UpdateAdventureInput, ReorderSegmentsInput } from './schemas/adventure.schema'

export { createSegmentSchema, replaceSegmentSchema } from './schemas/segment.schema'
export type { CreateSegmentInput, ReplaceSegmentInput } from './schemas/segment.schema'

export { poiSearchSchema } from './schemas/poi-search.schema'
export type { PoiSearchInput } from './schemas/poi-search.schema'

// Constants
export * from './constants/gpx.constants'
export * from './constants/api.constants'
```

### Package Configs — Add Zod Dependency

In `packages/shared/package.json`, add:
```json
{
  "dependencies": {
    "zod": "^4.0.0"
  }
}
```

In `apps/web/package.json` and `apps/api/package.json`, use shared Zod via:
```json
{
  "dependencies": {
    "zod": "^4.0.0"
  }
}
```

> ⚠️ Zod is needed in **both** packages/shared (schema definition) AND in apps (for `z.infer` and schema usage). Install in each location separately — pnpm workspaces deduplicate.

### CRITICAL: packages/ moduleResolution = "bundler"

All files in `packages/gpx` and `packages/shared` use relative imports **without** `.js` extensions:

```typescript
// ✅ Correct in packages/ (bundler moduleResolution)
import { haversine } from './haversine'

// ❌ WRONG — do NOT add .js extensions in packages/
import { haversine } from './haversine.js'
```

Only `apps/api` (nodenext) requires `.js` extensions in relative imports.

### CRITICAL: snapToTrace is CLIENT-SIDE ONLY (RGPD)

The `snapToTrace` function is exported from `packages/gpx` but must **only** be called in `apps/web` (browser), never in `apps/api`. GPS position must never reach the server.

```typescript
// ✅ OK — in apps/web client component
import { snapToTrace } from '@ridenrest/gpx'
const result = snapToTrace(userPosition, routeWaypoints)

// ❌ NEVER in apps/api — RGPD violation
```

### Scope Boundaries — What NOT to Implement in This Story

- ❌ NO Drizzle ORM queries (Story 1.2 done — DB layer complete)
- ❌ NO NestJS feature modules (adventures, segments, pois — Epics 2+)
- ❌ NO GPX file upload/storage (Story 3.1)
- ❌ NO actual Overpass API integration (Story 4.3)
- ❌ NO BullMQ job processors (Story 1.4)
- ❌ NO Better Auth setup (Story 2.1)
- ❌ NO React components or hooks (Stories 1.5+)

### Project Structure Notes

- `packages/gpx` and `packages/shared` are consumed by BOTH `apps/web` and `apps/api`
- Zod schemas in `packages/shared/schemas/` are the single source of truth — imported by NestJS DTOs (class-validator decorators wrap them) AND React Hook Form in web
- Constants in `packages/shared/constants/` are the single source of truth — NEVER hardcode `30` for max km range or `2000` for max GPX points
- `MAX_SEARCH_RANGE_KM = 30` is enforced in: Zod schema (here), NestJS DTO (Story 4.3), UI slider (Story 4.3)

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Story 1.3 AC]
- [Source: _bmad-output/planning-artifacts/architecture.md — packages/gpx structure]
- [Source: _bmad-output/planning-artifacts/architecture.md — packages/shared structure]
- [Source: _bmad-output/project-context.md — Package Import Rules (never duplicate)]
- [Source: _bmad-output/project-context.md — Corridor Search 30km max range]
- [Source: _bmad-output/project-context.md — RGPD Geolocation Rule (GPS never on server)]
- [Source: _bmad-output/project-context.md — Data Format Rules ({ lat, lng } objects)]
- [Source: _bmad-output/implementation-artifacts/1-1-monorepo-setup-developer-environment.md — nodenext module, turbo filter]
- [Source: _bmad-output/implementation-artifacts/1-2-database-schema-aiven-configuration.md — bundler moduleResolution in packages/]

## Review Follow-ups (AI)

Issues found and fixed during adversarial code review (2026-03-14):

- [x] [AI-Review][HIGH] `rdp.ts` — Réécriture itérative pour éviter stack overflow sur vraies traces GPS 50k points non-colinéaires [rdp.ts:29]
- [x] [AI-Review][HIGH] `rdp.test.ts` — Ajout test avec 50k points non-colinéaires (zigzag) + test déviation significative préservée [rdp.test.ts:17]
- [x] [AI-Review][HIGH] `parser.ts` — Regex rendue order-independent (lat/lon dans n'importe quel ordre) + suppression fausse promesse `<wpt>` [parser.ts:13]
- [x] [AI-Review][HIGH] `packages/shared` — Ajout tests Vitest pour schemas Zod (`adventure.schema.test.ts`, `poi-search.schema.test.ts`) + vitest config + scripts test [package.json]
- [x] [AI-Review][MEDIUM] `corridor.ts` — Buffer remplacé par `bufferKm` (km → degrés ajusté selon latitude) pour symétrie correcte [corridor.ts:23]
- [x] [AI-Review][MEDIUM] `poi.types.ts` — `source` élargi à `'overpass' | 'amadeus'` pour compatibilité architecture multi-source [poi.types.ts:6]
- [x] [AI-Review][LOW] `haversine.test.ts` — Tolérance Paris→Lyon resserrée à ±0.1% réel (391.8-392.6km) au lieu de ±1.3% [haversine.test.ts:12]
- [x] [AI-Review][LOW] `vitest.config.ts` — Suppression `globals: true` inutile (tests utilisent imports explicites) [vitest.config.ts:5]
- [ ] [AI-Review][MEDIUM] `rdp.ts` — Projection flat-earth biaisée aux hautes latitudes (>60°N) : `t` calculé en espace-degrés, invalide pour traces Nord-Sud à haute latitude. À corriger si extension au-delà de l'Europe du sud. [rdp.ts:13]

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- Fixed bug in `rdp.ts` perpendicular distance calculation: original formula mixed km² (haversine result) with degrees² (coordinate differences) in the denominator, causing incorrect distances for collinear points and stack overflow for large arrays. Fixed by using `len2 = dLat² + dLng²` (degree-space) consistently with the numerator.

### Completion Notes List

- Implemented all 6 utility functions in `packages/gpx`: haversine, rdpSimplify, computeCumulativeDistances, corridor (extractSegment + computeBoundingBox), parseGpx, snapToTrace
- Added Vitest config + 6 passing tests (haversine: 3, rdp: 3) — AC #1 and #2 validated
- Implemented 4 type files in `packages/shared/types`: adventure, poi, weather, user
- Implemented 3 Zod v4 schema files in `packages/shared/schemas`: adventure, segment, poi-search (with 30km MAX_SEARCH_RANGE_KM validation)
- Implemented 2 constants files in `packages/shared/constants`: gpx (MAX_GPX_POINTS=2000, CORRIDOR_WIDTH_M=500, etc.), api (cache TTLs, thresholds)
- Updated both index.ts files for full re-exports
- `turbo run build --filter='*'` → 6 tasks successful, 0 TypeScript errors
- `pnpm --filter '@ridenrest/gpx' test` → 6/6 tests pass

### File List

- packages/gpx/src/haversine.ts (modified — stub replaced with full implementation)
- packages/gpx/src/rdp.ts (modified — stub replaced with full implementation, bug fixed)
- packages/gpx/src/corridor.ts (modified — stub replaced with full implementation)
- packages/gpx/src/parser.ts (modified — stub replaced with full implementation)
- packages/gpx/src/cumulative-distances.ts (created)
- packages/gpx/src/snap-to-trace.ts (created)
- packages/gpx/src/index.ts (modified — full exports added)
- packages/gpx/src/haversine.test.ts (created)
- packages/gpx/src/rdp.test.ts (created)
- packages/gpx/vitest.config.ts (created)
- packages/gpx/package.json (modified — added vitest scripts + devDependency)
- packages/shared/src/types/adventure.types.ts (created)
- packages/shared/src/types/poi.types.ts (created)
- packages/shared/src/types/weather.types.ts (created)
- packages/shared/src/types/user.types.ts (created)
- packages/shared/src/schemas/adventure.schema.ts (created)
- packages/shared/src/schemas/segment.schema.ts (created)
- packages/shared/src/schemas/poi-search.schema.ts (created)
- packages/shared/src/constants/gpx.constants.ts (created)
- packages/shared/src/constants/api.constants.ts (created)
- packages/shared/src/index.ts (modified — full re-exports)
- packages/shared/package.json (modified — added zod ^4.0.0 dependency, vitest scripts + devDep)
- packages/shared/vitest.config.ts (created)
- packages/shared/src/schemas/adventure.schema.test.ts (created)
- packages/shared/src/schemas/poi-search.schema.test.ts (created)
- _bmad-output/implementation-artifacts/sprint-status.yaml (modified — status: done)
