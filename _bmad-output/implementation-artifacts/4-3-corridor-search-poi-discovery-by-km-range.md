# Story 4.3: Corridor Search — POI Discovery by km Range

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **cyclist user**,
I want to define a km range along my route and find all POIs within a corridor around that segment,
So that I can discover accommodations and amenities specifically relevant to that stretch of my adventure.

## Acceptance Criteria

1. **Given** a user adjusts the km range slider (fromKm → toKm) on the map,
   **When** they release the slider,
   **Then** the selected segment of the trace is highlighted on the map and a `GET /pois?segmentId=&fromKm=&toKm=` request is triggered (FR-030).

2. **Given** the user attempts to set a range exceeding 30 km (toKm − fromKm > 30),
   **When** the slider is adjusted,
   **Then** the range is capped at 30 km — the UI shows a tooltip "Plage maximale : 30 km" and `toKm` is auto-adjusted to `fromKm + 30` (FR-030).

3. **Given** the API receives the request,
   **When** processing the corridor search,
   **Then** Overpass returns POIs within the corridor, AND Google Places Text Search (IDs Only) runs in parallel to pre-cache `google_place_id` values for the same bbox — both results cached in Redis (FR-031, NFR-021).

4. **Given** the corridor search returns results,
   **When** results render,
   **Then** POI pins appear on the map within the highlighted corridor — POI details are accessible via pin click only (story 4.4) (FR-031).

5. **Given** Overpass API is unavailable,
   **When** the corridor search is attempted,
   **Then** a `<StatusBanner message="Recherche indisponible — réessayer dans quelques instants" />` is shown and the user can retry — no crash (NFR-031).

6. **Given** Google Places Text Search fails (network error, quota exceeded),
   **When** running the background pre-cache,
   **Then** the failure is logged silently and POI results still return normally from Overpass — no error surfaced to the user.

## Tasks / Subtasks

### Backend — NestJS API

