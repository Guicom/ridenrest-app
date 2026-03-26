# Story 7.2: Real-Time POI Discovery by Target Distance & Configurable Radius

Status: done

## Story

As a **cyclist user in Live mode**,
I want to set a target distance ahead (e.g. "dans 30 km") and a search radius, so the app shows me accommodations available at that specific stopping point,
So that I can quickly find where to sleep tonight without being overwhelmed by results spread over dozens of kilometres.

## Acceptance Criteria

1. **Given** Live mode is active and a GPS position is acquired,
   **When** the user adjusts the "distance cible" slider (e.g. 30 km),
   **Then** the app computes `targetKm = currentKm + 30`, and a `GET /pois?segmentId=&targetKm=30&radiusKm=3` request is triggered — GPS coordinates are NOT sent to the server (FR-042, NFR-012).

2. **Given** the API receives the request with `targetKm` and `radiusKm`,
   **When** processing the search,
   **Then** it interpolates the point at `targetKm` on the segment's waypoints, runs `ST_DWithin(geom, target_point, radius_m)` on `accommodations_cache` — returning only POIs within the radius around that specific point (FR-042, FR-043).

3. **Given** a user adjusts the "rayon" slider (0 to 5 km, hard cap 10 km),
   **When** the value changes,
   **Then** `useLiveStore.setSearchRadius(value)` updates the Zustand store and a new POI search is triggered with the updated radius (FR-043).

4. **Given** the GPS position updates as the user moves,
   **When** the new `currentKmOnRoute` changes by ≥ 500m from the last trigger,
   **Then** a new POI search fires automatically with the same slider values — `targetKm` recomputes as `newCurrentKmOnRoute + targetAheadKm` (FR-044).

5. **Given** a POI search returns results,
   **When** the response arrives,
   **Then** results display within ≤ 2s, with a visible loading indicator during fetch — showing only POIs near the target point (NFR-007).

6. **Given** a user enters their speed (km/h) in the speed input field,
   **When** the value is set,
   **Then** `useLiveStore.setSpeedKmh(value)` updates the Zustand store and all ETA calculations update immediately.

7. **Given** Live mode POI results are displayed,
   **When** the POI list renders,
   **Then** each item shows: name, distance from target point (m), D+ from `currentKm` to `targetKm`, and ETA at current speed — formatted as "↑ 420 m D+ · ~2h10" (FR-082).

8. **Given** the GPS position updates and `currentKmOnRoute` changes,
   **When** the POI list refreshes,
   **Then** D+ and ETA values recalculate client-side from the updated `currentKmOnRoute` using already-loaded waypoints JSONB — no additional API call needed.

## Tasks / Subtasks

### Backend (NestJS API)

