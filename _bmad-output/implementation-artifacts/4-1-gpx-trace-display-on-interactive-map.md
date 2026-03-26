# Story 4.1: GPX Trace Display on Interactive Map

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **cyclist user**,
I want to see my adventure's GPX trace on an interactive map,
So that I have a visual overview of my entire route before starting to plan POIs.

## Acceptance Criteria

1. **Given** a user navigates to `(app)/map/[adventureId]`,
   **When** the page loads,
   **Then** the MapLibre GL JS map renders with the adventure's trace as a polyline, centered and fitted to the trace bounds — in under 3s on mobile 4G (FR-020, FR-026, NFR-006).

2. **Given** the map is rendered,
   **When** it is visible,
   **Then** the OSM attribution "© OpenStreetMap contributors" is always visible in the map corner — non-dismissable (FR-036, NFR-044).

3. **Given** a user taps the dark/light toggle,
   **When** the theme switches,
   **Then** the MapLibre style updates to the corresponding OpenFreeMap tile set without reloading the page (FR-021).

4. **Given** an adventure has multiple segments,
   **When** the map loads,
   **Then** all segments are rendered as a continuous trace with a visual distinction at segment joins.

5. **Given** a segment has `parseStatus: 'pending'` or `'error'`,
   **When** the map page loads,
   **Then** only successfully parsed segments are displayed — a banner indicates "X segment(s) en cours de traitement" using `<StatusBanner />`.

## Tasks / Subtasks

### Backend — NestJS API