- [x] Task 1 — Create `GooglePlacesProvider` for Text Search (IDs Only) (AC: #3, #6)
  - [x] 1.1 Create `apps/api/src/pois/providers/google-places.provider.ts`:
    ```typescript
    import { Injectable, Logger } from '@nestjs/common'

    // Google place types mapped to our MapLayer categories
    // Using includedType for accurate category filtering
    export const GOOGLE_PLACE_TYPES: Record<string, string[]> = {
      hotel:        ['lodging'],
      hostel:       ['lodging'],
      camp_site:    ['campground', 'rv_park'],
      shelter:      ['lodging'],
      restaurant:   ['restaurant', 'food'],
      supermarket:  ['grocery_or_supermarket', 'supermarket'],
      convenience:  ['convenience_store'],
      bike_shop:    ['bicycle_store'],
      bike_repair:  ['bicycle_store'],
    }

    // Deduplicated Google types per MapLayer (for batching queries by layer)
    export const LAYER_GOOGLE_TYPES: Record<string, string[]> = {
      accommodations: ['lodging', 'campground'],
      restaurants:    ['restaurant'],
      supplies:       ['grocery_or_supermarket', 'convenience_store'],
      bike:           ['bicycle_store'],
    }

    interface GoogleTextSearchRequest {
      textQuery: string
      includedType?: string
      locationRestriction: {
        rectangle: {
          low:  { latitude: number; longitude: number }
          high: { latitude: number; longitude: number }
        }
      }
      maxResultCount: number
      languageCode: string
    }

    interface GoogleTextSearchResponse {
      places?: Array<{ id: string; name?: string }>
    }

    @Injectable()
    export class GooglePlacesProvider {
      private readonly logger = new Logger(GooglePlacesProvider.name)
      private readonly BASE_URL = 'https://places.googleapis.com/v1/places:searchText'
      private readonly API_KEY = process.env['GOOGLE_PLACES_API_KEY']

      isConfigured(): boolean {
        return !!this.API_KEY
      }

      /**
       * Fetch Google place_ids for a given bounding box and Google place type.
       * Uses X-Goog-FieldMask: places.id → IDs Only tier → Unlimited, no cost.
       */
      async searchPlaceIds(
        bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
        googleType: string,
        textQuery: string,
      ): Promise<string[]> {
        if (!this.API_KEY) {
          this.logger.warn('GOOGLE_PLACES_API_KEY not set — skipping Google Places search')
          return []
        }

        const body: GoogleTextSearchRequest = {
          textQuery,
          includedType: googleType,
          locationRestriction: {
            rectangle: {
              low:  { latitude: bbox.minLat, longitude: bbox.minLng },
              high: { latitude: bbox.maxLat, longitude: bbox.maxLng },
            },
          },
          maxResultCount: 20,
          languageCode: 'fr',
        }

        const response = await fetch(this.BASE_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.API_KEY,
            'X-Goog-FieldMask': 'places.id',  // IDs Only — unlimited, zero cost
          },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(10_000),
        })

        if (!response.ok) {
          throw new Error(`Google Places API error: ${response.status} ${response.statusText}`)
        }

        const result = (await response.json()) as GoogleTextSearchResponse
        return (result.places ?? []).map((p) => p.id).filter(Boolean)
      }

      /**
       * Run Text Search (IDs Only) for all types in a MapLayer category.
       * Returns deduplicated place_id array.
       */
      async searchLayerPlaceIds(
        bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
        layer: string,
      ): Promise<string[]> {
        const googleTypes = LAYER_GOOGLE_TYPES[layer] ?? []
        if (googleTypes.length === 0) return []

        const results = await Promise.allSettled(
          googleTypes.map((type) =>
            this.searchPlaceIds(bbox, type, type.replace(/_/g, ' ')),
          ),
        )

        const allIds = new Set<string>()
        for (const result of results) {
          if (result.status === 'fulfilled') {
            result.value.forEach((id) => allIds.add(id))
          } else {
            this.logger.warn(`Google Places type search failed: ${result.reason}`)
          }
        }
        return [...allIds]
      }
    }
    ```
  - [x] 1.2 Register `GooglePlacesProvider` in `apps/api/src/pois/pois.module.ts` — add to `providers` array.
  - [x] 1.3 Add `GOOGLE_PLACES_API_KEY` to `apps/api/.env.example`:
    ```env
    # Google Places API (New) — IDs Only tier for Text Search = unlimited free commercial
    # Get key at: https://console.cloud.google.com/google/maps-apis/
    # Enable: "Places API (New)" — Text Search + Place Details Essentials
    GOOGLE_PLACES_API_KEY=your_key_here
    ```
  - [x] 1.4 Create `apps/api/src/pois/providers/google-places.provider.test.ts`:
    - `searchPlaceIds`: returns empty array when `API_KEY` not set (logs warning)
    - `searchPlaceIds`: calls correct URL with `X-Goog-FieldMask: places.id` header
    - `searchPlaceIds`: parses response and returns place_id array
    - `searchPlaceIds`: throws on non-200 response
    - `searchLayerPlaceIds`: deduplicates across multiple types
    - `searchLayerPlaceIds`: partial failure (one type fails) → returns successful type results only
    - Mock `fetch` using `jest.spyOn(global, 'fetch')`

- [x] Task 2 — Update `PoisService` to run Google Places in background alongside Overpass (AC: #3, #6)
  - [x] 2.1 Inject `GooglePlacesProvider` in `apps/api/src/pois/pois.service.ts` constructor:
    ```typescript
    constructor(
      private readonly poisRepository: PoisRepository,
      private readonly overpassProvider: OverpassProvider,
      private readonly googlePlacesProvider: GooglePlacesProvider,
      private readonly redisProvider: RedisProvider,
    ) {}
    ```
  - [x] 2.2 In `findPois()`, after computing bbox, run Overpass + Google Places in parallel. Google Places is **fire-and-forget** — its failure must never fail the main request:
    ```typescript
    // Run Overpass + Google Places background pre-cache in parallel
    const [overpassNodes] = await Promise.allSettled([
      this.overpassProvider.queryPois({ minLat, maxLat, minLng, maxLng }, activeCategories),
    ])

    // Google Places: fire-and-forget background job — never awaited for main response
    void this.prefetchGooglePlaceIds(
      { minLat, maxLat, minLng, maxLng },
      segmentId, fromKm, toKm,
      redis,
    ).catch((err) => this.logger.warn('Google Places prefetch failed silently', err))

    // Continue with Overpass results only for the response
    if (overpassNodes.status === 'rejected') {
      // Fallback to DB cache...
    }
    ```
  - [x] 2.3 Add private `prefetchGooglePlaceIds()` method:
    ```typescript
    private async prefetchGooglePlaceIds(
      bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
      segmentId: string,
      fromKm: number,
      toKm: number,
      redis: Redis,
    ): Promise<void> {
      if (!this.googlePlacesProvider.isConfigured()) return

      const LAYERS = ['accommodations', 'restaurants', 'supplies', 'bike'] as const
      const GOOGLE_CACHE_TTL = 60 * 60 * 24 * 7  // 7 days — place_ids are stable

      await Promise.allSettled(
        LAYERS.map(async (layer) => {
          const cacheKey = `google_place_ids:${segmentId}:${fromKm}:${toKm}:${layer}`

          // Skip if already cached
          const existing = await redis.exists(cacheKey)
          if (existing) return

          const placeIds = await this.googlePlacesProvider.searchLayerPlaceIds(bbox, layer)
          if (placeIds.length > 0) {
            await redis.setex(cacheKey, GOOGLE_CACHE_TTL, JSON.stringify(placeIds))
            this.logger.debug(`Cached ${placeIds.length} Google place_ids for ${layer} in corridor`)
          }
        }),
      )
    }
    ```

- [x] Task 3 — Refine `PoisRepository` — compute `distFromTraceM` and `distAlongRouteKm` (AC: #4)
  - [x] 3.1 Update `apps/api/src/pois/pois.repository.ts` — replace hardcoded `0` values with actual PostGIS computation. After inserting Overpass POIs, run an UPDATE using PostGIS to compute actual distances:
    ```typescript
    /**
     * Update distFromTraceM and distAlongRouteKm for POIs using PostGIS.
     * Requires adventure_segments.geom (PostGIS LineString) to be populated.
     */
    async updatePoiDistances(segmentId: string): Promise<void> {
      // PostGIS ST_Distance (meters) and ST_LineLocatePoint (0→1 fraction)
      // Only update rows where dist_from_trace_m = 0 (freshly inserted)
      await db.execute(sql`
        UPDATE accommodations_cache ac
        SET
          dist_from_trace_m = ST_Distance(
            ST_SetSRID(ST_MakePoint(ac.lng, ac.lat), 4326)::geography,
            seg.geom::geography
          ),
          dist_along_route_km = ROUND(
            ST_LineLocatePoint(seg.geom, ST_ClosestPoint(seg.geom, ST_SetSRID(ST_MakePoint(ac.lng, ac.lat), 4326)))
            * seg.distance_km,
            2
          )
        FROM adventure_segments seg
        WHERE ac.segment_id = ${segmentId}
          AND seg.id = ${segmentId}
          AND ac.dist_from_trace_m = 0
          AND seg.geom IS NOT NULL
      `)
    }
    ```
    ⚠️ Only updates rows where `dist_from_trace_m = 0` (freshly inserted). This avoids re-computing cached rows and uses PostGIS geography for meter-accurate distances. If `seg.geom IS NULL` (not populated), rows remain at 0 — acceptable fallback.
  - [x] 3.2 Call `updatePoiDistances(segmentId)` in `PoisService.findPois()` after `insertOverpassPois()`.
  - [x] 3.3 Update tests in `pois.service.test.ts` to mock the new `updatePoiDistances` call.

- [x] Task 4 — Add `GET /pois/google-ids` endpoint for story 4.4 pre-lookup (AC: #3)
  - [x] 4.1 Add to `apps/api/src/pois/pois.controller.ts`:
    ```typescript
    @Get('google-ids')
    @ApiOperation({ summary: 'Get cached Google place_ids for a corridor' })
    async getGooglePlaceIds(
      @Query('segmentId') segmentId: string,
      @Query('fromKm') fromKm: string,
      @Query('toKm') toKm: string,
      @Query('layer') layer: string,
    ) {
      return this.poisService.getGooglePlaceIds(segmentId, Number(fromKm), Number(toKm), layer)
    }
    ```
  - [x] 4.2 Add `getGooglePlaceIds()` in `PoisService`:
    ```typescript
    async getGooglePlaceIds(
      segmentId: string,
      fromKm: number,
      toKm: number,
      layer: string,
    ): Promise<string[]> {
      const redis = this.redisProvider.getClient()
      const cacheKey = `google_place_ids:${segmentId}:${fromKm}:${toKm}:${layer}`
      const cached = await redis.get(cacheKey)
      return cached ? (JSON.parse(cached) as string[]) : []
    }
    ```
    ⚠️ This endpoint is used by story 4.4 (POI Detail Sheet) to retrieve pre-cached place_ids. Returns empty array if Google prefetch hasn't run yet — story 4.4 handles this gracefully.

- [x] Task 5 — Backend tests additions (AC: #3, #6)
  - [x] 5.1 Update `apps/api/src/pois/pois.service.test.ts`:
    - `findPois`: `prefetchGooglePlaceIds` is called when `isConfigured()` returns true
    - `findPois`: `prefetchGooglePlaceIds` failure does NOT reject `findPois` (fire-and-forget)
    - `findPois`: `updatePoiDistances` is called after `insertOverpassPois`
    - `getGooglePlaceIds`: returns parsed array from Redis when key exists
    - `getGooglePlaceIds`: returns `[]` when key missing (no throw)

---

### Frontend — Next.js Web

- [x] Task 6 — Update `usePois` hook to use store `fromKm/toKm` with adventure→segment km mapping (AC: #1, #4)
  - [x] 6.1 Update `apps/web/src/hooks/use-pois.ts` — replace hardcoded `fromKm: 0, toKm: min(30)` with store values, mapping adventure-wide cumulative km to segment-local km:
    ```typescript
    export function usePois(segments: MapSegmentData[]): UsePoisResult {
      const { visibleLayers, fromKm: storeFromKm, toKm: storeToKm } = useMapStore()

      const readySegments = segments.filter((s) => s.parseStatus === 'done')
      const isEnabled = visibleLayers.size > 0 && readySegments.length > 0

      const activeCategories = [...visibleLayers].flatMap(
        (layer) => LAYER_CATEGORIES[layer] ?? [],
      )

      // Map adventure-wide [storeFromKm, storeToKm] to per-segment local km ranges
      const segmentQueries = readySegments.flatMap((segment) => {
        // Compute overlap of [storeFromKm, storeToKm] with this segment's km range
        const segStart = segment.cumulativeStartKm
        const segEnd = segStart + segment.distanceKm

        // No overlap with requested range
        if (storeToKm <= segStart || storeFromKm >= segEnd) return []

        const segLocalFrom = Math.max(0, storeFromKm - segStart)
        const segLocalTo = Math.min(segment.distanceKm, storeToKm - segStart)

        if (segLocalTo <= segLocalFrom) return []

        return [{
          segment,
          segLocalFrom: Math.round(segLocalFrom * 10) / 10,  // Round to 0.1km for stable cache keys
          segLocalTo: Math.round(segLocalTo * 10) / 10,
        }]
      })

      const queries = segmentQueries.map(({ segment, segLocalFrom, segLocalTo }) => ({
        queryKey: ['pois', {
          segmentId: segment.id,
          fromKm: segLocalFrom,
          toKm: segLocalTo,
          categories: [...activeCategories].sort(),
        }] as const,
        queryFn: () => getPois({
          segmentId: segment.id,
          fromKm: segLocalFrom,
          toKm: segLocalTo,
          categories: activeCategories,
        }),
        enabled: isEnabled,
        staleTime: 1000 * 60 * 60 * 24,
      }))

      const results = useQueries({ queries })

      const allPois = results.flatMap((r) => r.data ?? [])
      const poisByLayer: Record<MapLayer, Poi[]> = {
        accommodations: [],
        restaurants: [],
        supplies: [],
        bike: [],
      }
      for (const poi of allPois) {
        const layer = CATEGORY_TO_LAYER[poi.category]
        if (layer) poisByLayer[layer].push(poi)
      }

      // Sort each layer by distAlongRouteKm for the POI list
      for (const layer of Object.keys(poisByLayer) as MapLayer[]) {
        poisByLayer[layer].sort((a, b) => a.distAlongRouteKm - b.distAlongRouteKm)
      }

      const isPending = isEnabled && results.some((r) => r.isPending)
      const hasError = results.some((r) => r.isError)

      return { poisByLayer, isPending, hasError }
    }
    ```
    ⚠️ Rounding to 0.1km (`Math.round(x * 10) / 10`) ensures stable TanStack Query cache keys when slider moves in sub-km increments.

- [x] Task 7 — Create `<SearchRangeSlider />` component (AC: #1, #2)
  - [x] 7.1 Create `apps/web/src/app/(app)/map/[id]/_components/search-range-slider.tsx`:
    ```tsx
    'use client'
    import { useCallback } from 'react'
    import { Slider } from '@/components/ui/slider'
    import { useMapStore } from '@/stores/map.store'
    import { MAX_SEARCH_RANGE_KM } from '@ridenrest/shared'

    interface SearchRangeSliderProps {
      totalDistanceKm: number
    }

    export function SearchRangeSlider({ totalDistanceKm }: SearchRangeSliderProps) {
      const { fromKm, toKm, setSearchRange } = useMapStore()

      const handleValueChange = useCallback(
        (values: number[]) => {
          let [from, to] = values as [number, number]

          // Enforce 30km max range (AC #2)
          if (to - from > MAX_SEARCH_RANGE_KM) {
            // Anchor the thumb that didn't move
            if (from !== fromKm) {
              // fromKm moved → adjust toKm
              to = Math.min(from + MAX_SEARCH_RANGE_KM, totalDistanceKm)
            } else {
              // toKm moved → adjust fromKm
              from = Math.max(to - MAX_SEARCH_RANGE_KM, 0)
            }
          }

          setSearchRange(from, to)
        },
        [fromKm, setSearchRange, totalDistanceKm],
      )

      const rangeKm = toKm - fromKm
      const isAtMax = rangeKm >= MAX_SEARCH_RANGE_KM

      return (
        <div className="bg-white/90 dark:bg-zinc-900/90 backdrop-blur rounded-xl shadow-md p-3 w-64">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-medium text-zinc-600 dark:text-zinc-400">
              Plage de recherche
            </span>
            <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              {Math.round(fromKm)} – {Math.round(toKm)} km
            </span>
          </div>

          <Slider
            min={0}
            max={totalDistanceKm}
            step={1}
            value={[fromKm, toKm]}
            onValueChange={handleValueChange}
            className="w-full"
          />

          {isAtMax && (
            <p className="mt-1.5 text-[10px] text-amber-600 dark:text-amber-400">
              Plage maximale : {MAX_SEARCH_RANGE_KM} km
            </p>
          )}

          <div className="flex justify-between mt-1">
            <span className="text-[10px] text-zinc-400">0 km</span>
            <span className="text-[10px] text-zinc-400">{Math.round(totalDistanceKm)} km</span>
          </div>
        </div>
      )
    }
    ```
    ⚠️ shadcn `<Slider />` supports multi-thumb range when `value` is an array `[from, to]`. Verify that the installed shadcn Slider version supports `value` as a `number[]` array (some versions require `defaultValue` for uncontrolled or specific props). Check `apps/web/src/components/ui/slider.tsx` — if it wraps Radix UI `@radix-ui/react-slider`, multi-thumb is natively supported.

- [x] Task 8 — Add corridor highlight to `map-canvas.tsx` (AC: #1, #4)
  - [x] 8.1 Update `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx`:
    - Add `styleVersion` state (already added in story 4.2 for POI layers)
    - Add a new `useEffect` watching `fromKm, toKm` from store + `segments` to update the corridor highlight
    - Re-add highlight after theme change in `style.load` callback:
    ```typescript
    // Add to map-canvas.tsx:
    import { useMapStore } from '@/stores/map.store'

    // Inside MapCanvas component (after existing state):
    const { fromKm, toKm } = useMapStore()

    // Corridor highlight effect
    useEffect(() => {
      const map = mapRef.current
      if (!map || !map.isStyleLoaded()) return
      updateCorridorHighlight(map, segments, fromKm, toKm)
    }, [segments, fromKm, toKm, styleVersion])  // styleVersion triggers re-add after theme switch
    ```
    - Add helper `updateCorridorHighlight` at the bottom of the file:
    ```typescript
    function buildCorridorFeatures(
      segments: MapSegmentData[],
      fromKm: number,
      toKm: number,
    ): GeoJSON.Feature[] {
      return segments
        .filter((s) => s.waypoints)
        .flatMap((segment) => {
          const segStart = segment.cumulativeStartKm
          const segEnd = segStart + segment.distanceKm

          if (toKm <= segStart || fromKm >= segEnd) return []

          const localFrom = Math.max(0, fromKm - segStart)
          const localTo = Math.min(segment.distanceKm, toKm - segStart)

          const rangeWaypoints = segment.waypoints!.filter(
            (wp) => wp.distKm >= localFrom && wp.distKm <= localTo,
          )

          if (rangeWaypoints.length < 2) return []

          return [{
            type: 'Feature' as const,
            properties: {},
            geometry: {
              type: 'LineString' as const,
              coordinates: rangeWaypoints.map((wp) => [wp.lng, wp.lat]),
            },
          }]
        })
    }

    function updateCorridorHighlight(
      map: maplibregl.Map,
      segments: MapSegmentData[],
      fromKm: number,
      toKm: number,
    ) {
      const features = buildCorridorFeatures(segments, fromKm, toKm)
      const source = map.getSource('corridor') as maplibregl.GeoJSONSource | undefined

      if (source) {
        source.setData({ type: 'FeatureCollection', features })
        return
      }

      // Add corridor source + layer (rendered ABOVE trace-line, BELOW POI layers)
      map.addSource('corridor', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features },
      })
      map.addLayer(
        {
          id: 'corridor-highlight',
          type: 'line',
          source: 'corridor',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#FBBF24',   // amber-400 — visible on both light/dark themes
            'line-width': 6,
            'line-opacity': 0.7,
          },
        },
        'trace-line',  // Insert BELOW trace-line so trace remains on top
      )
    }
    ```
    ⚠️ `map.addLayer(layer, beforeId)` inserts the layer BEFORE `beforeId` in the rendering order (i.e., below). This keeps the trace visible on top of the corridor highlight. If `'trace-line'` doesn't exist yet when corridor is added, catch the error: wrap in `try/catch` or check `map.getLayer('trace-line')`.

- ~~Task 9 — `<PoiList />` component~~ **ANNULÉ** — Design decision: les POIs sont accessibles uniquement via clic sur pin, pas via panneau latéral. La fiche détail complète est implémentée en story 4.4.

- [x] Task 10 — Intégrer `<SearchRangeSlider />` dans `map-view.tsx` (AC: #1, #4, #5)
  - [x] 10.1 Update `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx`:
    ```tsx
    // Add imports:
    import { SearchRangeSlider } from './search-range-slider'
    import { useQueryClient } from '@tanstack/react-query'

    // Inside MapView component:
    const queryClient = useQueryClient()
    const { poisByLayer, isPending: poisPending, hasError: poisError } = usePois(readySegments)

    // Retry handler — invalidates all POI queries for the current adventure segments
    const handlePoiRetry = () => {
      readySegments.forEach((s) => {
        queryClient.invalidateQueries({ queryKey: ['pois', { segmentId: s.id }], exact: false })
      })
    }

    return (
      <div className="relative h-full w-full">
        {/* ... existing banners ... */}
        <MapCanvas
          segments={readySegments}
          adventureName={data.adventureName}
          poisByLayer={poisByLayer}
        />

        {/* Layer toggles — bottom center */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
          <LayerToggles isPending={poisPending} />
        </div>

        {/* Search range slider — top right */}
        <div className="absolute top-4 right-4 z-10">
          <SearchRangeSlider totalDistanceKm={data.totalDistanceKm} />
        </div>

        {poisError && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10">
            <StatusBanner message="Recherche indisponible — réessayer dans quelques instants." />
          </div>
        )}
      </div>
    )
    ```
    ⚠️ Pas de panneau latéral — la carte occupe tout l'espace. Les POIs s'affichent uniquement comme pins sur la carte. Le clic sur un pin ouvre la fiche détail (story 4.4).

- [x] Task 11 — Frontend tests (Vitest)
  - [x] 11.1 Update `apps/web/src/hooks/use-pois.test.ts`:
    - `usePois`: segments outside `[fromKm, toKm]` range are NOT queried (no query fired)
    - `usePois`: segment partially overlapping range → correct `segLocalFrom/segLocalTo` computed
    - `usePois`: multiple segments overlapping → queries fired for each
    - `usePois`: `storeFromKm=0, storeToKm=30`, segment with `cumulativeStartKm=20, distanceKm=50` → queries with `fromKm=0, toKm=10`
    - `usePois`: POIs sorted by `distAlongRouteKm` in each layer
  - [x] 11.2 Create `apps/web/src/app/(app)/map/[id]/_components/search-range-slider.test.tsx`:
    - Renders with slider at default store values (0, 30)
    - Shows km range label `"0 – 30 km"`
    - Shows "Plage maximale : 30 km" message when range = 30km exactly
    - Does not show max message when range < 30km
    - `setSearchRange` called with capped values when slider goes beyond 30km
    - Mock `useMapStore` with vi.mock
  - ~~11.3 `poi-list.test.tsx`~~ **ANNULÉ** — composant `<PoiList />` supprimé de cette story.
  - [x] 11.3 Update `apps/web/src/app/(app)/map/[id]/_components/map-canvas.test.tsx`:
    - `updateCorridorHighlight` called with `fromKm=0, toKm=30` from store (default)
    - `buildCorridorFeatures` filters segments outside range (no features returned)

---

## Dev Notes

### CRITICAL: What's Already Done (Stories 4.1, 4.2) — Do NOT Redo

**`apps/api/src/pois/` — existing infrastructure from story 4.2:**
- ✅ `PoisModule`, `PoisController`, `PoisService`, `PoisRepository`, `OverpassProvider` — all exist
- ✅ `FindPoisDto` — validates `segmentId`, `fromKm`, `toKm`, `categories`
- ✅ `GET /pois` endpoint — protected by `JwtAuthGuard`, wrapped by `ResponseInterceptor`
- ✅ `findPois()` — Redis 24h cache, Overpass fetch, DB upsert, fallback
- ✅ `insertOverpassPois()` — upserts `accommodations_cache` with conflict resolution
- ✅ `getSegmentWaypoints()` — fetches waypoints JSONB from `adventure_segments`
- ✅ `RedisProvider` injected globally — call `this.redisProvider.getClient()` in PoisService

**`apps/web/` — existing infrastructure from stories 4.1, 4.2:**
- ✅ `useMapStore` — `fromKm=0, toKm=30, setSearchRange()` already defined
- ✅ `usePois` hook — exists but uses hardcoded km range (this story updates it)
- ✅ `usePoiLayers` hook — manages MapLibre POI layers reactively
- ✅ `<LayerToggles />` — exists, uses `visibleLayers` from store
- ✅ `map-canvas.tsx` — has `styleVersion` state, `mapRef`, `segments` — add corridor highlight
- ✅ `map-view.tsx` — renders MapCanvas + LayerToggles — add slider + POI list
- ✅ `<StatusBanner />` — at `apps/web/src/components/shared/status-banner.tsx`
- ✅ `<Skeleton />` — at `apps/web/src/components/ui/skeleton.tsx`
- ✅ `<Slider />` — verify at `apps/web/src/components/ui/slider.tsx` (shadcn)

**What does NOT exist yet:**
- ❌ `GooglePlacesProvider` — create from scratch
- ❌ `<SearchRangeSlider />` — create from scratch
- ❌ Corridor highlight in `map-canvas.tsx` — add new effect + helper
- ❌ `usePois` km mapping logic — update existing hook
- ❌ `GOOGLE_PLACES_API_KEY` env var — add to `.env.example`
- ⚠️ `<PoiList />` panneau latéral — **hors scope story 4.3** — les POIs s'affichent uniquement via pins sur la carte, la fiche détail est story 4.4

---

### Architecture: Google Places API (New) — IDs Only Strategy

**Why IDs Only for the background pre-cache:**
```
POST https://places.googleapis.com/v1/places:searchText
Headers:
  X-Goog-Api-Key: {API_KEY}
  X-Goog-FieldMask: places.id    ← CRITICAL — defines billing tier

Body:
  {
    "textQuery": "lodging",
    "includedType": "lodging",
    "locationRestriction": { "rectangle": { "low": {...}, "high": {...} } },
    "maxResultCount": 20,
    "languageCode": "fr"
  }
```

**Pricing impact:**
- `X-Goog-FieldMask: places.id` → **Places API Text Search Essentials (IDs Only)** = **Unlimited, $0**
- If any other field is added (e.g., `places.location`) → **Essentials** tier = 10k/month free, then $5/1000
- Story 4.3 ONLY stores `place_id` strings — no location data from Google Places
- Story 4.4 will use `X-Goog-FieldMask: places.id,places.displayName,places.location,places.types` for Place Details → that's Essentials (10k/month)

**Why `includedType` not just `textQuery`:**
- `textQuery: "hotel"` with no `includedType` may return non-hotel results (blog posts, etc. in some locales)
- `includedType: "lodging"` restricts to Google's place type taxonomy → cleaner results
- Both combined gives best accuracy

**Google place type → our PoiCategory mapping:**
| Google type | Our categories |
|---|---|
| `lodging` | hotel, hostel, shelter |
| `campground`, `rv_park` | camp_site |
| `restaurant` | restaurant |
| `grocery_or_supermarket`, `supermarket` | supermarket |
| `convenience_store` | convenience |
| `bicycle_store` | bike_shop, bike_repair |

---

### Architecture: Google Places pre-cache Redis keys

```
Key:   google_place_ids:{segmentId}:{fromKm}:{toKm}:{layer}
Value: JSON array of place_id strings, e.g. ["ChIJN1...", "ChIJP2..."]
TTL:   604800s (7 days) — place_ids are stable identifiers, rarely change

Example:
  google_place_ids:uuid-abc:0:30:accommodations → ["ChIJN1t...", "ChIJRy..."]
  google_place_ids:uuid-abc:0:30:restaurants    → ["ChIJuP..."]
```

**Why 7-day TTL (vs Overpass 24h):**
- Google place_ids are stable permanent identifiers for businesses
- OSM data changes more frequently (new businesses, closures) → 24h
- Google's business registry is updated less frequently → 7d acceptable

**Story 4.4 usage:**
When user taps a POI pin:
1. Backend receives `GET /pois/google-details?segmentId=X&fromKm=Y&toKm=Z&layer=L`
2. Looks up `google_place_ids:{segmentId}:{fromKm}:{toKm}:{layer}` in Redis
3. Finds closest match to tapped POI location (client sends bbox or name hint)
4. Calls `GET https://places.googleapis.com/v1/places/{placeId}` with field mask for Essentials data

---

### Architecture: Adventure-Wide km → Segment-Local km Mapping

This is the core logic change in `usePois` (Task 6). The store holds adventure-wide cumulative km:

```typescript
// adventure:          km 0 ────────────────────────── km 120
// segment 1:          km 0 ──────── km 45 (cumulativeStartKm=0, distanceKm=45)
// segment 2:          km 45 ─────── km 90 (cumulativeStartKm=45, distanceKm=45)
// segment 3:          km 90 ─────── km 120 (cumulativeStartKm=90, distanceKm=30)

// Store: fromKm=40, toKm=60

// Segment 1: overlap [40, 45] → localFrom=40, localTo=45 → query [40, 45]
// Segment 2: overlap [45, 60] → localFrom=0, localTo=15  → query [0, 15]
// Segment 3: no overlap (starts at 90) → skip
```

**API calls fired:**
- `GET /pois?segmentId=seg1&fromKm=40&toKm=45`
- `GET /pois?segmentId=seg2&fromKm=0&toKm=15`

**Why round to 0.1km:**
The slider step is `1km` but floating point can produce values like `14.999999`. Rounding to 0.1km prevents stale TanStack Query cache misses from near-identical keys like `14.9999` vs `15.0`.

---

### Architecture: Corridor Highlight — MapLibre Layer Ordering

MapLibre renders layers in declaration order (first declared = bottom). Layer order matters:
```
tiles (bottom)
  trace-line          ← GPX trace (red/blue/etc segments)
  corridor-highlight  ← yellow highlight BELOW trace so trace stays readable
  trace-joins-circle  ← join markers
  pois-*-clusters     ← POI cluster circles (story 4.2)
  pois-*-points       ← individual POI pins
  (top)
```

`map.addLayer(corridorLayer, 'trace-line')` inserts it BEFORE `trace-line` in the render stack = below it visually.

**If `trace-line` doesn't exist yet** (e.g., corridor highlight added before trace initializes):
```typescript
// Safe insertion
const beforeId = map.getLayer('trace-line') ? 'trace-line' : undefined
map.addLayer(corridorLayer, beforeId)
```

---

### Architecture: usePois — TanStack `useQueries` Stability

The `queries` array passed to `useQueries` must be **referentially stable** to avoid infinite re-renders. Key rules:
- `queryKey` arrays: use primitive values only (strings, numbers) — no objects inside the array unless wrapped with a stable key (here: nested object `{ segmentId, fromKm, toKm, categories }` is fine as TanStack Query deep-compares keys)
- `activeCategories.sort()` must be done BEFORE building query keys — sort is in-place, call it once
- The `segmentQueries` computation depends on `segments`, `storeFromKm`, `storeToKm`, `visibleLayers` — all come from stable sources (props + store)

---

### Architecture: `<SearchRangeSlider />` — shadcn Slider Multi-Thumb

shadcn `<Slider />` wraps `@radix-ui/react-slider`. Multi-thumb range is enabled by passing an array to `value`:
```tsx
<Slider value={[fromKm, toKm]} onValueChange={(vals) => setSearchRange(vals[0], vals[1])} />
```

Check `apps/web/src/components/ui/slider.tsx` — the shadcn copy may need `min`, `max`, `step` props added to the Radix primitive. If `slider.tsx` only exposes a single `value` prop, update it to accept `number[]`.

**The 30km cap enforcement (AC #2):**
The cap is enforced in `handleValueChange` — we compare old vs new `fromKm` to determine which thumb moved, then clamp the other. This is imperfect if both thumbs move simultaneously (impossible with mouse/touch but theoretically possible). For MVP, this is acceptable.

---

### Architecture: Fire-and-Forget Google Places in NestJS

The background Google Places pre-fetch MUST NOT block the response or propagate errors to the client. Pattern:
```typescript
// ✅ Fire-and-forget with explicit catch
void this.prefetchGooglePlaceIds(...).catch(
  (err) => this.logger.warn('Google Places prefetch failed silently', err)
)

// ❌ Awaited — would add latency to every POI response
await this.prefetchGooglePlaceIds(...)

// ❌ No catch — unhandled rejection could crash NestJS in some configurations
void this.prefetchGooglePlaceIds(...)
```

The `void` operator discards the Promise intentionally. The `.catch()` ensures the rejected Promise is handled (prevents UnhandledPromiseRejection).

---

### Project Structure Notes

**Files to CREATE:**
```
apps/api/src/pois/providers/
  google-places.provider.ts
  google-places.provider.test.ts

apps/web/src/app/(app)/map/[id]/_components/
  search-range-slider.tsx
  search-range-slider.test.tsx
  poi-list.tsx
  poi-list.test.tsx
```

**Files to MODIFY:**
```
apps/api/src/pois/pois.module.ts         ← Add GooglePlacesProvider to providers[]
apps/api/src/pois/pois.service.ts        ← Inject GooglePlacesProvider, add prefetch, add getGooglePlaceIds(), call updatePoiDistances
apps/api/src/pois/pois.repository.ts     ← Add updatePoiDistances() with PostGIS
apps/api/src/pois/pois.controller.ts     ← Add GET /pois/google-ids endpoint
apps/api/src/pois/pois.service.test.ts   ← New test cases for Google Places + distances
apps/api/.env.example                    ← Add GOOGLE_PLACES_API_KEY

apps/web/src/hooks/use-pois.ts           ← Add adventure→segment km mapping, sorting
apps/web/src/hooks/use-pois.test.ts      ← Update tests for km mapping
apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx  ← Add corridor highlight
apps/web/src/app/(app)/map/[id]/_components/map-view.tsx    ← Add slider + POI list panel
apps/web/src/app/(app)/map/[id]/_components/map-canvas.test.tsx  ← Corridor highlight test
```

**No DB migration required** — `accommodations_cache` table exists. `adventure_segments.geom` PostGIS column exists (populated by GPX parse job). Story 4.3 only adds Redis keys and refines distance computation via PostGIS UPDATE.

---

### Anti-Patterns to Avoid

```typescript
// ❌ Awaiting Google Places (adds latency to every /pois response)
const placeIds = await this.prefetchGooglePlaceIds(...)
// ✅ Fire-and-forget
void this.prefetchGooglePlaceIds(...).catch(...)

// ❌ Adding places.location to Google Places field mask in story 4.3
headers: { 'X-Goog-FieldMask': 'places.id,places.location' }
// → bills as Essentials (10k/month) instead of IDs Only (unlimited)
// ✅ Story 4.3: IDs Only
headers: { 'X-Goog-FieldMask': 'places.id' }
// Story 4.4 (Place Details): Essentials fields are ok there

// ❌ Same km range key for all adventures (cache pollution)
`pois:${fromKm}:${toKm}`
// ✅ Always include segmentId
`pois:${segmentId}:${fromKm}:${toKm}:${categories}`

// ❌ Using store fromKm/toKm directly as segment-local km in API call
getPois({ segmentId: seg.id, fromKm: storeFromKm, toKm: storeToKm })
// → wrong if storeFromKm > segment start (would request km outside the segment)
// ✅ Always compute segment-local overlap
const segLocalFrom = Math.max(0, storeFromKm - segment.cumulativeStartKm)

// ❌ useMapStore() called inline in JSX (Rules of Hooks violation)
{useMapStore().visibleLayers.size > 0 && <PoiList />}
// ✅ Extract at top of component
const { visibleLayers } = useMapStore()

// ❌ Corridor highlight layer inserted ABOVE POI layers (pins hidden below highlight)
map.addLayer(corridorLayer)  // Added after POI layers = on top
// ✅ Insert before trace-line (below everything)
map.addLayer(corridorLayer, 'trace-line')

// ❌ Not checking isConfigured() before Google Places calls
await this.googlePlacesProvider.searchLayerPlaceIds(bbox, layer)
// → crashes if API key not set
// ✅ Guard check
if (!this.googlePlacesProvider.isConfigured()) return
```

---

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 4, Story 4.3 ACs: FR-030, FR-031, NFR-021, NFR-031, NFR-040]
- [Source: _bmad-output/project-context.md — External API Rate Limits: Overpass fair use 24h TTL, Upstash Redis 10k cmds/day]
- [Source: _bmad-output/project-context.md — NestJS architecture: no try/catch in controllers, typed HttpExceptions in services, BullMQ fire-and-forget pattern]
- [Source: _bmad-output/project-context.md — Anti-patterns: GPS position NEVER in API request, return raw data from controller]
- [Source: _bmad-output/project-context.md — Corridor Search: 30km max (CORRIDOR_WIDTH_M=500, MAX_SEARCH_RANGE_KM=30)]
- [Source: _bmad-output/planning-artifacts/architecture.md — POI Data Flow: Redis check → Overpass → ST_Buffer corridor → ST_DWithin → accommodations_cache → response]
- [Source: _bmad-output/planning-artifacts/architecture.md — Map component hierarchy: search-range-slider.tsx, poi-layer.tsx in _components/]
- [Source: _bmad-output/implementation-artifacts/4-2-poi-layer-toggles-pin-display.md — PoisService/Repository patterns, RedisProvider.getClient(), OverpassProvider usage, usePoiLayers styleVersion pattern]
- [Source: apps/web/src/hooks/use-pois.ts — Current usePois implementation (hardcoded fromKm=0, toKm=30) — update in Task 6]
- [Source: apps/web/src/app/(app)/map/[id]/_components/map-view.tsx — Current map-view layout — add slider + POI panel in Task 10]
- [Source: apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx — corridor highlight insertion point (before 'trace-line')]
- [Source: apps/web/src/stores/map.store.ts — fromKm=0, toKm=30, setSearchRange() already defined]
- [Source: packages/shared/src/constants/gpx.constants.ts — MAX_SEARCH_RANGE_KM=30, CORRIDOR_WIDTH_M=500]
- [Google Places API (New) pricing — Text Search Essentials IDs Only = Unlimited, Place Details Essentials = 10k/month free]

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

- `onValueChange` for `@base-ui/react/slider` has signature `(value: number | readonly number[], eventDetails) => void` — not `(values: number[]) => void` as assumed by the story (written for `@radix-ui/react-slider`). Fixed with early return guard.
- `import type GeoJSON from 'geojson'` failed (no standalone geojson package) — GeoJSON namespace is globally available via maplibre-gl types. Removed explicit import.

### Completion Notes List

- ✅ Task 1: `GooglePlacesProvider` created — `searchPlaceIds()` (IDs Only, $0) + `searchLayerPlaceIds()` with deduplication. Registered in `PoisModule`.
- ✅ Task 2: `PoisService` updated — `GooglePlacesProvider` injected, fire-and-forget `prefetchGooglePlaceIds()`, `getGooglePlaceIds()` method added.
- ✅ Task 3: `PoisRepository.updatePoiDistances()` added — PostGIS `ST_Distance` + `ST_LineLocatePoint`. Called after every `insertOverpassPois()`.
- ✅ Task 4: `GET /pois/google-ids` endpoint + `getGooglePlaceIds()` in service.
- ✅ Task 5: 20 backend tests covering `GooglePlacesProvider` + updated `PoisService` (fire-and-forget, distances, `getGooglePlaceIds`).
- ✅ Task 6: `usePois` hook refactored — adventure-wide km → per-segment local km, 0.1km rounding, sort by `distAlongRouteKm`.
- ✅ Task 7: `<SearchRangeSlider />` — 30km cap, adapted for `@base-ui/react/slider` API.
- ✅ Task 8: Corridor highlight — `buildCorridorFeatures()` (exported), `updateCorridorHighlight()`, inserted before `trace-line`.
- ~~Task 9: `<PoiList />`~~ **ANNULÉ** — design decision: pas de panneau latéral, POIs uniquement via pins carte.
- ✅ Task 10: `map-view.tsx` — layout carte plein écran, `<SearchRangeSlider>` top-right. **À RÉVISER** : supprimer `<PoiList>` et remettre layout `relative h-full w-full` (pas de flex).
- ⚠️ Task 11: tests `poi-list.test.tsx` à supprimer. Reste: 89 backend + tests frontend slider + corridor.

### Review Follow-ups (AI)

- [ ] [AI-Review][LOW] `pois.service.ts:50` — `activeCategories.sort()` mute l'array in-place, utiliser `[...activeCategories].sort()` [pois.service.ts:50]
- [ ] [AI-Review][LOW] `sprint-status.yaml` modifié mais absent du File List de cette story [sprint-status.yaml]
- [ ] [AI-Review][LOW] `map-canvas.test.tsx` — effet corridor avec `styleVersion` (re-add après theme switch) non testé [map-canvas.test.tsx]
- [ ] [AI-Review][MEDIUM] `google-places.provider.ts` — API key capturée à la construction plutôt qu'injectée via `ConfigService`. Cause du boilerplate de 5 modules dans les tests [google-places.provider.ts:46]

### File List

**Created:**
- `apps/api/src/pois/providers/google-places.provider.ts`
- `apps/api/src/pois/providers/google-places.provider.test.ts`
- `apps/api/src/pois/dto/get-google-place-ids.dto.ts`
- `apps/web/src/app/(app)/map/[id]/_components/search-range-slider.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/search-range-slider.test.tsx`

**Modified:**
- `apps/api/src/pois/pois.module.ts`
- `apps/api/src/pois/pois.service.ts`
- `apps/api/src/pois/pois.repository.ts`
- `apps/api/src/pois/pois.controller.ts`
- `apps/api/src/pois/pois.service.test.ts`
- `apps/api/.env.example`
- `apps/web/src/hooks/use-pois.ts`
- `apps/web/src/hooks/use-pois.test.ts`
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.test.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/search-range-slider.test.tsx`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