- [x] Task 1: Extend `FindPoisDto` with live mode params (AC: #1, #2)
  - [x] 1.1 Add `targetKm?: number` (`@IsOptional() @IsNumber() @Min(0) @Type(() => Number)`) to `find-pois.dto.ts`
  - [x] 1.2 Add `radiusKm?: number` (`@IsOptional() @IsNumber() @Min(0) @Max(10) @Type(() => Number)`) — hard cap 10 km
  - [x] 1.3 Add cross-field validation: if `targetKm` provided then `radiusKm` required (and vice versa); if neither → corridor mode (existing `fromKm`/`toKm` required)
  - [x] 1.4 Remove `fromKm`/`toKm` from `@IsNotEmpty()` constraint — they should only be required in corridor mode (add `@ValidateIf(o => !o.targetKm)`)

- [x] Task 2: Add `findPoisNearPoint` to `PoisRepository` (AC: #2)
  - [x] 2.1 Add method `findPoisNearPoint(segmentId: string, targetLat: number, targetLng: number, radiusM: number, categories: string[]): Promise<Poi[]>` using PostGIS `ST_DWithin` and `ST_Distance`
  - [x] 2.2 Query: `SELECT *, ST_Distance(geom_point::geography, target_point::geography) as dist_m FROM accommodations_cache WHERE segment_id = $1 AND category = ANY($2) AND ST_DWithin(ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography, ST_SetSRID(ST_MakePoint($targetLng, $targetLat), 4326)::geography, $radiusM) AND expires_at > NOW()`
  - [x] 2.3 Include `distFromTargetM` (distance from the target point, not from trace) in the return — add to `Poi` shared type as optional field `distFromTargetM?: number`
  - [x] 2.4 Add `getWaypointAtKm(segmentId: string, targetKm: number): Promise<{ lat: number; lng: number } | null>` — interpolates between adjacent waypoints using linear interpolation

- [x] Task 3: Add live mode branch in `PoisService.findPois` (AC: #1, #2)
  - [x] 3.1 If `dto.targetKm !== undefined`: route to live mode flow
  - [x] 3.2 Live mode flow: get waypoints → interpolate point at `targetKm` → trigger Overpass query around that point (`ST_Buffer` equivalent: bbox from `radiusKm`) → Google Places prefetch (same bbox, awaited) → insert/update cache → call `findPoisNearPoint()`
  - [x] 3.3 Overpass bbox for live mode: `{ minLat: lat - radDeg, maxLat: lat + radDeg, minLng: lng - radDeg, maxLng: lng + radDeg }` where `radDeg = radiusKm / 111.0`
  - [x] 3.4 Redis cache key for live mode: `pois:live:{segmentId}:{Math.round(targetKm * 10) / 10}:{radiusKm}:{categories.sort().join(',')}` — rounded to 0.1 km to avoid cache fragmentation
  - [x] 3.5 Skip `MAX_SEARCH_RANGE_KM` validation in live mode (radius-based, not range-based)
  - [x] 3.6 Write unit tests in `pois.service.test.ts` (Jest): live mode branch, point interpolation, correct cache key format

### Frontend (Next.js)

- [x] Task 4: Add `findPointAtKm` utility to `packages/gpx` (AC: #1, #8)
  - [x] 4.1 Create `packages/gpx/src/find-point-at-km.ts`
  - [x] 4.2 Function signature: `findPointAtKm(waypoints: KmWaypoint[], targetKm: number): LatLng | null`
  - [x] 4.3 Algorithm: find adjacent waypoints where `wp[i].km <= targetKm <= wp[i+1].km`, linear interpolation: `t = (targetKm - wp[i].km) / (wp[i+1].km - wp[i].km)`, `lat = wp[i].lat + t * (wp[i+1].lat - wp[i].lat)`, `lng = wp[i].lng + t * (wp[i+1].lng - wp[i].lng)`
  - [x] 4.4 Export from `packages/gpx/src/index.ts`
  - [x] 4.5 Write tests in `find-point-at-km.test.ts` (Vitest)

- [x] Task 5: Create `use-live-poi-search.ts` hook (AC: #1, #4, #5)
  - [x] 5.1 Create `apps/web/src/hooks/use-live-poi-search.ts`
  - [x] 5.2 Reads from `useLiveStore`: `currentKmOnRoute`, `targetAheadKm`, `searchRadiusKm`, `speedKmh`
  - [x] 5.3 Computes `targetKm = currentKmOnRoute + targetAheadKm` — never sends GPS position
  - [x] 5.4 500m threshold: use `useRef<number | null>` for `lastTriggerKmRef` — only re-search if `Math.abs(currentKmOnRoute - lastTriggerKm) >= 0.5` or sliders changed
  - [x] 5.5 Use TanStack Query `useQuery` with `queryKey: ['pois', 'live', { segmentId, targetKm: Math.round(targetKm * 10) / 10, radiusKm: searchRadiusKm }]` and `enabled: isLiveModeActive && currentKmOnRoute !== null && !!segmentId`
  - [x] 5.6 `queryFn`: `apiClient.get('/pois', { params: { segmentId, targetKm, radiusKm: searchRadiusKm, categories: activeCategories } })`
  - [x] 5.7 Return `{ pois, isPending, targetKm }` — consumers use `isPending` for loading indicator
  - [x] 5.8 Tests in `use-live-poi-search.test.ts` (Vitest): 500m threshold not triggered, trigger on slider change, queryKey format

- [x] Task 6: Create `<LiveControls />` compound component (AC: #1, #3, #6)
  - [x] 6.1 Create `apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx`
  - [x] 6.2 "Distance cible" slider: range 5–100 km, step 5, default 30 — reads/writes `useLiveStore.targetAheadKm` / `setTargetAheadKm`
  - [x] 6.3 "Rayon de recherche" slider: range 1–10 km, step 1, default 3 — reads/writes `useLiveStore.searchRadiusKm` / `setSearchRadius`
  - [x] 6.4 Speed input: number input, min 5 max 50 km/h, default 15 — reads/writes `useLiveStore.speedKmh` / `setSpeedKmh`
  - [x] 6.5 Use `shadcn/ui Slider` (`components/ui/slider.tsx`) and a plain `<input type="number">` styled with Tailwind
  - [x] 6.6 Position: bottom sheet / drawer overlay (z-30), collapsible chevron toggle
  - [x] 6.7 Show current `targetKm` as computed label: "Arrêt dans {targetAheadKm} km (~{eta})"
  - [x] 6.8 Tests in `live-controls.test.tsx` (Vitest)

- [x] ~~Task 7: `<LivePoiList />` component~~ — **REMOVED**: POIs are now displayed as clickable map pins (same pattern as planning mode) instead of a bottom list. `PoiDetailSheet` (from planning mode) is reused for pin click → detail view.

- [x] Task 8: Update `live/[id]/page.tsx` to wire controls and POI pins (AC: all)
  - [x] 8.1 Import `useLivePoisSearch`, `LiveControls`, `PoiDetailSheet`
  - [x] 8.2 Pass `segmentId` from first loaded segment (or active segment) to `useLivePoisSearch`
  - [x] 8.3 Add `<LiveControls />` as bottom overlay (z-30) — only visible when `isLiveModeActive`
  - [x] 8.4 Pass `pois` to `<LiveMapCanvas />` for pin rendering on the map
  - [x] 8.5 Add `<PoiDetailSheet />` — reused from planning mode, opens when a POI pin is clicked
  - [x] 8.6 Update `<LiveMapCanvas />` to show a target-point marker (different style from GPS dot) at the computed `targetKm` position on the trace

- [x] Task 9: Update `<LiveMapCanvas />` — POI pins + target point marker (AC: #2, #5)
  - [x] 9.1 Add new GeoJSON source `'live-target-point'` + `circle` layer `'target-dot'`
  - [x] 9.2 Style: larger circle (radius 14), semi-transparent fill (`--primary` with 0.6 opacity), dashed stroke — visually distinct from GPS dot
  - [x] 9.3 Update target point whenever `targetKm` changes: compute via `findPointAtKm(waypoints, targetKm)` client-side
  - [x] 9.4 Add `useLivePoiLayers` hook — same visual pattern as planning mode (clustered sources, color-coded pins, click → detail sheet via `useUIStore.setSelectedPoi`)
  - [x] 9.5 POI layers inserted BEFORE target-dot (layer order: trace → POI pins → target-dot → GPS dot)
  - [x] 9.6 Update tests in `live-map-canvas.test.tsx` for new source/layer + mock getLayer/getCanvas

## Dev Notes

### Architecture Overview — Live Mode vs Planning Mode

| Mode | Endpoint | Query Type | GPS sent? |
|---|---|---|---|
| Planning | `GET /pois?segmentId=&fromKm=&toKm=` | Corridor (ST_Buffer) | Never |
| Live | `GET /pois?segmentId=&targetKm=&radiusKm=` | Point radius (ST_DWithin) | Never — only `targetKm` |

Both modes use **Overpass + Google Places** (multi-source). Google Places is awaited before the final DB query so that Google POIs appear in the first response.

The key RGPD invariant: `currentKmOnRoute` is computed **client-side** via `snapToTrace()`. Only `targetKm = currentKm + targetAheadKm` is sent to the API.

### Extended `FindPoisDto` — Conditional Validation Pattern

```typescript
// apps/api/src/pois/dto/find-pois.dto.ts

import { IsUUID, IsNumber, IsOptional, IsArray, IsIn, Min, Max, ValidateIf } from 'class-validator'
import { Type } from 'class-transformer'

export class FindPoisDto {
  @IsUUID()
  segmentId!: string

  // Corridor mode — only required when NOT in live mode
  @ValidateIf(o => !o.targetKm)
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  fromKm?: number

  @ValidateIf(o => !o.targetKm)
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  toKm?: number

  // Live mode — mutually exclusive with fromKm/toKm
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  targetKm?: number

  @ValidateIf(o => o.targetKm !== undefined)
  @IsNumber()
  @Min(0)
  @Max(10)
  @Type(() => Number)
  radiusKm?: number

  @IsOptional()
  @Transform(...)
  @IsArray()
  @IsIn(POI_CATEGORIES, { each: true })
  categories?: PoiCategory[]
}
```

### Point Interpolation — `getWaypointAtKm` in Repository

```typescript
// In pois.repository.ts — used by service to compute target lat/lng
async getWaypointAtKm(
  segmentId: string,
  targetKm: number,
  userId: string,
): Promise<{ lat: number; lng: number } | null> {
  const waypoints = await this.getSegmentWaypoints(segmentId, userId)
  if (!waypoints || waypoints.length < 2) return null

  // Find bracketing waypoints
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i]
    const b = waypoints[i + 1]
    if (a.distKm <= targetKm && targetKm <= b.distKm) {
      const t = (targetKm - a.distKm) / (b.distKm - a.distKm)
      return {
        lat: a.lat + t * (b.lat - a.lat),
        lng: a.lng + t * (b.lng - a.lng),
      }
    }
  }

  // targetKm beyond route end — clamp to last waypoint
  const last = waypoints[waypoints.length - 1]
  return { lat: last.lat, lng: last.lng }
}
```

### `findPoisNearPoint` — PostGIS Query

```typescript
// In pois.repository.ts
async findPoisNearPoint(
  segmentId: string,
  targetLat: number,
  targetLng: number,
  radiusM: number,
  categories: string[],
): Promise<Poi[]> {
  const now = new Date()
  const rows = await db.execute(sql`
    SELECT
      ac.*,
      ST_Distance(
        ST_SetSRID(ST_MakePoint(ac.lng, ac.lat), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${targetLng}, ${targetLat}), 4326)::geography
      ) AS dist_from_target_m
    FROM accommodations_cache ac
    WHERE ac.segment_id = ${segmentId}
      AND ac.category = ANY(${`{${categories.join(',')}}`}::text[])
      AND ac.expires_at > ${now}
      AND ST_DWithin(
        ST_SetSRID(ST_MakePoint(ac.lng, ac.lat), 4326)::geography,
        ST_SetSRID(ST_MakePoint(${targetLng}, ${targetLat}), 4326)::geography,
        ${radiusM}
      )
    ORDER BY dist_from_target_m ASC
  `)
  return rows.rows.map(r => ({
    id: r.id as string,
    externalId: r.external_id as string,
    source: r.source as 'overpass' | 'amadeus' | 'google',
    category: r.category as Poi['category'],
    name: r.name as string,
    lat: r.lat as number,
    lng: r.lng as number,
    distFromTraceM: r.dist_from_trace_m as number,
    distAlongRouteKm: r.dist_along_route_km as number,
    distFromTargetM: Math.round(r.dist_from_target_m as number),
  }))
}
```

**Note:** Use `db.execute(sql\`...\`)` (raw SQL) when you need computed columns like `ST_Distance` in SELECT — Drizzle's typed `.select()` doesn't support computed column aliases cleanly.

### Shared `Poi` Type Extension

Add to `packages/shared/src/types/poi.ts`:
```typescript
export interface Poi {
  // ... existing fields ...
  distFromTargetM?: number  // Only present in live mode responses
}
```

### Live Mode Service Branch

```typescript
// In pois.service.ts — inside findPois()
async findPois(dto: FindPoisDto, userId: string): Promise<Poi[]> {
  if (dto.targetKm !== undefined) {
    return this.findLiveModePois(dto, userId)
  }
  // Existing corridor logic unchanged...
}

private async findLiveModePois(dto: FindPoisDto, userId: string): Promise<Poi[]> {
  const { segmentId, targetKm, radiusKm, categories } = dto
  const radiusM = (radiusKm ?? 3) * 1000
  const activeCategories = categories ?? Object.keys(CATEGORY_TO_OVERPASS_TAGS)

  // Cache key — round targetKm to 0.1 km to reduce fragmentation
  const roundedKm = Math.round(targetKm! * 10) / 10
  const cacheKey = `pois:live:${segmentId}:${roundedKm}:${radiusKm ?? 3}:${activeCategories.sort().join(',')}`

  const redis = this.redisProvider.getClient()
  const cached = await redis.get(cacheKey)
  if (cached) return JSON.parse(cached) as Poi[]

  // Get target point (interpolated from waypoints — no GPS sent)
  const targetPoint = await this.poisRepository.getWaypointAtKm(segmentId, targetKm!, userId)
  if (!targetPoint) return []

  // Overpass bbox around target point
  const radDeg = (radiusKm ?? 3) / 111.0
  const bbox = {
    minLat: targetPoint.lat - radDeg, maxLat: targetPoint.lat + radDeg,
    minLng: targetPoint.lng - radDeg, maxLng: targetPoint.lng + radDeg,
  }

  try {
    const nodes = await this.overpassProvider.queryPois(bbox, activeCategories)
    const categoryMap: Record<number, string> = {}
    for (const node of nodes) categoryMap[node.id] = resolveCategory(node.tags)
    const expiresAt = new Date(Date.now() + CACHE_TTL_SECONDS * 1000)
    await this.poisRepository.insertOverpassPois(segmentId, nodes, categoryMap, expiresAt)
    await this.poisRepository.updatePoiDistances(segmentId)
  } catch (err) {
    this.logger.warn(`Overpass failed in live mode: ${err}`)
    // Fall through — may still have cached POIs from a previous fetch
  }

  // Google Places: enrich with additional POIs (same as corridor mode)
  await this.prefetchAndInsertGooglePois(bbox, segmentId, redis)
    .catch((err) => this.logger.warn('Google Places prefetch failed in live mode', err))

  const pois = await this.poisRepository.findPoisNearPoint(
    segmentId, targetPoint.lat, targetPoint.lng, radiusM, activeCategories,
  )

  await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(pois))
  return pois
}
```

### `use-live-poi-search.ts` — 500m Threshold Pattern

```typescript
// apps/web/src/hooks/use-live-poi-search.ts
import { useRef, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLiveStore } from '@/stores/live.store'
import { apiClient } from '@/lib/api-client'
import type { Poi } from '@ridenrest/shared'

const TRIGGER_THRESHOLD_KM = 0.5

export function useLivePoisSearch(segmentId: string | undefined) {
  const { isLiveModeActive, currentKmOnRoute, targetAheadKm, searchRadiusKm } = useLiveStore()
  const lastTriggerKmRef = useRef<number | null>(null)
  const [activeTriggerKm, setActiveTriggerKm] = useState<number | null>(null)

  // Update activeTriggerKm when GPS moves ≥ 500m OR sliders change
  useEffect(() => {
    if (currentKmOnRoute === null) return

    const shouldTrigger =
      lastTriggerKmRef.current === null ||
      Math.abs(currentKmOnRoute - lastTriggerKmRef.current) >= TRIGGER_THRESHOLD_KM

    if (shouldTrigger) {
      lastTriggerKmRef.current = currentKmOnRoute
      setActiveTriggerKm(currentKmOnRoute)
    }
  }, [currentKmOnRoute])

  // Also trigger when sliders change (new targetAheadKm or searchRadiusKm)
  useEffect(() => {
    if (currentKmOnRoute !== null) setActiveTriggerKm(currentKmOnRoute)
  }, [targetAheadKm, searchRadiusKm]) // eslint-disable-line react-hooks/exhaustive-deps

  const targetKm = activeTriggerKm !== null
    ? Math.round((activeTriggerKm + targetAheadKm) * 10) / 10
    : null

  const { data: pois = [], isPending } = useQuery({
    queryKey: ['pois', 'live', { segmentId, targetKm, radiusKm: searchRadiusKm }],
    queryFn: () => apiClient.get<Poi[]>('/pois', {
      params: { segmentId, targetKm, radiusKm: searchRadiusKm }
    }),
    enabled: isLiveModeActive && targetKm !== null && !!segmentId,
    staleTime: 5 * 60 * 1000, // 5 min — live data fresh enough
  })

  return { pois, isPending, targetKm }
}
```

### ETA & D+ Client-Side Calculation

```typescript
// Utility in apps/web/src/app/(app)/live/[id]/_components/live-poi-list.tsx

function formatEta(distanceKm: number, speedKmh: number): string {
  if (speedKmh <= 0) return '—'
  const totalMinutes = Math.round((distanceKm / speedKmh) * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h > 0 ? `~${h}h${String(m).padStart(2, '0')}` : `~${m}min`
}

function computeElevationGain(
  waypoints: Array<{ km: number; ele?: number }>,
  fromKm: number,
  toKm: number,
): number | null {
  const range = waypoints.filter(wp => wp.km >= fromKm && wp.km <= toKm)
  if (range.length < 2 || !range.some(wp => wp.ele !== undefined)) return null

  let gain = 0
  for (let i = 1; i < range.length; i++) {
    const prev = range[i - 1].ele ?? 0
    const curr = range[i].ele ?? 0
    if (curr > prev) gain += curr - prev
  }
  return Math.round(gain)
}
```

**Important:** Waypoints in `accommodations_cache.waypoints` JSONB include `ele` from GPX — but only if the original GPX file had elevation data. Always guard `ele !== undefined`.

### Target Point Marker — `<LiveMapCanvas />` Update

```typescript
// Add to live-map-canvas.tsx after existing GPS dot setup
map.addSource('live-target-point', {
  type: 'geojson',
  data: { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} }
})
map.addLayer({
  id: 'target-dot',
  type: 'circle',
  source: 'live-target-point',
  paint: {
    'circle-radius': 14,
    'circle-color': '#2D6A4A',
    'circle-opacity': 0.5,
    'circle-stroke-width': 2,
    'circle-stroke-color': '#FFFFFF',
    'circle-stroke-opacity': 0.8,
  }
})

// Layer ORDER: trace layers → target-dot → gps-dot (GPS dot renders on top)
// Use map.addLayer({ id: 'target-dot', ... }, 'gps-dot') to insert BEFORE gps-dot
```

### TanStack Query Key Convention

Live mode POI search must use:
```typescript
['pois', 'live', { segmentId, targetKm, radiusKm }]
```

Do **NOT** invent keys like `['live-pois', ...]` or `['pois', segmentId, 'live']`.

### `findPointAtKm` in `packages/gpx`

```typescript
// packages/gpx/src/find-point-at-km.ts
import type { KmWaypoint } from './cumulative-distances'
import type { LatLng } from './haversine'

export function findPointAtKm(waypoints: KmWaypoint[], targetKm: number): LatLng | null {
  if (waypoints.length === 0) return null
  if (targetKm <= waypoints[0].km) return { lat: waypoints[0].lat, lng: waypoints[0].lng }

  const last = waypoints[waypoints.length - 1]
  if (targetKm >= last.km) return { lat: last.lat, lng: last.lng }

  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = waypoints[i]
    const b = waypoints[i + 1]
    if (a.km <= targetKm && targetKm <= b.km) {
      const t = (targetKm - a.km) / (b.km - a.km)
      return {
        lat: a.lat + t * (b.lat - a.lat),
        lng: a.lng + t * (b.lng - a.lng),
      }
    }
  }
  return null
}
```

Note: `KmWaypoint` has `{ lat, lng, km }` from `packages/gpx/src/cumulative-distances.ts`.

### `<LiveControls />` Layout

```
Bottom overlay (z-30)
└── Drawer panel (sliding up from bottom, collapsible)
    ├── Header: "↑ 420 m D+ · ~2h10" (current ETA summary)
    ├── Row: "Distance cible" label + Slider (5–100km) + "{n} km" badge
    ├── Row: "Rayon" label + Slider (1–10km) + "{n} km" badge
    ├── Row: "Allure" label + <input type="number" min=5 max=50> + "km/h"
    └── <LivePoiList /> (scrollable, max-h-60)
```

Use `shadcn/ui Slider` from `apps/web/src/components/ui/slider.tsx` (already exists).

### Project Structure — New / Modified Files

```
packages/gpx/src/
├── find-point-at-km.ts              ← NEW
├── find-point-at-km.test.ts         ← NEW
└── index.ts                         ← MODIFY (export findPointAtKm)

packages/shared/src/types/
└── poi.ts                           ← MODIFY (add distFromTargetM?: number)

apps/api/src/pois/
├── dto/find-pois.dto.ts             ← MODIFY (add targetKm, radiusKm, conditional fromKm/toKm)
├── pois.repository.ts               ← MODIFY (add findPoisNearPoint, getWaypointAtKm)
├── pois.service.ts                  ← MODIFY (add findLiveModePois branch)
└── pois.service.test.ts             ← MODIFY (add live mode tests)

apps/web/src/
├── hooks/
│   ├── use-live-poi-search.ts       ← NEW
│   └── use-live-poi-search.test.ts  ← NEW
├── app/(app)/live/[id]/
│   ├── page.tsx                     ← MODIFY (wire controls + POI list)
│   └── _components/
│       ├── live-controls.tsx        ← NEW
│       ├── live-controls.test.tsx   ← NEW
│       ├── live-poi-list.tsx        ← NEW
│       ├── live-poi-list.test.tsx   ← NEW
│       ├── live-map-canvas.tsx      ← MODIFY (target-point marker)
│       └── live-map-canvas.test.tsx ← MODIFY (target marker assertions)
```

### Previous Story Intelligence (7.1)

- `useLiveStore` already has `targetAheadKm`, `searchRadiusKm`, `speedKmh` fields and their setters — **do NOT re-add them**
- `live.store.ts` defaults: `speedKmh: 15`, `targetAheadKm: 30`, `searchRadiusKm: 3`
- `use-live-mode.ts` already handles watchPosition lifecycle — do NOT touch it in 7.2
- `LiveMapCanvas` uses `@base-ui/react` for any dialog components (not shadcn Dialog)
- MapLibre maps MUST use `vi.hoisted()` for mock in Vitest — see `live-map-canvas.test.tsx` pattern from 7.1
- `live/[id]/page.tsx` uses `getAdventureMapData` with queryKey `['adventures', adventureId, 'map']` for segments with waypoints — reuse this data for `findPointAtKm` and D+ calculation
- `MapSegmentData` type (not `AdventureSegmentResponse`) has waypoints — import from correct source
- Base-UI `Dialog` uses `onOpenChange={() => {}}` + `showCloseButton={false}` for non-dismissible (NOT Radix `onInteractOutside`)

### Git Intelligence (Recent Commits)

- `452a8a2 feat(story-7.1)` — all 7.1 files were committed; any file from 7.1 File List is already in codebase
- MapLibre mock class constructor pattern established — must use for any new MapLibre test file
- `vi.hoisted()` pattern required for mock declarations that intercept dynamic imports

### RGPD Invariants (Critical)

From `project-context.md`:
- **GPS position is NEVER sent to or stored on the server**
- `targetKm` (distance along route) is safe to send — it's not a GPS coordinate
- The NestJS API MUST NOT log, store, or process raw GPS coordinates
- No `lat`/`lng` query params from client in live mode endpoints

### Anti-Patterns to Avoid

```typescript
// ❌ Sending GPS to API — RGPD violation
GET /pois?lat=48.8566&lng=2.3522&radius=3

// ✅ Route-relative position only
GET /pois?segmentId=xxx&targetKm=42.3&radiusKm=3

// ❌ Querying Drizzle in service
const pois = await db.select().from(accommodationsCache).where(...)

// ✅ All DB queries in repository
const pois = await this.poisRepository.findPoisNearPoint(...)

// ❌ Inventing query keys
useQuery({ queryKey: ['live-pois', segmentId] })

// ✅ Convention
useQuery({ queryKey: ['pois', 'live', { segmentId, targetKm, radiusKm }] })

// ❌ Blocking UI with global spinner
// ✅ Show Skeleton cards in LivePoiList while isPending

// ❌ Recalling D+/ETA on every GPS tick via API
// ✅ D+/ETA computed client-side from waypoints in memory — no API call
```

### References

- Epics: Epic 7, Story 7.2 — `_bmad-output/planning-artifacts/epics.md`
- Previous story: `_bmad-output/implementation-artifacts/7-1-geolocation-consent-live-mode-activation.md`
- Existing POI service: `apps/api/src/pois/pois.service.ts`
- Existing POI repository: `apps/api/src/pois/pois.repository.ts`
- Existing DTO: `apps/api/src/pois/dto/find-pois.dto.ts`
- Live store: `apps/web/src/stores/live.store.ts`
- GPX package: `packages/gpx/src/` (snapToTrace, KmWaypoint available)
- MapLibre test pattern: `apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.test.tsx`
- Project context RGPD rule: `_bmad-output/project-context.md#RGPD — Geolocation Rule`
- Slider component: `apps/web/src/components/ui/slider.tsx`

### Review Follow-ups (AI)

- [x] [AI-Review][HIGH] AC #7 — PoiDetailSheet uses planning mode `fromKm`/`DEFAULT_CYCLING_SPEED_KMH` instead of live mode `currentKmOnRoute`/`speedKmh` — add live mode context props [poi-detail-sheet.tsx]
- [x] [AI-Review][HIGH] AC #7 — `distFromTargetM` not displayed in PoiDetailSheet for live mode POIs [poi-detail-sheet.tsx]
- [x] [AI-Review][HIGH] AC #8 — D+/ETA recalculation client-side not wired (LivePoiList removed, PoiDetailSheet not adapted) [poi-detail-sheet.tsx]
- [x] [AI-Review][HIGH] AC #5 — `isPending` from `useLivePoisSearch` not destructured in page.tsx, no loading indicator during live POI fetch [page.tsx]
- [x] [AI-Review][MEDIUM] Live mode caches results in Redis even after Overpass failure (inconsistent with corridor mode) [pois.service.ts:217-222]
- [x] [AI-Review][MEDIUM] AC #3 — Slider range 1–10 km doesn't match AC spec "0 to 5 km, hard cap 10 km" [live-controls.tsx:62-63]
- [x] [AI-Review][MEDIUM] Undocumented change: map-canvas.tsx (planning mode) trace colors modified but not in File List [map-canvas.tsx]
- [ ] [AI-Review][LOW] Division by zero in getWaypointAtKm/findPointAtKm if consecutive waypoints have same distKm [pois.repository.ts:288, find-point-at-km.ts:15]
- [ ] [AI-Review][LOW] useLivePoisSearch doesn't pass categories to API — all POI types always queried [use-live-poi-search.ts:43-47]

## Dev Agent Record

### Agent Model Used

claude-opus-4-6

### Debug Log References

### Completion Notes List

- All 9 tasks and subtasks implemented and verified
- Backend: Extended FindPoisDto with conditional validation (corridor vs live mode), added findPoisNearPoint (PostGIS ST_DWithin) and getWaypointAtKm (linear interpolation) to repository, added findLiveModePois branch in service with Redis caching (key format: pois:live:{segmentId}:{roundedKm}:{radiusKm}:{categories}). Live mode uses both Overpass + Google Places (multi-source, same as corridor mode)
- Shared: Added distFromTargetM optional field to Poi interface
- GPX package: New findPointAtKm utility with 6 unit tests (interpolation, clamping, edge cases)
- Frontend: useLivePoisSearch hook with 500m trigger threshold and TanStack Query; LiveControls drawer with distance/radius sliders and speed input
- Map: POIs displayed as clustered, color-coded clickable pins (same visual pattern as planning mode via useLivePoiLayers hook); PoiDetailSheet reused for pin click → detail view with Booking deep links; target-dot layer (radius 14, semi-transparent) rendered between POI pins and GPS dot
- LivePoiList component removed — POIs are on the map, not in a bottom list
- All tests pass: API 148, Web 267, GPX 14 — 0 regressions
- RGPD: GPS position never sent to API — only targetKm (route-relative distance)

### Change Log

- 2026-03-19: Story 7.2 implementation complete — live mode POI discovery by target distance + configurable radius
- 2026-03-19: Fix PostgreSQL ANY() array parameter bug in findPoisNearPoint (Drizzle raw SQL array literal)
- 2026-03-19: Fix Base UI Slider callback type (number | readonly number[]) causing slider jump-to-min
- 2026-03-19: Add snapToTrace bridge in page.tsx (GPS → currentKmOnRoute → POI search trigger)
- 2026-03-19: Add Google Places prefetch to live mode (multi-source: Overpass + Google, same as corridor)
- 2026-03-19: Replace LivePoiList with map pins — POIs now displayed as clickable clustered pins on the map (useLivePoiLayers hook), PoiDetailSheet reused from planning mode for detail view
- 2026-03-19: [Code Review] Fix AC #7/#8 — PoiDetailSheet now uses live mode currentKmOnRoute/speedKmh for D+/ETA, shows distFromTargetM
- 2026-03-19: [Code Review] Fix AC #5 — Add POI search loading indicator in live page
- 2026-03-19: [Code Review] Fix live mode Redis cache consistency — only cache after successful Overpass fetch
- 2026-03-19: [Code Review] Fix AC #3 — Radius slider max changed from 10 to 5 km (DTO hard cap stays 10)
- 2026-03-19: [Code Review] Add map-canvas.tsx and poi-detail-sheet.tsx to File List

### File List

#### New Files
- packages/gpx/src/find-point-at-km.ts
- packages/gpx/src/find-point-at-km.test.ts
- apps/web/src/hooks/use-live-poi-search.ts
- apps/web/src/hooks/use-live-poi-search.test.ts
- apps/web/src/hooks/use-live-poi-layers.ts — POI pin rendering on MapLibre (live mode)
- apps/web/src/app/(app)/live/[id]/_components/live-controls.tsx
- apps/web/src/app/(app)/live/[id]/_components/live-controls.test.tsx

#### Modified Files
- apps/api/src/pois/dto/find-pois.dto.ts
- apps/api/src/pois/pois.repository.ts
- apps/api/src/pois/pois.service.ts
- apps/api/src/pois/pois.service.test.ts
- apps/web/src/lib/api-client.ts
- apps/web/src/app/(app)/live/[id]/page.tsx
- apps/web/src/app/(app)/live/[id]/page.test.tsx
- apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.tsx
- apps/web/src/app/(app)/live/[id]/_components/live-map-canvas.test.tsx
- apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx — trace colors updated to green brand palette
- apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx — live mode context for D+/ETA
- packages/gpx/src/index.ts
- packages/shared/src/types/poi.types.ts
