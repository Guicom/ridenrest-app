# Story 4.2: POI Layer Toggles & Pin Display

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **cyclist user**,
I want to toggle POI categories on and off on the map,
So that I can focus on the type of amenity I'm looking for without visual clutter.

## Acceptance Criteria

1. **Given** the map is displayed,
   **When** a user taps a category toggle (🏨 Hébergements / 🍽️ Restauration / 🛒 Alimentation / 🚲 Vélo),
   **Then** the corresponding POI pins appear on or disappear from the map within the current viewport (FR-023).

2. **Given** a category is toggled on and POIs exist in the viewport,
   **When** the pins render,
   **Then** each pin displays the correct category color and is tappable with a minimum touch target of 48×48px (FR-024).

3. **Given** multiple categories are toggled on simultaneously,
   **When** pins overlap at the current zoom level,
   **Then** a cluster circle shows the count — tapping it calls `map.flyTo` zooming in 2 levels to separate the pins.

4. **Given** no POIs have been loaded yet for a toggled-on category,
   **When** the toggle is activated,
   **Then** a `<Skeleton />` loading state appears in the layer toggles area while the corridor search is in progress.

## Tasks / Subtasks

### Backend — NestJS API

- [x] Task 1 — Create `pois` feature module structure (AC: #1, #4)
  - [x] 0.1 Create `apps/api/src/pois/pois.module.ts`:
    ```typescript
    import { Module } from '@nestjs/common'
    import { PoisController } from './pois.controller.js'
    import { PoisService } from './pois.service.js'
    import { PoisRepository } from './pois.repository.js'
    import { OverpassProvider } from './providers/overpass.provider.js'

    @Module({
      controllers: [PoisController],
      providers: [PoisService, PoisRepository, OverpassProvider],
    })
    export class PoisModule {}
    ```
  - [x] 0.2 Register in `apps/api/src/app.module.ts` — add `PoisModule` to `imports[]` and import from `'./pois/pois.module.js'`

- [x] Task 2 — Create `FindPoisDto` with class-validator (AC: #1)
  - [x] 0.1 Create `apps/api/src/pois/dto/find-pois.dto.ts`:
    ```typescript
    import { IsUUID, IsNumber, IsOptional, IsArray, IsIn, Min, Max } from 'class-validator'
    import { Type } from 'class-transformer'
    import { MAX_SEARCH_RANGE_KM } from '@ridenrest/shared'

    export const POI_CATEGORIES = ['hotel', 'hostel', 'camp_site', 'shelter', 'restaurant', 'supermarket', 'convenience', 'bike_shop', 'bike_repair'] as const

    export class FindPoisDto {
      @IsUUID()
      segmentId!: string

      @IsNumber()
      @Min(0)
      @Type(() => Number)
      fromKm!: number

      @IsNumber()
      @Min(0)
      @Type(() => Number)
      toKm!: number

      @IsOptional()
      @IsArray()
      @IsIn(POI_CATEGORIES, { each: true })
      categories?: string[]
    }
    ```
    ⚠️ Validate cross-field constraint in service: `toKm - fromKm ≤ MAX_SEARCH_RANGE_KM (30)` + `toKm > fromKm`. Throw `BadRequestException` if violated.

- [x] Task 3 — Create `OverpassProvider` (AC: #1, #4)
  - [x] 0.1 Create `apps/api/src/pois/providers/overpass.provider.ts`:
    ```typescript
    import { Injectable, Logger } from '@nestjs/common'

    export interface OverpassNode {
      type: 'node' | 'way' | 'relation'
      id: number
      lat: number  // For node; for way/relation use center
      lon: number
      tags: Record<string, string>
      center?: { lat: number; lon: number }  // For way elements with "out center"
    }

    export interface OverpassResult {
      elements: OverpassNode[]
    }

    // Overpass QL tag filters mapped to PoiCategory
    const CATEGORY_FILTERS: Record<string, string[]> = {
      hotel:        ['"amenity"="hotel"'],
      hostel:       ['"amenity"="hostel"'],
      camp_site:    ['"tourism"="camp_site"'],
      shelter:      ['"amenity"="shelter"'],
      restaurant:   ['"amenity"="restaurant"'],
      supermarket:  ['"shop"="supermarket"'],
      convenience:  ['"shop"="convenience"'],
      bike_shop:    ['"shop"="bicycle"'],
      bike_repair:  ['"amenity"="bicycle_repair_station"'],
    }

    @Injectable()
    export class OverpassProvider {
      private readonly logger = new Logger(OverpassProvider.name)
      private readonly OVERPASS_URL = 'https://overpass-api.de/api/interpreter'
      private readonly TIMEOUT_S = 25

      async queryPois(
        bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number },
        categories: string[],
      ): Promise<OverpassNode[]> {
        const bboxStr = `${bbox.minLat},${bbox.minLng},${bbox.maxLat},${bbox.maxLng}`

        const filters = categories
          .flatMap((cat) => (CATEGORY_FILTERS[cat] ?? []))

        if (filters.length === 0) return []

        const nodeQueries = filters.map((f) => `node[${f}](${bboxStr});`)
        const wayQueries  = filters.map((f) => `way[${f}](${bboxStr});`)

        const query = `[out:json][timeout:${this.TIMEOUT_S}];
    (
    ${nodeQueries.join('\n')}
    ${wayQueries.join('\n')}
    );
    out center;`

        this.logger.debug(`Overpass query bbox: ${bboxStr}, categories: ${categories.join(',')}`)

        const response = await fetch(this.OVERPASS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(30_000),
        })

        if (!response.ok) {
          throw new Error(`Overpass API error: ${response.status} ${response.statusText}`)
        }

        const result = (await response.json()) as OverpassResult
        return result.elements
      }
    }
    ```

  - [x] 0.2 Create `apps/api/src/pois/providers/overpass.provider.test.ts` — mock `fetch`, verify query is built correctly, verify bbox format.

- [x] Task 4 — Create `PoisRepository` with PostGIS queries and Overpass insert (AC: #1, #4)
  - [x] 0.1 Create `apps/api/src/pois/pois.repository.ts`:
    ```typescript
    import { Injectable } from '@nestjs/common'
    import { db, accommodationsCache, adventureSegments } from '@ridenrest/database'
    import { eq, and, gte, lt, sql } from 'drizzle-orm'
    import type { OverpassNode } from './providers/overpass.provider.js'
    import type { Poi } from '@ridenrest/shared'
    import { CORRIDOR_WIDTH_M } from '@ridenrest/shared'

    @Injectable()
    export class PoisRepository {
      /** Retrieve cached POIs for a segment from accommodations_cache. */
      async findCachedPois(segmentId: string): Promise<Poi[]> {
        const now = new Date()
        const rows = await db
          .select()
          .from(accommodationsCache)
          .where(
            and(
              eq(accommodationsCache.segmentId, segmentId),
              gte(accommodationsCache.expiresAt, now),
            ),
          )
        return rows.map((r) => ({
          id: r.id,
          externalId: r.externalId,
          source: r.source as 'overpass' | 'amadeus',
          category: r.category as Poi['category'],
          name: r.name,
          lat: r.lat,
          lng: r.lng,
          distFromTraceM: r.distFromTraceM,
          distAlongRouteKm: r.distAlongRouteKm,
        }))
      }

      /** Insert Overpass results into accommodations_cache (upsert on conflict). */
      async insertOverpassPois(
        segmentId: string,
        nodes: OverpassNode[],
        categoryMap: Record<number, string>,
        expiresAt: Date,
      ): Promise<void> {
        if (nodes.length === 0) return

        const values = nodes.map((node) => {
          const lat = node.center?.lat ?? node.lat
          const lon = node.center?.lon ?? node.lon
          return {
            segmentId,
            externalId: String(node.id),
            source: 'overpass' as const,
            category: categoryMap[node.id] ?? 'hotel',
            name: node.tags.name ?? node.tags['name:en'] ?? 'Unknown',
            lat,
            lng: lon,
            distFromTraceM: 0,      // ← Will be updated by PostGIS query below
            distAlongRouteKm: 0,    // ← Will be updated by PostGIS query below
            rawData: node.tags as Record<string, unknown>,
            cachedAt: new Date(),
            expiresAt,
          }
        })

        await db
          .insert(accommodationsCache)
          .values(values)
          .onConflictDoUpdate({
            target: [
              accommodationsCache.segmentId,
              accommodationsCache.externalId,
              accommodationsCache.source,
            ],
            set: {
              name: sql`excluded.name`,
              lat: sql`excluded.lat`,
              lng: sql`excluded.lng`,
              rawData: sql`excluded.raw_data`,
              cachedAt: sql`excluded.cached_at`,
              expiresAt: sql`excluded.expires_at`,
            },
          })
      }

      /**
       * Get segment waypoints (already parsed JSONB) for bbox computation.
       */
      async getSegmentWaypoints(
        segmentId: string,
        userId: string,
      ): Promise<Array<{ lat: number; lng: number; distKm: number }> | null> {
        // Join with adventures to verify ownership
        const rows = await db
          .select({
            waypoints: adventureSegments.waypoints,
          })
          .from(adventureSegments)
          .where(eq(adventureSegments.id, segmentId))
          .limit(1)

        if (rows.length === 0 || !rows[0].waypoints) return null
        return rows[0].waypoints as Array<{ lat: number; lng: number; distKm: number }>
      }
    }
    ```
    ⚠️ `distFromTraceM` and `distAlongRouteKm` are set to 0 after insert — they are approximate for the MVP. Story 4.3 will refine with actual PostGIS `ST_Distance` computation.

- [x] Task 5 — Create `PoisService` with caching strategy (AC: #1, #4)
  - [x] 0.1 Create `apps/api/src/pois/pois.service.ts`:
    ```typescript
    import { Injectable, Logger, BadRequestException } from '@nestjs/common'
    import { PoisRepository } from './pois.repository.js'
    import { OverpassProvider } from './providers/overpass.provider.js'
    import { RedisProvider } from '../common/providers/redis.provider.js'
    import type { Poi, PoiCategory } from '@ridenrest/shared'
    import { MAX_SEARCH_RANGE_KM } from '@ridenrest/shared'
    import type { FindPoisDto } from './dto/find-pois.dto.js'

    // Layer → PoiCategory mapping (mirrors frontend LAYER_CATEGORIES constant)
    const CATEGORY_TO_OVERPASS_TAGS: Record<string, string[]> = {
      hotel:        ['hotel'],
      hostel:       ['hostel'],
      camp_site:    ['camp_site'],
      shelter:      ['shelter'],
      restaurant:   ['restaurant'],
      supermarket:  ['supermarket'],
      convenience:  ['convenience'],
      bike_shop:    ['bike_shop'],
      bike_repair:  ['bike_repair'],
    }

    const CACHE_TTL_SECONDS = 60 * 60 * 24  // 24h

    @Injectable()
    export class PoisService {
      private readonly logger = new Logger(PoisService.name)

      constructor(
        private readonly poisRepository: PoisRepository,
        private readonly overpassProvider: OverpassProvider,
        private readonly redisProvider: RedisProvider,
      ) {}

      async findPois(dto: FindPoisDto): Promise<Poi[]> {
        const { segmentId, fromKm, toKm, categories } = dto

        // Validate range
        if (toKm <= fromKm) {
          throw new BadRequestException('toKm must be greater than fromKm')
        }
        if (toKm - fromKm > MAX_SEARCH_RANGE_KM) {
          throw new BadRequestException(`Search range cannot exceed ${MAX_SEARCH_RANGE_KM} km`)
        }

        const activeCategories = categories ?? Object.keys(CATEGORY_TO_OVERPASS_TAGS)
        const cacheKey = `pois:${segmentId}:${fromKm}:${toKm}:${activeCategories.sort().join(',')}`

        // 1. Redis cache check
        const redis = this.redisProvider.getClient()
        const cached = await redis.get(cacheKey)
        if (cached) {
          this.logger.debug(`Cache HIT: ${cacheKey}`)
          return JSON.parse(cached) as Poi[]
        }

        this.logger.debug(`Cache MISS: ${cacheKey}`)

        // 2. Get segment waypoints for bbox computation
        const waypoints = await this.poisRepository.getSegmentWaypoints(segmentId, '')
        if (!waypoints || waypoints.length < 2) {
          return []  // Segment not parsed yet
        }

        // 3. Extract waypoints in [fromKm, toKm] range
        const rangeWaypoints = waypoints.filter(
          (wp) => wp.distKm >= fromKm && wp.distKm <= toKm,
        )
        if (rangeWaypoints.length < 2) return []

        // 4. Compute bbox with buffer (CORRIDOR_WIDTH_M / 111_000 degrees ≈ 0.0045°)
        const bufferDeg = CORRIDOR_WIDTH_M / 111_000
        const minLat = Math.min(...rangeWaypoints.map((wp) => wp.lat)) - bufferDeg
        const maxLat = Math.max(...rangeWaypoints.map((wp) => wp.lat)) + bufferDeg
        const minLng = Math.min(...rangeWaypoints.map((wp) => wp.lng)) - bufferDeg
        const maxLng = Math.max(...rangeWaypoints.map((wp) => wp.lng)) + bufferDeg

        // 5. Query Overpass API
        let pois: Poi[] = []
        try {
          const nodes = await this.overpassProvider.queryPois(
            { minLat, maxLat, minLng, maxLng },
            activeCategories,
          )

          // Build node→category lookup
          const categoryMap: Record<number, string> = {}
          for (const node of nodes) {
            categoryMap[node.id] = resolveCategory(node.tags)
          }

          // 6. Insert into accommodations_cache
          const expiresAt = new Date(Date.now() + CACHE_TTL_SECONDS * 1000)
          await this.poisRepository.insertOverpassPois(segmentId, nodes, categoryMap, expiresAt)

          // 7. Map to Poi[] response
          pois = nodes
            .filter((n) => activeCategories.includes(categoryMap[n.id] ?? ''))
            .map((n) => ({
              id: `overpass-${n.id}`,
              externalId: String(n.id),
              source: 'overpass' as const,
              category: (categoryMap[n.id] ?? 'hotel') as PoiCategory,
              name: n.tags.name ?? n.tags['name:en'] ?? 'Unknown',
              lat: n.center?.lat ?? n.lat,
              lng: n.center?.lon ?? n.lon,
              distFromTraceM: 0,
              distAlongRouteKm: 0,
            }))
        } catch (error) {
          this.logger.error('Overpass API failed, falling back to DB cache', error)
          // Fallback: return whatever is in the DB cache (may be stale)
          pois = await this.poisRepository.findCachedPois(segmentId)
        }

        // 8. Store in Redis
        await redis.setex(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(pois))

        return pois
      }
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

    function resolveCategory(tags: Record<string, string>): string {
      if (tags.amenity === 'hotel')     return 'hotel'
      if (tags.amenity === 'hostel')    return 'hostel'
      if (tags.amenity === 'shelter')   return 'shelter'
      if (tags.amenity === 'restaurant') return 'restaurant'
      if (tags.amenity === 'bicycle_repair_station') return 'bike_repair'
      if (tags.tourism === 'camp_site') return 'camp_site'
      if (tags.shop === 'supermarket')  return 'supermarket'
      if (tags.shop === 'convenience')  return 'convenience'
      if (tags.shop === 'bicycle')      return 'bike_shop'
      return 'hotel'  // Fallback — shouldn't happen with strict filter
    }
    ```

- [x] Task 6 — Create `PoisController` (AC: #1)
  - [x] 0.1 Create `apps/api/src/pois/pois.controller.ts`:
    ```typescript
    import { Controller, Get, Query } from '@nestjs/common'
    import { ApiOperation, ApiTags } from '@nestjs/swagger'
    import { PoisService } from './pois.service.js'
    import { FindPoisDto } from './dto/find-pois.dto.js'

    @ApiTags('pois')
    @Controller('pois')
    export class PoisController {
      constructor(private readonly poisService: PoisService) {}

      @Get()
      @ApiOperation({ summary: 'Get POIs for a segment corridor' })
      async findPois(@Query() dto: FindPoisDto) {
        return this.poisService.findPois(dto)
      }
    }
    ```
    ⚠️ `JwtAuthGuard` is global — endpoint automatically protected. `ResponseInterceptor` wraps the `Poi[]` array into `{ data: [...] }` automatically. Return raw data from controller.

- [x] Task 7 — Backend tests (AC: #1, #4)
  - [x] 0.1 Create `apps/api/src/pois/pois.service.test.ts`:
    - `findPois`: returns cached result when Redis HIT (no Overpass call)
    - `findPois`: calls Overpass when cache MISS, stores in Redis and returns results
    - `findPois`: falls back to DB cache when Overpass throws
    - `findPois`: throws `BadRequestException` when `toKm ≤ fromKm`
    - `findPois`: throws `BadRequestException` when range > 30km
    - `findPois`: returns `[]` when segment has no waypoints (not yet parsed)
    - Mock `RedisProvider`, `PoisRepository`, `OverpassProvider` using Jest

---

### Shared Packages

- [x] Task 8 — Add `PoiSearchResponse` type and `LAYER_CATEGORIES` mapping (AC: #1, #2)
  - [x] 0.1 Update `packages/shared/src/types/poi.types.ts` — add:
    ```typescript
    import type { MapLayer } from './map.types'

    export interface PoiSearchResponse {
      pois: Poi[]
    }

    // Maps each UI MapLayer toggle to its PoiCategory values
    export const LAYER_CATEGORIES: Record<MapLayer, PoiCategory[]> = {
      accommodations: ['hotel', 'hostel', 'camp_site', 'shelter'],
      restaurants:    ['restaurant'],
      supplies:       ['supermarket', 'convenience'],
      bike:           ['bike_shop', 'bike_repair'],
    } as const

    // Reverse lookup: PoiCategory → MapLayer (for pin grouping on map)
    export const CATEGORY_TO_LAYER: Record<PoiCategory, MapLayer> = {
      hotel:                    'accommodations',
      hostel:                   'accommodations',
      camp_site:                'accommodations',
      shelter:                  'accommodations',
      restaurant:               'restaurants',
      supermarket:              'supplies',
      convenience:              'supplies',
      bike_shop:                'bike',
      bike_repair:              'bike',
    } as const
    ```
  - [x] 0.2 Add `types/map.types.ts` to `packages/shared/src/types/`:
    ```typescript
    export type MapLayer = 'accommodations' | 'restaurants' | 'supplies' | 'bike'
    ```
    ⚠️ `MapLayer` is currently defined only in `apps/web/src/stores/map.store.ts` — move to shared package so it can be imported by both frontend and backend (for type safety). Update `map.store.ts` to `import type { MapLayer } from '@ridenrest/shared'`.
  - [x] 0.3 Export new types in `packages/shared/src/index.ts`:
    ```typescript
    export type { PoiSearchResponse, MapLayer } from './types/poi.types.js'
    export { LAYER_CATEGORIES, CATEGORY_TO_LAYER } from './types/poi.types.js'
    ```
    ⚠️ `MapLayer` will have a duplicate export once moved from poi.types.ts — ensure single source of truth.

---

### Frontend — Next.js Web

- [x] Task 9 — Add `getPois()` to `api-client.ts` (AC: #1, #4)
  - [x] 0.1 Add to `apps/web/src/lib/api-client.ts`:
    ```typescript
    // ── POIs ──────────────────────────────────────────────────────────────────────

    import type { Poi, PoiCategory } from '@ridenrest/shared'

    export interface GetPoisParams {
      segmentId: string
      fromKm: number
      toKm: number
      categories?: PoiCategory[]
    }

    export async function getPois(params: GetPoisParams): Promise<Poi[]> {
      const searchParams = new URLSearchParams({
        segmentId: params.segmentId,
        fromKm: String(params.fromKm),
        toKm: String(params.toKm),
      })
      if (params.categories && params.categories.length > 0) {
        params.categories.forEach((c) => searchParams.append('categories', c))
      }
      return apiFetch<Poi[]>(`/api/pois?${searchParams.toString()}`)
    }

    export type { Poi, PoiCategory }
    ```

- [x] Task 10 — Create `use-pois.ts` TanStack Query hook (AC: #1, #4)
  - [x] 00.1 Create `apps/web/src/hooks/use-pois.ts`:
    ```typescript
    import { useQueries } from '@tanstack/react-query'
    import { useMapStore } from '@/stores/map.store'
    import { getPois } from '@/lib/api-client'
    import { LAYER_CATEGORIES, CATEGORY_TO_LAYER } from '@ridenrest/shared'
    import type { MapSegmentData } from '@/lib/api-client'
    import type { Poi, MapLayer } from '@ridenrest/shared'

    const MAX_SEGMENT_QUERY_KM = 30

    interface UsePoisResult {
      poisByLayer: Record<MapLayer, Poi[]>
      isPending: boolean
      hasError: boolean
    }

    export function usePois(segments: MapSegmentData[]): UsePoisResult {
      const { visibleLayers } = useMapStore()

      // Only query segments that are ready + when at least one layer is visible
      const readySegments = segments.filter((s) => s.parseStatus === 'done')
      const isEnabled = visibleLayers.size > 0 && readySegments.length > 0

      // Build active categories from visible layers
      const activeCategories = [...visibleLayers].flatMap(
        (layer) => LAYER_CATEGORIES[layer] ?? [],
      )

      // One query per ready segment
      const queries = readySegments.map((segment) => ({
        queryKey: ['pois', {
          segmentId: segment.id,
          fromKm: 0,
          toKm: Math.min(segment.distanceKm, MAX_SEGMENT_QUERY_KM),
          categories: activeCategories.sort(),
        }] as const,
        queryFn: () => getPois({
          segmentId: segment.id,
          fromKm: 0,
          toKm: Math.min(segment.distanceKm, MAX_SEGMENT_QUERY_KM),
          categories: activeCategories,
        }),
        enabled: isEnabled,
        staleTime: 1000 * 60 * 60 * 24,  // 24h — matches Redis TTL
      }))

      const results = useQueries({ queries })

      // Combine all segment results and group by MapLayer
      const allPois = results.flatMap((r) => r.data ?? [])
      const poisByLayer: Record<MapLayer, Poi[]> = {
        accommodations: [],
        restaurants: [],
        supplies: [],
        bike: [],
      }
      for (const poi of allPois) {
        const layer = CATEGORY_TO_LAYER[poi.category]
        if (layer) {
          poisByLayer[layer].push(poi)
        }
      }

      const isPending = isEnabled && results.some((r) => r.isPending)
      const hasError = results.some((r) => r.isError)

      return { poisByLayer, isPending, hasError }
    }
    ```

- [x] Task 11 — Create `<LayerToggles />` component (AC: #1, #2, #4)
  - [x] 01.1 Create `apps/web/src/app/(app)/map/[id]/_components/layer-toggles.tsx`:
    ```tsx
    'use client'
    import { useMapStore } from '@/stores/map.store'
    import { Skeleton } from '@/components/ui/skeleton'
    import type { MapLayer } from '@ridenrest/shared'

    interface LayerConfig {
      layer: MapLayer
      label: string
      icon: string
      activeColor: string  // Tailwind bg color class for active state
    }

    const LAYER_CONFIGS: LayerConfig[] = [
      { layer: 'accommodations', label: 'Hébergements', icon: '🏨', activeColor: 'bg-blue-500 text-white' },
      { layer: 'restaurants',    label: 'Restauration',  icon: '🍽️', activeColor: 'bg-red-500 text-white' },
      { layer: 'supplies',       label: 'Alimentation',  icon: '🛒', activeColor: 'bg-green-500 text-white' },
      { layer: 'bike',           label: 'Vélo',          icon: '🚲', activeColor: 'bg-amber-500 text-white' },
    ]

    interface LayerTogglesProps {
      isPending: boolean
    }

    export function LayerToggles({ isPending }: LayerTogglesProps) {
      const { visibleLayers, toggleLayer } = useMapStore()

      return (
        <div className="flex gap-2 p-2 bg-white/90 dark:bg-zinc-900/90 backdrop-blur rounded-xl shadow-md">
          {LAYER_CONFIGS.map(({ layer, label, icon, activeColor }) => {
            const isActive = visibleLayers.has(layer)
            return (
              <button
                key={layer}
                onClick={() => toggleLayer(layer)}
                className={[
                  // Minimum 48×48px touch target (AC #2)
                  'min-w-[48px] min-h-[48px]',
                  'flex flex-col items-center justify-center gap-0.5 rounded-lg px-3 py-2',
                  'text-xs font-medium transition-colors',
                  'border border-transparent',
                  isActive
                    ? activeColor
                    : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-zinc-300',
                ].join(' ')}
                aria-label={`${isActive ? 'Masquer' : 'Afficher'} les ${label}`}
                aria-pressed={isActive}
              >
                <span className="text-lg leading-none" aria-hidden="true">{icon}</span>
                {isPending && isActive ? (
                  <Skeleton className="h-2 w-12 mt-0.5" />
                ) : (
                  <span className="truncate">{label}</span>
                )}
              </button>
            )
          })}
        </div>
      )
    }
    ```

- [x] Task 12 — Create `usePoiLayers` hook for MapLibre POI layer management (AC: #1, #2, #3)
  - [x] 02.1 Create `apps/web/src/hooks/use-poi-layers.ts`:
    ```typescript
    import { useEffect } from 'react'
    import { useMapStore } from '@/stores/map.store'
    import type { Poi, MapLayer } from '@ridenrest/shared'
    import type maplibregl from 'maplibre-gl'

    // Category color map — matches LayerToggles active colors
    const LAYER_COLORS: Record<MapLayer, string> = {
      accommodations: '#3B82F6',  // blue-500
      restaurants:    '#EF4444',  // red-500
      supplies:       '#10B981',  // green-500
      bike:           '#F59E0B',  // amber-500
    }

    const CLUSTER_MAX_ZOOM = 13
    const CLUSTER_RADIUS = 50

    export function usePoiLayers(
      mapRef: React.RefObject<maplibregl.Map | null>,
      poisByLayer: Record<MapLayer, Poi[]>,
    ) {
      const { visibleLayers } = useMapStore()

      useEffect(() => {
        const map = mapRef.current
        if (!map || !map.isStyleLoaded()) return

        const ALL_LAYERS: MapLayer[] = ['accommodations', 'restaurants', 'supplies', 'bike']

        for (const layer of ALL_LAYERS) {
          const sourceId = `pois-${layer}`
          const clusterLayerId = `${sourceId}-clusters`
          const clusterCountId = `${sourceId}-cluster-count`
          const pointLayerId = `${sourceId}-points`
          const color = LAYER_COLORS[layer]

          if (!visibleLayers.has(layer)) {
            // Remove existing layers + source if they exist
            if (map.getLayer(clusterCountId)) map.removeLayer(clusterCountId)
            if (map.getLayer(clusterLayerId)) map.removeLayer(clusterLayerId)
            if (map.getLayer(pointLayerId)) map.removeLayer(pointLayerId)
            if (map.getSource(sourceId)) map.removeSource(sourceId)
            continue
          }

          const pois = poisByLayer[layer]
          const features: GeoJSON.Feature[] = pois.map((poi) => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [poi.lng, poi.lat] },
            properties: { id: poi.id, name: poi.name, category: poi.category },
          }))

          if (map.getSource(sourceId)) {
            // Update existing source data
            ;(map.getSource(sourceId) as maplibregl.GeoJSONSource).setData({
              type: 'FeatureCollection',
              features,
            })
          } else {
            // Add new clustered source
            map.addSource(sourceId, {
              type: 'geojson',
              data: { type: 'FeatureCollection', features },
              cluster: true,
              clusterMaxZoom: CLUSTER_MAX_ZOOM,
              clusterRadius: CLUSTER_RADIUS,
            })

            // Cluster circle layer
            map.addLayer({
              id: clusterLayerId,
              type: 'circle',
              source: sourceId,
              filter: ['has', 'point_count'],
              paint: {
                'circle-color': color,
                'circle-radius': ['step', ['get', 'point_count'], 16, 10, 22, 50, 28],
                'circle-opacity': 0.8,
                'circle-stroke-color': '#fff',
                'circle-stroke-width': 2,
              },
            })

            // Cluster count label
            map.addLayer({
              id: clusterCountId,
              type: 'symbol',
              source: sourceId,
              filter: ['has', 'point_count'],
              layout: {
                'text-field': '{point_count_abbreviated}',
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                'text-size': 12,
              },
              paint: { 'text-color': '#ffffff' },
            })

            // Unclustered point layer
            map.addLayer({
              id: pointLayerId,
              type: 'circle',
              source: sourceId,
              filter: ['!', ['has', 'point_count']],
              paint: {
                'circle-color': color,
                'circle-radius': 8,
                'circle-stroke-color': '#fff',
                'circle-stroke-width': 2,
              },
            })

            // Cluster click → zoom in (AC #3)
            map.on('click', clusterLayerId, (e) => {
              if (!e.features || e.features.length === 0) return
              const feature = e.features[0]
              const geometry = feature.geometry as GeoJSON.Point
              map.flyTo({
                center: geometry.coordinates as [number, number],
                zoom: map.getZoom() + 2,
              })
            })

            map.on('mouseenter', clusterLayerId, () => {
              map.getCanvas().style.cursor = 'pointer'
            })
            map.on('mouseleave', clusterLayerId, () => {
              map.getCanvas().style.cursor = ''
            })
          }
        }
      }, [mapRef, poisByLayer, visibleLayers])
    }
    ```

- [x] Task 13 — Integrate POI layers in `map-canvas.tsx` (AC: #1, #2, #3)
  - [x] 03.1 Update `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx`:
    - Add props: `poisByLayer: Record<MapLayer, Poi[]>`
    - Import and call `usePoiLayers(mapRef, poisByLayer)` inside the component
    - Re-add POI layers after theme switch: in the `style.load` callback, call a new `restorePoiLayers()` helper (or rely on `usePoiLayers` re-running after `isStyleLoaded` becomes true)
    - Add a `useEffect` that watches `map.isStyleLoaded()` after theme change to re-trigger POI layer hook:
    ```typescript
    // In the theme effect, after addTraceLayers call inside once('style.load', ...):
    map.once('style.load', () => {
      addTraceLayers(map, segments)
      // POI layers will be re-added by usePoiLayers effect on next render
      // Force re-render by setting styleLoaded state:
      setStyleLoaded((v) => !v)
    })
    ```
    ⚠️ `usePoiLayers` watches `map.isStyleLoaded()` — but it's a side-effect hook, not reactive. Recommend adding a `styleVersion` state in `map-canvas.tsx` incremented after `style.load`, then pass it as a dep to `usePoiLayers`. Example: `usePoiLayers(mapRef, poisByLayer, styleVersion)`.

    **Complete updated interface:**
    ```typescript
    interface MapCanvasProps {
      segments: MapSegmentData[]
      adventureName: string
      poisByLayer: Record<MapLayer, Poi[]>  // NEW
    }
    ```

- [x] Task 14 — Integrate `<LayerToggles />` and POI data in `map-view.tsx` (AC: #1, #4)
  - [x] 04.1 Update `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx`:
    ```tsx
    // Add at top of file:
    import { usePois } from '@/hooks/use-pois'
    import { LayerToggles } from './layer-toggles'

    // Inside MapView component, after existing code:
    const readySegments = data.segments.filter((s) => s.parseStatus === 'done')
    const { poisByLayer, isPending: poisPending, hasError: poisError } = usePois(readySegments)

    // In the JSX — add <LayerToggles /> and pass poisByLayer to <MapCanvas />:
    return (
      <div className="relative h-full w-full">
        {/* ... existing pending banner ... */}
        <MapCanvas
          segments={readySegments}
          adventureName={data.adventureName}
          poisByLayer={poisByLayer}   // NEW
        />
        {/* Layer toggles — fixed to bottom of map */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
          <LayerToggles isPending={poisPending} />
        </div>
        {poisError && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10">
            <StatusBanner message="Recherche POI indisponible — réessayer dans quelques instants." />
          </div>
        )}
      </div>
    )
    ```
    ⚠️ `LAYER_CATEGORIES` import: `import { LAYER_CATEGORIES } from '@ridenrest/shared'`

- [x] Task 15 — Update `map.store.ts` to import `MapLayer` from shared (AC: #1)
  - [x] 05.1 Update `apps/web/src/stores/map.store.ts`:
    ```typescript
    import type { MapLayer } from '@ridenrest/shared'
    // Remove local 'export type MapLayer = ...' — now comes from shared package
    ```
    ⚠️ Verify all files importing `MapLayer` from `map.store` update their import to `@ridenrest/shared` or re-export from `map.store`. Check: `map-canvas.tsx`, `layer-toggles.tsx`, `use-pois.ts` — all should import from `@ridenrest/shared` directly.

- [x] Task 16 — Frontend tests (Vitest)
  - [x] 06.1 Create `apps/web/src/app/(app)/map/[id]/_components/layer-toggles.test.tsx`:
    - Renders 4 toggle buttons with correct icons and labels
    - Clicking a button calls `toggleLayer()` (mock useMapStore)
    - Active layer button has `aria-pressed="true"` and active color class
    - Shows `<Skeleton />` in active layer button when `isPending=true`
    - Each button has `min-h-[48px]` (touch target — verify in computed style or className)
  - [x] 06.2 Create `apps/web/src/hooks/use-pois.test.ts`:
    - Returns empty `poisByLayer` when `visibleLayers` is empty (no queries fired)
    - Fires queries when `visibleLayers` has active layers
    - Groups returned POIs by layer using `CATEGORY_TO_LAYER` mapping
    - `isPending = true` when at least one query is loading
    - `hasError = true` when any query fails
    - Mock `useMapStore` with vi.mock
    - Mock `getPois` with vi.mock('@/lib/api-client')
  - [x] 06.3 Update `apps/web/src/app/(app)/map/[id]/_components/map-canvas.test.tsx`:
    - Add test: `usePoiLayers` is called with empty `poisByLayer` when no layers visible (verify no `addSource` called for POI sources)
    - Default props now require `poisByLayer` — add to all existing test cases

---

## Dev Notes

### CRITICAL: What's Already Done — Do NOT Redo

**`apps/api` — existing infrastructure:**
- ✅ `JwtAuthGuard` — global, protects `GET /pois` automatically
- ✅ `ResponseInterceptor` — global, wraps `Poi[]` into `{ data: [...] }` automatically
- ✅ `RedisModule` — global module, `RedisProvider` injectable in any module without extra imports
- ✅ `RedisProvider.getClient()` — returns the ioredis client. Use `.get(key)`, `.setex(key, ttl, value)`.
- ✅ `ValidationPipe` global — validates `FindPoisDto` via class-validator automatically
- ✅ `accommodations_cache` table — `segment_id` FK, `external_id`, `source`, `category`, `expires_at` columns
- ✅ `adventure_segments.waypoints` JSONB — format `Array<{ lat, lng, ele, distKm }>` (populated by GPX parse job)
- ✅ `CORRIDOR_WIDTH_M`, `MAX_SEARCH_RANGE_KM` constants in `packages/shared/src/constants/gpx.constants.ts`
- ✅ `PoiCategory`, `Poi`, `poiSearchSchema` in packages/shared — extend don't replace
- ✅ `@CurrentUser()` decorator at `apps/api/src/common/decorators/current-user.decorator.ts`
- ✅ Drizzle imports: `import { db, accommodationsCache, adventureSegments } from '@ridenrest/database'`

**`apps/web` — existing infrastructure:**
- ✅ `useMapStore` at `apps/web/src/stores/map.store.ts` — `visibleLayers: Set<MapLayer>`, `toggleLayer()`, `fromKm=0`, `toKm=30` already defined
- ✅ `maplibre-gl` v5.20.1 installed in `apps/web` — no additional install needed
- ✅ `map-canvas.tsx` — MapLibre map initialized, `mapRef` available inside component
- ✅ `<StatusBanner />` at `apps/web/src/components/shared/status-banner.tsx`
- ✅ `<Skeleton />` at `apps/web/src/components/ui/skeleton.tsx`
- ✅ `apiFetch()` in `apps/web/src/lib/api-client.ts` — handles JWT + ResponseInterceptor unwrapping
- ✅ TanStack Query `useQueries` available — used for parallel segment queries in `use-pois.ts`
- ✅ `(app)/map/[id]/page.tsx` and `_components/map-view.tsx` — both exist, just need updates
- ✅ `packages/shared/src/types/poi.types.ts` — has `Poi`, `PoiCategory` — extend in Task 8

**What does NOT exist yet:**
- ❌ `apps/api/src/pois/` — entire module to create from scratch
- ❌ `PoisModule` not registered in `app.module.ts`
- ❌ `<LayerToggles />` component
- ❌ `usePoiLayers` hook
- ❌ `usePois` hook
- ❌ `LAYER_CATEGORIES`, `CATEGORY_TO_LAYER` constants — add to `packages/shared`
- ❌ `MapLayer` type not yet in `packages/shared` — currently in `map.store.ts` only
- ❌ `getPois()` function not in `api-client.ts`

---

### Architecture: MapLibre POI Clustering — Native GeoJSON Cluster

MapLibre GL JS v5 supports native clustering via GeoJSON source. No external library needed.

```typescript
// Source with clustering enabled
map.addSource('pois-accommodations', {
  type: 'geojson',
  data: { type: 'FeatureCollection', features: [...] },
  cluster: true,           // Enable clustering
  clusterMaxZoom: 13,      // Max zoom where clustering applies
  clusterRadius: 50,       // Pixel radius for cluster grouping
})

// Layer 1: Cluster circles
map.addLayer({
  id: 'pois-accommodations-clusters',
  type: 'circle',
  source: 'pois-accommodations',
  filter: ['has', 'point_count'],    // Only clustered points
  ...
})

// Layer 2: Count text
map.addLayer({
  id: 'pois-accommodations-cluster-count',
  type: 'symbol',
  source: 'pois-accommodations',
  filter: ['has', 'point_count'],
  layout: { 'text-field': '{point_count_abbreviated}' }
})

// Layer 3: Individual pins
map.addLayer({
  id: 'pois-accommodations-points',
  type: 'circle',
  source: 'pois-accommodations',
  filter: ['!', ['has', 'point_count']],   // Only unclustered points
  ...
})

// Click cluster → zoom in
map.on('click', 'pois-accommodations-clusters', (e) => {
  map.flyTo({ center: e.features[0].geometry.coordinates, zoom: map.getZoom() + 2 })
})
```

**CRITICAL**: After `map.setStyle()` (theme change), ALL sources and layers are removed. The `usePoiLayers` hook must re-add POI layers after `style.load`. Pass a `styleVersion` counter from `map-canvas.tsx` to `usePoiLayers` as a dependency to trigger re-runs.

---

### Architecture: Overpass API — Fair Use Rules

Overpass is a community resource. Critical constraints:
- **No parallel requests**: one request at a time (sequential segment queries are fine since we use `useQueries` which fires in parallel — acceptable as each is a separate bbox, but cache hits will prevent most calls)
- **Timeout**: always set `[timeout:25]` in the query header
- **Reasonable bbox**: never query the entire route at once — the 30km corridor cap ensures reasonable bbox sizes
- **Rate limit**: no formal limit, but avoid > 10 req/min per IP. With 24h Redis caching, real-world usage is well within limits.
- **User-Agent**: not strictly required but good practice — fetch from NestJS server-side (not browser) avoids browser User-Agent issues

---

### Architecture: Redis Cache Key Design

```
pois:{segmentId}:{fromKm}:{toKm}:{categories_sorted_csv}
```

Example: `pois:uuid-123:0:30:hotel,hostel,restaurant`

**Why include categories in the key**: different layer combinations produce different result sets. A query for `accommodations` only shouldn't pollute the cache for `accommodations+restaurants`.

**TTL**: 24h = `86400` seconds (matches `expiresAt` column in `accommodations_cache` table).

**Redis budget**: Each POI search = 2 Redis commands (GET check + SET result). With 10k cmds/day free tier and 24h TTL, the cache quickly warms up. Subsequent identical queries = 1 Redis command (GET only, returns cached).

---

### Architecture: MapLayer → PoiCategory Mapping

The UI uses 4 `MapLayer` toggles, but the DB has 9 `PoiCategory` values. The mapping:

```typescript
// In packages/shared/src/types/poi.types.ts
LAYER_CATEGORIES = {
  accommodations: ['hotel', 'hostel', 'camp_site', 'shelter'],
  restaurants:    ['restaurant'],
  supplies:       ['supermarket', 'convenience'],
  bike:           ['bike_shop', 'bike_repair'],
}
```

**Overpass tag equivalents:**
| PoiCategory | Overpass tag | Notes |
|---|---|---|
| hotel | `amenity=hotel` | Commercial hotels |
| hostel | `amenity=hostel` | Budget accommodation |
| camp_site | `tourism=camp_site` | Official campsites |
| shelter | `amenity=shelter` | Basic shelters, bivouac spots |
| restaurant | `amenity=restaurant` | Restaurants (not cafes/bars for MVP) |
| supermarket | `shop=supermarket` | Large food stores |
| convenience | `shop=convenience` | Small convenience stores |
| bike_shop | `shop=bicycle` | Bike shops |
| bike_repair | `amenity=bicycle_repair_station` | Self-service repair stations |

---

### Architecture: POI Endpoint — No GPS/Location Data (RGPD)

Per project RGPD rules: `GET /pois?segmentId=X&fromKm=Y&toKm=Z` — no GPS coordinates in request body or query params. The server computes the search area from the segment geometry stored in the DB. Client sends only `segmentId` + km range.

---

### Architecture: `usePoiLayers` + Theme Switching

`usePoiLayers` calls `map.isStyleLoaded()` to guard layer addition. After a theme switch, `map.setStyle()` triggers `style.load` event. The hook must re-run AFTER that event.

Recommended pattern in `map-canvas.tsx`:
```typescript
const [styleVersion, setStyleVersion] = useState(0)

// In theme effect:
map.setStyle(newStyle)
map.once('style.load', () => {
  addTraceLayers(map, segments)
  setStyleVersion((v) => v + 1)  // Triggers usePoiLayers re-run
})

// usePoiLayers receives styleVersion as extra dep:
usePoiLayers(mapRef, poisByLayer, styleVersion)

// In usePoiLayers signature:
export function usePoiLayers(
  mapRef: React.RefObject<maplibregl.Map | null>,
  poisByLayer: Record<MapLayer, Poi[]>,
  styleVersion: number,  // Forces re-run after theme change
)
```

---

### Architecture: Previous Story (4.1) Learnings

Patterns from 4.1 that apply here:
- Dynamic import inside `useEffect` for MapLibre (SSR safety) — POI layers code runs inside `map.isStyleLoaded()` check, no dynamic import needed for layer management hooks
- `import type maplibregl from 'maplibre-gl'` at module level (type-only, no runtime bundle)
- Mock maplibre-gl entirely in Vitest tests: `vi.mock('maplibre-gl', () => ({ default: { Map: vi.fn()... } }))`
- `afterEach(cleanup)` needed in Vitest React Testing Library tests
- `resolvedTheme` (not `theme`) for dark mode check
- GeoJSON coordinates ALWAYS `[lng, lat]` — NEVER `[lat, lng]`
- NestJS: more specific routes before generic `:id` routes
- `Button` wrapping `Link`: use `<Link><Button>` structure (not `<Button><Link>`)
- `authDb` vs `db`: use `db` (main pool) in NestJS services — `authDb` is Next.js only

**Review issues from 4.1 to avoid repeating:**
- Missing `refetchInterval` for live data → in `use-pois.ts`, POI data is static (24h cache) so no refetchInterval needed
- Async import not cancelled on unmount → not applicable for `usePoiLayers` (no async import)
- Missing test for error state → ensure `use-pois.test.ts` covers `hasError = true` case

---

### Project Structure Notes

**Files to CREATE:**
```
apps/api/src/pois/
  pois.module.ts
  pois.controller.ts
  pois.service.ts
  pois.service.test.ts
  pois.repository.ts
  dto/
    find-pois.dto.ts
  providers/
    overpass.provider.ts
    overpass.provider.test.ts

apps/web/src/app/(app)/map/[id]/_components/
  layer-toggles.tsx
  layer-toggles.test.tsx                      ← NEW

apps/web/src/hooks/
  use-pois.ts
  use-pois.test.ts
  use-poi-layers.ts
```

**Files to MODIFY:**
```
apps/api/src/app.module.ts                    ← Add PoisModule import
apps/web/src/lib/api-client.ts                ← Add getPois() function + Poi/PoiCategory type exports
apps/web/src/stores/map.store.ts              ← Import MapLayer from @ridenrest/shared
apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx   ← Add poisByLayer prop + usePoiLayers hook
apps/web/src/app/(app)/map/[id]/_components/map-view.tsx     ← Add usePois hook + LayerToggles
apps/web/src/app/(app)/map/[id]/_components/map-canvas.test.tsx  ← Update for new prop
packages/shared/src/types/poi.types.ts        ← Add PoiSearchResponse, LAYER_CATEGORIES, CATEGORY_TO_LAYER, MapLayer
packages/shared/src/index.ts                  ← Export new types/constants
```

**No DB migration required** — `accommodations_cache` table already exists with all required columns. `adventure_segments.waypoints` JSONB already stores the waypoint data needed for bbox computation.

---

### Anti-Patterns to Avoid

```typescript
// ❌ Querying GPS coordinates in /pois endpoint (RGPD)
GET /pois?lat=48.8&lng=2.3&radius=5km
// ✅ Server computes search area from segmentId
GET /pois?segmentId=uuid&fromKm=0&toKm=30

// ❌ Querying Overpass in the browser (CORS + rate limit issues)
// In a Next.js component or api route:
const res = await fetch('https://overpass-api.de/api/interpreter', ...)
// ✅ Always via NestJS (server-to-server, proper caching)
GET /api/pois?segmentId=X&fromKm=0&toKm=30

// ❌ Using map.addLayer() without checking if source exists (crashes on re-render)
map.addLayer({ id: 'pois-accommodations-clusters', source: 'pois-accommodations' })
// ✅ Check with map.getSource() first
if (!map.getSource('pois-accommodations')) { map.addSource(...); map.addLayer(...) }

// ❌ Not removing POI layers on theme switch (layers survive setStyle — false for MapLibre)
// MapLibre's setStyle() ALWAYS removes all sources and layers
// ✅ Re-add via usePoiLayers after style.load event using styleVersion pattern

// ❌ Importing MapLayer from map.store (creates circular dependency risk)
import type { MapLayer } from '@/stores/map.store'
// ✅ Import from shared package
import type { MapLayer } from '@ridenrest/shared'

// ❌ Hardcoding POI category → layer mapping in both frontend and backend
// ✅ Single source of truth in packages/shared/src/types/poi.types.ts

// ❌ GeoJSON coordinates in [lat, lng] order
coordinates: [poi.lat, poi.lng]
// ✅ Always [lng, lat] for GeoJSON
coordinates: [poi.lng, poi.lat]

// ❌ Parallel Overpass queries (multiple simultaneous requests to Overpass from NestJS)
await Promise.all(segments.map(s => overpassProvider.queryPois(...)))
// ✅ Sequential is fine given Redis 24h cache — after first warmup, all hits
// For story 4.2 single-segment queries are fine; story 4.3 may need sequential

// ❌ Returning GPS position from client to verify ownership in pois endpoint
// The endpoint uses segmentId which has DB-level ownership via FK + adventureId check
// ✅ No GPS in API request — ownership verified by segmentId lookup in DB

// ❌ Cache key without categories sort
`pois:${segmentId}:${fromKm}:${toKm}:${categories.join(',')}`
// ['hotel','restaurant'] and ['restaurant','hotel'] would produce different keys
// ✅ Sort categories before building key
`pois:${segmentId}:${fromKm}:${toKm}:${categories.sort().join(',')}`
```

---

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 4, Story 4.2 ACs: FR-023, FR-024]
- [Source: _bmad-output/planning-artifacts/architecture.md — Map & Visualization: MapLibre layer toggles, poi-layer.tsx, layer-toggles.tsx components, POI pipeline architecture]
- [Source: _bmad-output/planning-artifacts/architecture.md — POI Search: GET /pois endpoint, Redis cache key `pois:{segmentId}:{fromKm}:{toKm}`, Overpass bbox strategy, 30km cap]
- [Source: _bmad-output/planning-artifacts/architecture.md — NestJS pois/ module structure: pois.module.ts, controller, service, repository, overpass.provider.ts]
- [Source: _bmad-output/project-context.md — NestJS architecture rules, ResponseInterceptor, BullMQ, RedisProvider injection, error handling (no try/catch in controllers)]
- [Source: _bmad-output/project-context.md — RGPD: GPS position NEVER sent to server, query by segmentId only]
- [Source: _bmad-output/project-context.md — External API Rate Limits: Overpass API fair use with 24h Redis TTL]
- [Source: apps/web/src/stores/map.store.ts — MapLayer type, visibleLayers Set<MapLayer>, toggleLayer(), fromKm=0, toKm=30 defaults]
- [Source: packages/shared/src/types/poi.types.ts — Poi interface, PoiCategory type]
- [Source: packages/shared/src/schemas/poi-search.schema.ts — poiSearchSchema with MAX_SEARCH_RANGE_KM validation]
- [Source: packages/shared/src/constants/gpx.constants.ts — CORRIDOR_WIDTH_M=500, MAX_SEARCH_RANGE_KM=30]
- [Source: packages/database/src/schema/accommodations-cache.ts — table structure, unique constraint (segment_id, external_id, source)]
- [Source: apps/api/src/common/providers/redis.provider.ts — RedisProvider: getClient() returns ioredis instance, setex/get methods]
- [Source: _bmad-output/implementation-artifacts/4-1-gpx-trace-display-on-interactive-map.md — MapLibre patterns: dynamic import, setStyle+style.load, GeoJSON [lng,lat] order, theme switching, maplibre-gl mock for Vitest, styleVersion pattern]
- [Source: apps/api/src/app.module.ts — Module registration pattern, JwtAuthGuard global setup]

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Implemented complete NestJS `pois` module (module, controller, service, repository, OverpassProvider, FindPoisDto)
- PoisService: Redis 24h cache → Overpass bbox query → DB cache fallback, with cross-field validation (toKm > fromKm, range ≤ 30km)
- PoisRepository: upsert on conflict for accommodations_cache, segmentWaypoints fetch for bbox computation
- OverpassProvider: node + way queries per category, 25s timeout, AbortSignal.timeout(30s)
- MapLayer type moved to packages/shared/src/types/map.types.ts; LAYER_CATEGORIES + CATEGORY_TO_LAYER constants in poi.types.ts
- map.store.ts now imports MapLayer from @ridenrest/shared and re-exports it
- Frontend: usePois hook (TanStack useQueries, 24h staleTime), usePoiLayers hook (MapLibre native GeoJSON clustering, styleVersion pattern for theme switch), LayerToggles component (4 toggles, 48×48px touch target, Skeleton loading state)
- map-canvas.tsx: added poisByLayer prop + styleVersion state for POI layer re-init after theme change
- map-view.tsx: integrates usePois + LayerToggles + poisError banner
- Tests: 12 backend Jest (pois.service + overpass.provider) + 17 frontend Vitest (layer-toggles + use-pois + map-canvas update + map-view fix) — all 95 frontend + 76 backend tests pass

### File List

**Created:**
- `apps/api/src/pois/pois.module.ts`
- `apps/api/src/pois/pois.controller.ts`
- `apps/api/src/pois/pois.service.ts`
- `apps/api/src/pois/pois.service.test.ts`
- `apps/api/src/pois/pois.repository.ts`
- `apps/api/src/pois/dto/find-pois.dto.ts`
- `apps/api/src/pois/providers/overpass.provider.ts`
- `apps/api/src/pois/providers/overpass.provider.test.ts`
- `packages/shared/src/types/map.types.ts`
- `apps/web/src/hooks/use-pois.ts`
- `apps/web/src/hooks/use-pois.test.ts`
- `apps/web/src/hooks/use-poi-layers.ts`
- `apps/web/src/app/(app)/map/[id]/_components/layer-toggles.tsx`
- `apps/web/src/app/(app)/map/[id]/_components/layer-toggles.test.tsx`

**Modified:**
- `apps/api/src/app.module.ts` — PoisModule registered
- `packages/shared/src/types/poi.types.ts` — PoiSearchResponse, LAYER_CATEGORIES, CATEGORY_TO_LAYER added; MapLayer re-exported
- `packages/shared/src/index.ts` — PoiSearchResponse, MapLayer, LAYER_CATEGORIES, CATEGORY_TO_LAYER exported
- `apps/web/src/lib/api-client.ts` — getPois() + GetPoisParams + Poi/PoiCategory exports added
- `apps/web/src/stores/map.store.ts` — MapLayer imported from @ridenrest/shared
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.tsx` — poisByLayer prop + usePoiLayers + styleVersion
- `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx` — usePois + LayerToggles + poisError banner
- `apps/web/src/app/(app)/map/[id]/_components/map-canvas.test.tsx` — poisByLayer prop + new POI test + mock updates
- `apps/web/src/app/(app)/map/[id]/_components/map-view.test.tsx` — usePois + LayerToggles + useMapStore mocks added

**Code Review Fixes (2026-03-15):**
- `apps/api/src/pois/pois.controller.ts` — Added `@CurrentUser()` + passed `userId` to service
- `apps/api/src/pois/pois.service.ts` — Added `userId` param; Overpass fallback no longer cached in Redis; `findCachedPois` now receives categories
- `apps/api/src/pois/pois.repository.ts` — `getSegmentWaypoints` now joins adventures for ownership check; `findCachedPois` filters by categories
- `apps/api/src/pois/dto/find-pois.dto.ts` — Added `@Transform` for single-value `?categories=X` coercion; typed as `PoiCategory[]`
- `apps/api/src/pois/pois.service.test.ts` — Tests updated for new signatures + new ownership + no-Redis-on-fallback assertions
- `apps/web/src/hooks/use-poi-layers.ts` — Added cleanup function to remove MapLibre event listeners on re-render/unmount

### Review Follow-ups (AI)

- [ ] [AI-Review][Medium] `CATEGORY_TO_OVERPASS_TAGS` in `pois.service.ts:10` is dead code — values are never consumed, only `Object.keys()` is used. Replace with a typed `ALL_POI_CATEGORIES` const array.
- [ ] [AI-Review][Medium] `usePois` in `use-pois.ts:29` hardcodes `fromKm: 0` and `toKm: 30` — ignores `fromKm`/`toKm` from `useMapStore`. Will need to be wired up when `SearchRangeSlider` is implemented.
- [ ] [AI-Review][Medium] `activeCategories.sort()` in `pois.service.ts:46` mutates in place — use `[...activeCategories].sort()` for explicit immutability.
- [ ] [AI-Review][Low] `pois.service.test.ts` bypasses DTO validation (segmentId not a real UUID, no HTTP-level test). Consider adding a supertest integration test for the controller endpoint.