- [x] Task 1 — Add map-data endpoint in adventures module (AC: #1, #4, #5)
  - [x] 1.1 Add `MapSegmentDto` response type to `packages/shared/src/types/adventure.types.ts`:
    ```typescript
    export interface MapWaypoint {
      lat: number
      lng: number
      ele?: number | null
      distKm: number
    }

    export interface MapSegmentData {
      id: string
      name: string
      orderIndex: number
      cumulativeStartKm: number
      distanceKm: number
      parseStatus: ParseStatus
      waypoints: MapWaypoint[] | null  // null if not parsed yet
      boundingBox: { minLat: number; maxLat: number; minLng: number; maxLng: number } | null
    }

    export interface AdventureMapResponse {
      adventureId: string
      adventureName: string
      totalDistanceKm: number
      segments: MapSegmentData[]
    }
    ```
  - [x] 1.2 Add `getAdventureMapData(adventureId: string, userId: string)` in `apps/api/src/adventures/adventures.repository.ts`:
    ```typescript
    async getAdventureMapData(adventureId: string, userId: string): Promise<AdventureMapResponse | null> {
      // 1. Verify ownership — fetch adventure
      const [adventure] = await db
        .select()
        .from(adventures)
        .where(and(eq(adventures.id, adventureId), eq(adventures.userId, userId)))
      if (!adventure) return null

      // 2. Fetch all segments ordered by orderIndex
      const segments = await db
        .select()
        .from(adventureSegments)
        .where(eq(adventureSegments.adventureId, adventureId))
        .orderBy(asc(adventureSegments.orderIndex))

      return {
        adventureId: adventure.id,
        adventureName: adventure.name,
        totalDistanceKm: adventure.totalDistanceKm,
        segments: segments.map((s) => ({
          id: s.id,
          name: s.name,
          orderIndex: s.orderIndex,
          cumulativeStartKm: s.cumulativeStartKm,
          distanceKm: s.distanceKm,
          parseStatus: s.parseStatus as ParseStatus,
          waypoints: s.waypoints as MapWaypoint[] | null,
          boundingBox: s.boundingBox as MapSegmentData['boundingBox'],
        })),
      }
    }
    ```
  - [x] 1.3 Add method in `apps/api/src/adventures/adventures.service.ts`:
    ```typescript
    async getMapData(adventureId: string, userId: string): Promise<AdventureMapResponse> {
      const data = await this.adventuresRepository.getAdventureMapData(adventureId, userId)
      if (!data) throw new NotFoundException(`Adventure ${adventureId} not found`)
      return data
    }
    ```
  - [x] 1.4 Add route to `apps/api/src/adventures/adventures.controller.ts`:
    ```typescript
    @Get(':id/map')
    @ApiOperation({ summary: 'Get map data (segments with waypoints) for an adventure' })
    async getMapData(
      @Param('id') id: string,
      @CurrentUser() user: CurrentUserPayload,
    ) {
      return this.adventuresService.getMapData(id, user.id)
    }
    ```
    ⚠️ Must be placed BEFORE `@Get(':id')` if any, to avoid route conflict.

- [x] Task 2 — Backend tests (Jest) `apps/api/src/adventures/adventures.service.test.ts` (add cases)
  - [x] 2.1 `getMapData`: returns `AdventureMapResponse` with all segments when adventure exists and user owns it
  - [x] 2.2 `getMapData`: throws `NotFoundException` when adventure not found or user doesn't own it
  - [x] 2.3 `getMapData`: correctly maps `parseStatus`, `waypoints` (null for pending), `boundingBox`

### Frontend — Next.js Web

- [x] Task 3 — Install MapLibre GL JS (AC: #1)
  - [x] 3.1 From `apps/web/`: `pnpm add maplibre-gl`
  - [x] 3.2 From `apps/web/`: `pnpm add -D @types/maplibre-gl` (if needed — maplibre-gl v4 ships its own types, skip if already included)
  - [x] 3.3 Verify `next.config.ts` — MapLibre GL JS v4 uses Web Workers internally. Add transpile if needed:
    ```typescript
    // next.config.ts — only if build error about maplibre-gl ESM
    const nextConfig = {
      transpilePackages: ['maplibre-gl'],
    }
    ```
    Check after `pnpm build` — may not be needed with Next.js 15 + Node.js full runtime.

- [x] Task 4 — Add API client function in `apps/web/src/lib/api-client.ts` (AC: #1)
  - [x] 4.1 Add `getAdventureMapData`:
    ```typescript
    export async function getAdventureMapData(adventureId: string): Promise<AdventureMapResponse> {
      return apiFetch<AdventureMapResponse>(`/api/adventures/${adventureId}/map`)
    }
    ```
  - [x] 4.2 Import `AdventureMapResponse`, `MapSegmentData`, `MapWaypoint` from `@ridenrest/shared`:
    ```typescript
    import type { AdventureMapResponse, MapSegmentData, MapWaypoint } from '@ridenrest/shared'
    ```
  - [x] 4.3 Re-export these types at the bottom of `api-client.ts` for components to use:
    ```typescript
    export type { AdventureMapResponse, MapSegmentData, MapWaypoint }
    ```

- [x] Task 5 — Create `<OsmAttribution />` shared component (AC: #2)
  - [x] 5.1 Create `apps/web/src/components/shared/osm-attribution.tsx`:
    ```tsx
    export function OsmAttribution() {
      return (
        <div className="absolute bottom-5 right-2 z-10 bg-white/80 dark:bg-black/60 text-[10px] text-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded pointer-events-none select-none">
          © <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noopener noreferrer"
            className="pointer-events-auto underline"
          >
            OpenStreetMap
          </a> contributors
        </div>
      )
    }
    ```
    ⚠️ MapLibre GL JS already renders its own attribution by default. To avoid double attribution:
    - Either disable MapLibre's built-in: `attributionControl: false` in Map constructor
    - AND render `<OsmAttribution />` as a React overlay
    - This ensures attribution is always visible regardless of MapLibre version.

- [x] Task 6 — Create map page structure (AC: #1, #2, #3, #4, #5)
  - [x] 6.1 Create `apps/web/src/app/(app)/map/[id]/page.tsx` (Server Component):
    ```tsx
    import { Suspense } from 'react'
    import { MapView } from './_components/map-view'
    import { Skeleton } from '@/components/ui/skeleton'

    interface MapPageProps {
      params: Promise<{ id: string }>
    }

    export default async function MapPage({ params }: MapPageProps) {
      const { id } = await params
      return (
        <div className="relative h-[calc(100vh-4rem)] w-full">
          <Suspense fallback={<Skeleton className="h-full w-full" />}>
            <MapView adventureId={id} />
          </Suspense>
        </div>
      )
    }
    ```
  - [x] 6.2 Create `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` (Client Component, data-fetching wrapper):
    ```tsx
    'use client'
    import { useQuery } from '@tanstack/react-query'
    import { getAdventureMapData } from '@/lib/api-client'
    import { MapCanvas } from './map-canvas'
    import { StatusBanner } from '@/components/shared/status-banner'
    import { Skeleton } from '@/components/ui/skeleton'
    import type { AdventureMapResponse } from '@/lib/api-client'

    interface MapViewProps {
      adventureId: string
    }

    export function MapView({ adventureId }: MapViewProps) {
      const { data, isPending, error } = useQuery<AdventureMapResponse>({
        queryKey: ['adventures', adventureId, 'map'],
        queryFn: () => getAdventureMapData(adventureId),
        staleTime: 1000 * 60 * 5, // 5 min — map data doesn't change unless segments are re-parsed
      })

      if (isPending) return <Skeleton className="h-full w-full" />

      if (error) {
        return (
          <StatusBanner message="Impossible de charger la carte — vérifie ta connexion." />
        )
      }

      const pendingCount = data.segments.filter(
        (s) => s.parseStatus === 'pending' || s.parseStatus === 'processing',
      ).length

      const readySegments = data.segments.filter((s) => s.parseStatus === 'done')

      return (
        <div className="relative h-full w-full">
          {pendingCount > 0 && (
            <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10">
              <StatusBanner
                message={`${pendingCount} segment(s) en cours de traitement — ils apparaîtront automatiquement une fois prêts.`}
              />
            </div>
          )}
          <MapCanvas
            segments={readySegments}
            adventureName={data.adventureName}
          />
        </div>
      )
    }
    ```

- [x] Task 7 — Create `<MapCanvas />` component with MapLibre (AC: #1, #2, #3, #4)
  - [x] 7.1 Create `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx`:
    ```tsx
    'use client'
    import { useEffect, useRef } from 'react'
    import { useTheme } from 'next-themes'
    import { useMapStore } from '@/stores/map.store'
    import { OsmAttribution } from '@/components/shared/osm-attribution'
    import type { MapSegmentData } from '@/lib/api-client'

    // OpenFreeMap tile styles — MIT, commercial ok, OSM attribution required
    const TILE_STYLES = {
      light: 'https://tiles.openfreemap.org/styles/liberty',
      dark: 'https://tiles.openfreemap.org/styles/dark',
    } as const

    // Trace colors — distinguishable in both themes
    const SEGMENT_COLORS = ['#E44C26', '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6']
    const SEGMENT_JOIN_COLOR = '#6B7280'  // gray dot at join points

    interface MapCanvasProps {
      segments: MapSegmentData[]
      adventureName: string
    }

    export function MapCanvas({ segments, adventureName }: MapCanvasProps) {
      const mapContainerRef = useRef<HTMLDivElement>(null)
      const mapRef = useRef<maplibregl.Map | null>(null)
      const { resolvedTheme } = useTheme()
      const { setViewport } = useMapStore()

      // Init MapLibre map
      useEffect(() => {
        if (!mapContainerRef.current || mapRef.current) return

        let map: maplibregl.Map

        // Dynamic import — MapLibre GL JS is browser-only, no SSR
        import('maplibre-gl').then((maplibregl) => {
          map = new maplibregl.Map({
            container: mapContainerRef.current!,
            style: resolvedTheme === 'dark' ? TILE_STYLES.dark : TILE_STYLES.light,
            center: [2.3522, 46.2276],  // France fallback center
            zoom: 5,
            attributionControl: false,  // Disabled — using <OsmAttribution /> React component
          })
          mapRef.current = map

          map.on('load', () => {
            addTraceLayers(map, segments)
            fitToTrace(map, segments)

            // Sync viewport to store
            map.on('moveend', () => {
              const center = map.getCenter()
              setViewport(map.getZoom(), [center.lat, center.lng])
            })
          })
        })

        return () => {
          map?.remove()
          mapRef.current = null
        }
      }, [])  // Init once — segment changes handled by separate effect

      // Update trace when segments change (e.g., after a pending segment finishes parsing)
      useEffect(() => {
        const map = mapRef.current
        if (!map || !map.isStyleLoaded()) return
        updateTraceLayers(map, segments)
      }, [segments])

      // Theme switching — update map style without reloading the page (AC #3)
      useEffect(() => {
        const map = mapRef.current
        if (!map) return
        const newStyle = resolvedTheme === 'dark' ? TILE_STYLES.dark : TILE_STYLES.light
        map.setStyle(newStyle)
        // Re-add layers after style change (MapLibre resets layers on setStyle)
        map.once('style.load', () => {
          addTraceLayers(map, segments)
        })
      }, [resolvedTheme])

      return (
        <div className="relative h-full w-full">
          <div ref={mapContainerRef} className="h-full w-full" />
          <OsmAttribution />
        </div>
      )
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    function buildGeoJsonFeatures(segments: MapSegmentData[]) {
      return segments
        .filter((s) => s.waypoints && s.waypoints.length >= 2)
        .map((segment, idx) => ({
          type: 'Feature' as const,
          properties: {
            segmentId: segment.id,
            segmentIndex: idx,
            color: SEGMENT_COLORS[idx % SEGMENT_COLORS.length],
          },
          geometry: {
            type: 'LineString' as const,
            coordinates: segment.waypoints!.map((wp) => [wp.lng, wp.lat]),
          },
        }))
    }

    function buildJoinPoints(segments: MapSegmentData[]) {
      // Points at the junctions between consecutive segments
      const points: GeoJSON.Feature[] = []
      for (let i = 0; i < segments.length - 1; i++) {
        const current = segments[i]
        const last = current.waypoints?.[current.waypoints.length - 1]
        if (last) {
          points.push({
            type: 'Feature',
            properties: { type: 'join' },
            geometry: { type: 'Point', coordinates: [last.lng, last.lat] },
          })
        }
      }
      return points
    }

    function addTraceLayers(map: maplibregl.Map, segments: MapSegmentData[]) {
      const lineFeatures = buildGeoJsonFeatures(segments)
      const joinFeatures = buildJoinPoints(segments)

      // Source — segments as GeoJSON FeatureCollection
      map.addSource('trace', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: lineFeatures },
      })

      // Line layer
      map.addLayer({
        id: 'trace-line',
        type: 'line',
        source: 'trace',
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': ['get', 'color'],
          'line-width': 3,
          'line-opacity': 0.9,
        },
      })

      // Segment join markers
      if (joinFeatures.length > 0) {
        map.addSource('trace-joins', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: joinFeatures },
        })
        map.addLayer({
          id: 'trace-joins-circle',
          type: 'circle',
          source: 'trace-joins',
          paint: {
            'circle-radius': 5,
            'circle-color': SEGMENT_JOIN_COLOR,
            'circle-stroke-color': '#ffffff',
            'circle-stroke-width': 1.5,
          },
        })
      }
    }

    function updateTraceLayers(map: maplibregl.Map, segments: MapSegmentData[]) {
      const source = map.getSource('trace') as maplibregl.GeoJSONSource | undefined
      if (!source) {
        addTraceLayers(map, segments)
        return
      }
      source.setData({
        type: 'FeatureCollection',
        features: buildGeoJsonFeatures(segments),
      })
      const joinSource = map.getSource('trace-joins') as maplibregl.GeoJSONSource | undefined
      joinSource?.setData({
        type: 'FeatureCollection',
        features: buildJoinPoints(segments),
      })
    }

    function fitToTrace(map: maplibregl.Map, segments: MapSegmentData[]) {
      const allBounds = segments
        .filter((s) => s.boundingBox !== null)
        .map((s) => s.boundingBox!)

      if (allBounds.length === 0) return

      const minLat = Math.min(...allBounds.map((b) => b.minLat))
      const maxLat = Math.max(...allBounds.map((b) => b.maxLat))
      const minLng = Math.min(...allBounds.map((b) => b.minLng))
      const maxLng = Math.max(...allBounds.map((b) => b.maxLng))

      map.fitBounds(
        [[minLng, minLat], [maxLng, maxLat]],
        { padding: 40, maxZoom: 14, animate: false },
      )
    }
    ```
    ⚠️ `maplibregl.Map` type usage: import the `Map` type from `'maplibre-gl'` in the module scope for TypeScript but instantiate at runtime via dynamic import. Pattern: use `useRef<any>` or import the full `maplibregl` namespace type at top and dynamic import in effect.

  - [x] 7.2 Add MapLibre CSS to the map page layout (required or tiles won't render):
    In `apps/web/src/app/(app)/map/[id]/page.tsx` (or its layout), add:
    ```tsx
    import 'maplibre-gl/dist/maplibre-gl.css'
    ```
    ⚠️ CSS import in a Server Component is fine — Next.js handles it via its CSS bundler. Do NOT put it inside a `'use client'` component if avoidable.

  - [x] 7.3 Verify `maplibre-gl` types are used correctly — map ref typing:
    ```tsx
    import type maplibregl from 'maplibre-gl'
    const mapRef = useRef<maplibregl.Map | null>(null)
    ```
    This imports only the type (no runtime bundle), then the actual `Map` class comes from the dynamic import in `useEffect`.

- [x] Task 8 — Add "Voir la carte" button on adventure detail page (bonus UX, not in ACs but needed for navigation)
  - [x] 8.1 In `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx`, add a "Voir la carte" link-button in the adventure header area:
    ```tsx
    import Link from 'next/link'
    // ...
    <Link href={`/map/${adventureId}`}>
      <Button variant="outline" size="sm">Voir la carte</Button>
    </Link>
    ```
    ⚠️ Only render if at least 1 segment with `parseStatus === 'done'` exists — avoid navigating to an empty map.

- [x] Task 9 — Frontend tests (Vitest)
  - [x] 9.1 `map-view.test.tsx`:
    - When `isPending`: shows `<Skeleton />`
    - When `error`: shows `<StatusBanner message="Impossible de charger la carte..." />`
    - When data loads with 1 pending segment: shows pending banner + renders `<MapCanvas />` with filtered segments
    - When all segments are `parseStatus: 'done'`: no banner, renders `<MapCanvas />`
    - Mock `getAdventureMapData` via `vi.mock('@/lib/api-client', ...)`
  - [x] 9.2 `map-canvas.test.tsx`:
    - Mock `maplibre-gl` entirely (WebGL unavailable in jsdom)
    - Test that `<OsmAttribution />` is rendered
    - Test that `fitToTrace` is called on mount
    ```typescript
    vi.mock('maplibre-gl', () => ({
      default: {
        Map: vi.fn().mockImplementation(() => ({
          on: vi.fn(),
          once: vi.fn(),
          addSource: vi.fn(),
          addLayer: vi.fn(),
          getSource: vi.fn(),
          isStyleLoaded: vi.fn().mockReturnValue(false),
          fitBounds: vi.fn(),
          setStyle: vi.fn(),
          remove: vi.fn(),
        })),
      },
    }))
    ```
  - [x] 9.3 `osm-attribution.test.tsx`:
    - Renders with the OSM link to openstreetmap.org/copyright
    - Link opens in `_blank` with `rel="noopener noreferrer"`

---

## Dev Notes

### CRITICAL: What's Already Done (Stories 1.x–3.5) — Do NOT Redo

**`apps/api` — existing infrastructure:**
- ✅ `JwtAuthGuard` — global, protects `GET /adventures/:id/map` automatically
- ✅ `AdventuresModule` + `AdventuresController` + `AdventuresService` + `AdventuresRepository` — add the `getMapData` method to existing files
- ✅ `ResponseInterceptor` — global, wraps `AdventureMapResponse` automatically in `{ data: {...} }`
- ✅ `adventure_segments` table with `waypoints JSONB`, `boundingBox JSONB`, `parseStatus` fields
- ✅ `CurrentUser()` decorator at `apps/api/src/common/decorators/current-user.decorator.ts`
- ✅ Drizzle imports pattern: `import { db, adventures, adventureSegments } from '@ridenrest/database'`

**`apps/web` — existing infrastructure:**
- ✅ `useMapStore` at `apps/web/src/stores/map.store.ts` — `visibleLayers`, `fromKm/toKm`, `setViewport` already defined
- ✅ `apiFetch` at `apps/web/src/lib/api-client.ts` — handles JWT Bearer header + refresh
- ✅ `<StatusBanner />` at `apps/web/src/components/shared/status-banner.tsx` — reuse, don't create
- ✅ `<Skeleton />` at `apps/web/src/components/ui/skeleton.tsx` — shadcn component
- ✅ `(app)/layout.tsx` — auth-gated layout already in place
- ✅ TanStack Query provider already configured in app layout
- ✅ `next-themes` already installed for dark/light theme (`useTheme()` available)
- ✅ `AdventureSegmentResponse` in `packages/shared` has `boundingBox` and `parseStatus`
- ✅ `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx` — existing component to link from

**What does NOT exist yet:**
- ❌ `apps/web/src/app/(app)/map/` route directory — create from scratch
- ❌ `apps/web/src/components/shared/osm-attribution.tsx` — create
- ❌ `maplibre-gl` package not installed in `apps/web` — install first
- ❌ `GET /adventures/:id/map` endpoint — add to existing adventures controller
- ❌ `MapSegmentData`, `MapWaypoint`, `AdventureMapResponse` types — add to `packages/shared`

---

### Architecture: MapLibre GL JS Integration Patterns

**Browser-only, no SSR:**
MapLibre GL JS requires WebGL and the DOM. NEVER import it at module level in a component — it will crash during SSR. Use dynamic import inside `useEffect`:

```typescript
// ✅ Correct pattern
useEffect(() => {
  import('maplibre-gl').then((maplibregl) => {
    const map = new maplibregl.Map({ ... })
  })
}, [])

// ❌ Will crash on SSR
import maplibregl from 'maplibre-gl'
const map = new maplibregl.Map({ ... })
```

**MapLibre CSS — MANDATORY:**
Without `maplibre-gl/dist/maplibre-gl.css`, the map container renders blank. Import it in the Server Component page or in a CSS file.

**MapLibre container sizing:**
The map container div MUST have explicit dimensions (height/width). `h-full w-full` only works if the parent has a defined height. Set `h-[calc(100vh-4rem)]` on the page wrapper (subtract nav height ~4rem/64px).

**OpenFreeMap styles:**
```
Light: https://tiles.openfreemap.org/styles/liberty
Dark:  https://tiles.openfreemap.org/styles/dark
```
Both are MIT licensed for commercial use. OSM attribution is required (ODbL).

**setStyle() behavior:**
When calling `map.setStyle(newStyle)`, MapLibre removes ALL sources and layers. You MUST re-add your trace layers using `map.once('style.load', () => { addTraceLayers(map, segments) })`.

**fitBounds() on mount:**
Use `animate: false` on initial fit to avoid jarring animation. Use `{ padding: 40 }` to leave breathing room around the trace.

---

### Architecture: Waypoints Data Format

The `waypoints` JSONB field in `adventure_segments` is populated by the GPX parse job (BullMQ `parse-segment`). The format stored by `apps/api/src/segments/jobs/gpx-parse.processor.ts` is:

```typescript
// Stored in adventure_segments.waypoints
Array<{
  lat: number
  lng: number
  ele: number | null      // elevation in meters (optional in GPX)
  distKm: number          // cumulative distance from segment start
}>
```

After RDP simplification (`packages/gpx/src/rdp.ts`), the array is reduced from ~50k points to ~2k points — safe to transfer via the API without pagination.

For MapLibre GeoJSON LineString, coordinates must be `[lng, lat]` (longitude first — GeoJSON spec). The conversion:
```typescript
coordinates: segment.waypoints.map((wp) => [wp.lng, wp.lat])
```

**Never use `[lat, lng]`** in GeoJSON — this is a common mistake that renders traces in the wrong hemisphere.

---

### Architecture: Zustand useMapStore — What to Use

From `apps/web/src/stores/map.store.ts` (already implemented):
```typescript
// Available:
const { setViewport, visibleLayers, fromKm, toKm } = useMapStore()

// Types:
export type MapLayer = 'accommodations' | 'restaurants' | 'supplies' | 'bike'
```

For story 4.1, use `setViewport(zoom, [lat, lng])` to sync map state when user pans/zooms. `visibleLayers` and `fromKm/toKm` are for stories 4.2 and 4.3 respectively — do NOT implement those here.

---

### Architecture: TanStack Query — Query Key for Map Data

Per project convention:
```typescript
// ✅ Map data query key
queryKey: ['adventures', adventureId, 'map']

// This follows the convention:
['adventures']                              // list
['adventures', adventureId]                 // single item
['adventures', adventureId, 'segments']    // sub-resource (existing)
['adventures', adventureId, 'map']         // map data (this story)
```

`staleTime: 1000 * 60 * 5` — 5 minutes. Map data is stable (GPX doesn't change unless segments are deleted/replaced), but don't cache indefinitely in case a pending segment finishes parsing.

---

### Architecture: Theme Switching — next-themes Integration

`next-themes` is already installed and configured (from Epic 1/2 stories). The `useTheme()` hook provides:
```typescript
const { resolvedTheme } = useTheme()
// resolvedTheme: 'light' | 'dark' (resolves system preference, never 'system')
```

Use `resolvedTheme` (not `theme`) to avoid the `'system'` case.

The dark mode toggle is in `apps/web/src/app/(app)/settings/_components/theme-toggle.tsx` (or similar). When the user switches themes, the `MapCanvas` `useEffect` on `[resolvedTheme]` will call `map.setStyle()` and re-add layers.

---

### Architecture: Waypoints Potential Null Safety

Segments with `parseStatus !== 'done'` have `waypoints: null` in the DB. The `MapView` component filters to `readySegments` before passing to `MapCanvas`. Inside `MapCanvas`, `buildGeoJsonFeatures` additionally filters `s.waypoints && s.waypoints.length >= 2` — defensive double-guard.

An adventure could have ALL segments pending (just uploaded). In that case `readySegments` is empty → `<MapCanvas />` renders an empty map with just the basemap tiles → acceptable UX (user sees the map with the pending banner).

---

### Architecture: NestJS Route Ordering — CRITICAL

In NestJS controllers, routes are matched in declaration order. If the adventures controller has `@Get(':id')`, a new `@Get(':id/map')` must be declared **before** it, otherwise `:id` captures "id/map" and the route is never reached:

```typescript
@Controller('adventures')
export class AdventuresController {
  // ✅ More specific routes FIRST
  @Get(':id/map')
  async getMapData(...) { ... }

  @Get(':id/segments')
  async getSegments(...) { ... }

  // Generic route LAST
  @Get(':id')
  async getAdventure(...) { ... }
}
```

Check the current route order in `apps/api/src/adventures/adventures.controller.ts` before adding the new route.

---

### Architecture: Previous Story Learnings (from Story 3.5)

Patterns confirmed in story 3.5 that apply here:
- `authDb` (serverless pool, max:2) for Next.js server components; `db` (main pool, max:10) for NestJS — **do NOT mix**
- Import `AdventureSegmentResponse` and other types from `'@ridenrest/shared'` (not subpath imports)
- `Button` wrapping `Link` causes nested interactive HTML — use `<Link href="..."><Button>...</Button></Link>` structure or style Link directly
- `drizzle-kit push` may try to drop PostGIS tables — if migration needed, create manual SQL instead
- `afterEach(cleanup)` needed in Vitest tests when using React Testing Library

**From story 3.5 Review Follow-ups (not yet addressed):**
These are in `3-5` review notes but may need attention in this story's adjacent code:
- `[AI-Review][LOW]` Button wrapping Link anti-pattern — avoid in the "Voir la carte" button (Task 8.1)

---

### Project Structure Notes

**Files to CREATE:**
```
apps/web/src/app/(app)/map/[id]/page.tsx                    ← Server Component, map route
apps/web/src/app/(app)/map/[id]/_components/map-view.tsx    ← 'use client', TanStack Query wrapper
apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx  ← 'use client', MapLibre GL JS
apps/web/src/app/(app)/map/[id]/_components/map-view.test.tsx
apps/web/src/app/(app)/map/[id]/_components/map-canvas.test.tsx
apps/web/src/components/shared/osm-attribution.tsx
apps/web/src/components/shared/osm-attribution.test.tsx
```

**Files to MODIFY:**
```
packages/shared/src/types/adventure.types.ts        ← Add MapWaypoint, MapSegmentData, AdventureMapResponse
packages/shared/src/index.ts                        ← Export new types
apps/api/src/adventures/adventures.repository.ts    ← Add getAdventureMapData()
apps/api/src/adventures/adventures.service.ts       ← Add getMapData()
apps/api/src/adventures/adventures.controller.ts    ← Add GET :id/map route (BEFORE :id route)
apps/api/src/adventures/adventures.service.test.ts  ← Add 3 new test cases (Task 2)
apps/web/src/lib/api-client.ts                      ← Add getAdventureMapData + type imports/exports
apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx  ← Add "Voir la carte" button
package.json (apps/web)                             ← maplibre-gl dependency added via pnpm
```

**No DB migration required** — this story uses existing `waypoints` and `boundingBox` fields in `adventure_segments`. No schema changes.

---

### Anti-Patterns to Avoid

```typescript
// ❌ Module-level MapLibre import (crashes SSR)
import maplibregl from 'maplibre-gl'
const map = new maplibregl.Map({ ... })
// ✅ Dynamic import inside useEffect
useEffect(() => {
  import('maplibre-gl').then((m) => { new m.Map({ ... }) })
}, [])

// ❌ Missing MapLibre CSS
// Map renders blank/white
// ✅ Import at top of page.tsx (Server Component)
import 'maplibre-gl/dist/maplibre-gl.css'

// ❌ GeoJSON coordinates in [lat, lng] order
coordinates: waypoints.map(wp => [wp.lat, wp.lng])
// ✅ GeoJSON always [lng, lat]
coordinates: waypoints.map(wp => [wp.lng, wp.lat])

// ❌ Not re-adding layers after setStyle()
map.setStyle(newStyle)
// Layers disappear — setStyle() resets all sources/layers
// ✅ Re-add after style.load event
map.setStyle(newStyle)
map.once('style.load', () => addTraceLayers(map, segments))

// ❌ New route after generic :id route (NestJS)
@Get(':id')           // matches /adventures/123/map → wrong!
@Get(':id/map')       // never reached
// ✅ Specific routes before generic
@Get(':id/map')       // matched first
@Get(':id')           // fallback

// ❌ MapLibre attribution + OsmAttribution both visible (double attribution)
new Map({ attributionControl: true })  // MapLibre default
// ✅ Disable MapLibre's built-in, use our React component
new Map({ attributionControl: false })
<OsmAttribution />

// ❌ Using theme: 'system' instead of resolvedTheme
const { theme } = useTheme()   // 'system' doesn't map to a style URL
// ✅
const { resolvedTheme } = useTheme()  // always 'light' or 'dark'

// ❌ Applying fromKm/toKm or visibleLayers logic in this story
// That's story 4.3 and 4.2 respectively — DO NOT implement POI loading here
// ✅ Only implement GPX trace display — store is already set up for future use

// ❌ Query key invention
queryKey: ['map', adventureId]
queryKey: ['adventureMap', adventureId]
// ✅ Convention
queryKey: ['adventures', adventureId, 'map']
```

---

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 4, Story 4.1 ACs: FR-020, FR-021, FR-026, FR-036, NFR-006, NFR-044]
- [Source: _bmad-output/planning-artifacts/architecture.md — Frontend Architecture section: MapLibre GL JS v4, useMapStore, OpenFreeMap tiles, file structure `(app)/map/[id]/`, component list]
- [Source: _bmad-output/planning-artifacts/architecture.md — Data Flow Pattern #2: GET /pois corridor search flow (context for future stories)]
- [Source: _bmad-output/planning-artifacts/architecture.md — Project Structure: `apps/web/src/app/(app)/map/[id]/_components/` expected components]
- [Source: _bmad-output/project-context.md — NestJS module rules, ResponseInterceptor, query key conventions, anti-patterns, OSM attribution requirement]
- [Source: _bmad-output/project-context.md — Technology Stack: MapLibre GL JS v4, Zustand v5, TanStack Query v5, next-themes]
- [Source: apps/web/src/stores/map.store.ts — useMapStore: MapLayer type, setViewport, toggleLayer, setSearchRange actions]
- [Source: packages/database/src/schema/adventure-segments.ts — adventure_segments: waypoints JSONB, boundingBox JSONB, geom PostGIS, parseStatus enum]
- [Source: packages/shared/src/types/adventure.types.ts — AdventureSegmentResponse current shape, ParseStatus type]
- [Source: _bmad-output/implementation-artifacts/3-5-strava-activity-import-as-segment.md — authDb vs db pattern, Button/Link anti-pattern, drizzle-kit PostGIS issue, Vitest cleanup]

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

N/A — Build and tests passed cleanly.

### Completion Notes List

- ✅ Task 1: Added `MapWaypoint`, `MapSegmentData`, `AdventureMapResponse` types to `packages/shared` and exported from index.ts
- ✅ Task 1: Added `getAdventureMapData()` to adventures.repository.ts using Drizzle + ownership verification
- ✅ Task 1: Added `getMapData()` to adventures.service.ts with NotFoundException guard
- ✅ Task 1: Added `GET :id/map` route to adventures.controller.ts BEFORE `GET :id` (NestJS route ordering fix)
- ✅ Task 2: Added 3 new Jest test cases for `getMapData` in adventures.service.test.ts — 64/64 pass
- ✅ Task 3: Installed maplibre-gl v5.20.1 (ships own types, no @types needed). No transpilePackages needed with Next.js 15.
- ✅ Task 4: Added `getAdventureMapData()` + type re-exports to api-client.ts
- ✅ Task 5: Updated existing `osm-attribution.tsx` (minimal stub existed) with absolute positioning, dark mode, pointer-events as specified
- ✅ Task 6: Created `(app)/map/[id]/page.tsx` (Server Component) with MapLibre CSS import + `(app)/map/[id]/_components/map-view.tsx` (Client Component, TanStack Query)
- ✅ Task 7: Created `map-canvas.tsx` with dynamic MapLibre import (browser-only, no SSR), theme switching via `map.setStyle()` + `style.load`, fitBounds on mount, OsmAttribution overlay. Type import pattern: `import type maplibregl from 'maplibre-gl'` at module level + dynamic import in useEffect.
- ✅ Task 8: Added "Voir la carte" link-button in adventure-detail.tsx, only shown when ≥1 segment has `parseStatus === 'done'`. Used `<Link href={...}><Button>...</Button></Link>` pattern (avoids Button/Link anti-pattern noted in story 3.5).
- ✅ Task 9: All 76 vitest tests pass. Fixed vitest globals (no globals:true in config — must import describe/it/expect from 'vitest'). Fixed maplibre-gl mock constructor issue (arrow function → regular function).

### Review Follow-ups (AI) — Applied 2026-03-15

- [x] [AI-Review][HIGH] AC #5: error segments not counted in banner — added `errorCount` + separate error `<StatusBanner />` in `map-view.tsx`
- [x] [AI-Review][HIGH] No `refetchInterval` — pending segments never auto-appeared — added `refetchInterval: 3000` while pending/processing, `staleTime: 0` in `map-view.tsx`
- [x] [AI-Review][HIGH] Async import not cancelled on unmount — added `let cancelled = false` guard in `map-canvas.tsx`
- [x] [AI-Review][MEDIUM] `fitBounds` assertion missing in `map-canvas.test.tsx` — added `waitFor` + `act` test that asserts `fitBounds` called with correct bounds
- [x] [AI-Review][MEDIUM] `adventureName` prop unused — added as `aria-label` + `role="application"` on map container in `map-canvas.tsx`
- [x] [AI-Review][MEDIUM] `updateTraceLayers` didn't add join source dynamically — fixed to `addSource`+`addLayer` when join points appear for first time in `map-canvas.tsx`
- [x] [AI-Review][MEDIUM] Missing `eslint-disable` on intentional exhaustive-deps violations — added in both init and theme effects in `map-canvas.tsx`
- [x] [AI-Review][LOW] NotFoundException leaked `adventureId` in error message — changed to generic 'Adventure not found' in `adventures.service.ts`
- [x] [AI-Review][MEDIUM] Error segment test missing for AC #5 — added `map-view.test.tsx` test case for error status

### File List

**Created:**
- `apps/web/src/app/(app)/map/[id]/page.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/map-view.test.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.test.tsx`
- `apps/web/src/components/shared/osm-attribution.test.tsx`

**Modified:**
- `packages/shared/src/types/adventure.types.ts` — Added MapWaypoint, MapSegmentData, AdventureMapResponse
- `packages/shared/src/index.ts` — Exported new types
- `apps/api/src/adventures/adventures.repository.ts` — Added getAdventureMapData()
- `apps/api/src/adventures/adventures.service.ts` — Added getMapData(), fixed NotFoundException message
- `apps/api/src/adventures/adventures.controller.ts` — Added GET :id/map route (before :id)
- `apps/api/src/adventures/adventures.service.test.ts` — Added 3 getMapData test cases + error message assertion
- `apps/web/src/lib/api-client.ts` — Added getAdventureMapData() + type imports/re-exports
- `apps/web/src/components/shared/osm-attribution.tsx` — Updated to map-ready overlay version
- `apps/web/src/app/(app)/adventures/[id]/_components/adventure-detail.tsx` — Added "Voir la carte" link-button
- `apps/web/package.json` — maplibre-gl v5.20.1 added via pnpm
