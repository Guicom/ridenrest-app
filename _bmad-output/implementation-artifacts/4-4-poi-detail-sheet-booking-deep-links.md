# Story 4.4: POI Detail Sheet & Booking Deep Links

Status: ready-for-dev

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **cyclist user**,
I want to tap a POI pin and see its details with a direct booking link,
So that I can evaluate an accommodation and open it on Hotels.com or Booking.com in one tap.

## Acceptance Criteria

1. **Given** a user taps a POI pin on the map,
   **When** the detail sheet opens,
   **Then** it displays: name, category, distance from trace (m), km on the trace, D+ (m) from `fromKm` to POI, estimated time — and OSM tags (phone, website) if available (FR-032, FR-080, FR-081).

2. **Given** the POI is an accommodation (hotel, hostel, camp_site, shelter),
   **When** the detail sheet renders,
   **Then** it shows a "Rechercher sur Hotels.com" button AND a "Rechercher sur Booking.com" button — both deep-link URLs parameterized with the POI name (FR-033, FR-060).

3. **Given** a user taps a booking deep link,
   **When** the link is opened,
   **Then** it opens in a new browser tab with the correct search pre-filled, and the click is tracked via a fire-and-forget `POST /pois/booking-click` (FR-062).

4. **Given** the booking buttons render,
   **When** visible,
   **Then** a small "Lien partenaire" label is shown next to each button (FR-061, NFR-045).

5. **Given** Google Places enrichment is available,
   **When** the detail sheet loads,
   **Then** it progressively displays: rating (⭐ X.X), current open/closed status, and website — loaded async without blocking the sheet from opening (story 4.3 pre-cache used).

6. **Given** the user has not set a speed preference,
   **When** ETA renders,
   **Then** it uses 15 km/h fallback and displays with "~" prefix to signal estimation (FR-081).

## Tasks / Subtasks

### Backend — NestJS API

- [ ] Task 1 — Add `GooglePlacesProvider.getPlaceDetails()` method (AC: #5)
  - [ ] 1.1 Update `apps/api/src/pois/providers/google-places.provider.ts` — add method:
    ```typescript
    export interface GooglePlaceDetails {
      placeId: string
      displayName: string | null
      formattedAddress: string | null
      rating: number | null
      isOpenNow: boolean | null
      phone: string | null
      website: string | null
      types: string[]
    }

    async getPlaceDetails(placeId: string): Promise<GooglePlaceDetails> {
      if (!this.API_KEY) throw new Error('GOOGLE_PLACES_API_KEY not configured')

      const url = `https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`
      const fieldMask = [
        'id',
        'displayName',
        'formattedAddress',
        'rating',
        'regularOpeningHours.openNow',
        'internationalPhoneNumber',
        'websiteUri',
        'types',
      ].join(',')

      const response = await fetch(url, {
        headers: {
          'X-Goog-Api-Key': this.API_KEY,
          'X-Goog-FieldMask': fieldMask,  // Essentials tier — 10k/month free
        },
        signal: AbortSignal.timeout(8_000),
      })

      if (!response.ok) {
        throw new Error(`Place Details error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      return {
        placeId,
        displayName: data.displayName?.text ?? null,
        formattedAddress: data.formattedAddress ?? null,
        rating: data.rating ?? null,
        isOpenNow: data.regularOpeningHours?.openNow ?? null,
        phone: data.internationalPhoneNumber ?? null,
        website: data.websiteUri ?? null,
        types: data.types ?? [],
      }
    }

    /** Text Search (IDs Only) to find Google place_id for a known POI by name + location. */
    async findPlaceId(
      name: string,
      lat: number,
      lng: number,
    ): Promise<string | null> {
      if (!this.API_KEY) return null

      const body = {
        textQuery: name,
        locationBias: {
          circle: {
            center: { latitude: lat, longitude: lng },
            radius: 150.0,  // 150m — tight radius for specific POI match
          },
        },
        maxResultCount: 1,
        languageCode: 'fr',
      }

      const response = await fetch(this.BASE_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': this.API_KEY,
          'X-Goog-FieldMask': 'places.id',  // IDs Only — unlimited, $0
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(8_000),
      })

      if (!response.ok) return null

      const result = await response.json()
      return result.places?.[0]?.id ?? null
    }
    ```
    ⚠️ `getPlaceDetails` uses `X-Goog-FieldMask` with Essentials fields → 10k/month free tier. Do NOT add `photos` to the mask in story 4.4 — photo fetching is a separate API call and would consume additional quota. Keep to text data only.
    ⚠️ `findPlaceId` uses `IDs Only` → unlimited, $0. This is the targeted per-POI lookup (vs story 4.3's corridor-wide batch).

- [ ] Task 2 — Add `GET /pois/google-details` endpoint (AC: #5)
  - [ ] 2.1 Add to `apps/api/src/pois/pois.controller.ts`:
    ```typescript
    @Get('google-details')
    @ApiOperation({ summary: 'Get Google Places enrichment for a specific POI' })
    async getPoiGoogleDetails(
      @Query('externalId') externalId: string,
      @Query('segmentId') segmentId: string,
    ) {
      return this.poisService.getPoiGoogleDetails(externalId, segmentId)
    }
    ```
    ⚠️ This route must be declared BEFORE any `@Get(':id')` route in the controller to avoid NestJS route conflicts.

  - [ ] 2.2 Add `getPoiGoogleDetails()` in `apps/api/src/pois/pois.service.ts`:
    ```typescript
    async getPoiGoogleDetails(externalId: string, segmentId: string): Promise<GooglePlaceDetails | null> {
      if (!this.googlePlacesProvider.isConfigured()) return null

      const redis = this.redisProvider.getClient()
      const PLACE_ID_TTL = 60 * 60 * 24 * 7   // 7 days
      const DETAILS_TTL  = 60 * 60 * 24 * 7   // 7 days

      // 1. Look up google_place_id for this POI (may have been pre-cached by story 4.3)
      const placeIdKey = `google_place_id:${externalId}`
      let placeId = await redis.get(placeIdKey)

      if (!placeId) {
        // 2. Not pre-cached — do targeted Text Search (IDs Only) by name + location
        const poi = await this.poisRepository.findByExternalId(externalId, segmentId)
        if (!poi) return null

        placeId = await this.googlePlacesProvider.findPlaceId(poi.name, poi.lat, poi.lng)
        if (!placeId) return null

        await redis.setex(placeIdKey, PLACE_ID_TTL, placeId)
      }

      // 3. Check if Place Details already cached
      const detailsKey = `google_place_details:${placeId}`
      const cachedDetails = await redis.get(detailsKey)
      if (cachedDetails) {
        return JSON.parse(cachedDetails) as GooglePlaceDetails
      }

      // 4. Fetch Place Details Essentials (10k/month free)
      const details = await this.googlePlacesProvider.getPlaceDetails(placeId)

      // 5. Cache for 7 days
      await redis.setex(detailsKey, DETAILS_TTL, JSON.stringify(details))

      return details
    }
    ```

  - [ ] 2.3 Add `findByExternalId()` in `apps/api/src/pois/pois.repository.ts`:
    ```typescript
    async findByExternalId(externalId: string, segmentId: string): Promise<{ name: string; lat: number; lng: number } | null> {
      const rows = await db
        .select({ name: accommodationsCache.name, lat: accommodationsCache.lat, lng: accommodationsCache.lng })
        .from(accommodationsCache)
        .where(
          and(
            eq(accommodationsCache.externalId, externalId),
            eq(accommodationsCache.segmentId, segmentId),
          ),
        )
        .limit(1)
      return rows[0] ?? null
    }
    ```

- [ ] Task 3 — Add `POST /pois/booking-click` analytics endpoint (AC: #3)
  - [ ] 3.1 Add to `apps/api/src/pois/pois.controller.ts`:
    ```typescript
    @Post('booking-click')
    @HttpCode(204)
    @ApiOperation({ summary: 'Track a booking deep link click (analytics)' })
    async trackBookingClick(
      @Body() body: { externalId: string; platform: 'booking_com' | 'hotels_com' | 'airbnb' },
    ) {
      this.logger.log(`Booking click: ${body.platform} for POI ${body.externalId}`)
      // MVP: log only — extend with analytics service in future
    }
    ```
    ⚠️ Returns `204 No Content`. No body in response. This is a fire-and-forget analytics call — the client does not await it.
    ⚠️ Add `private readonly logger = new Logger(PoisController.name)` in the controller.

- [ ] Task 4 — Backend tests (AC: #5)
  - [ ] 4.1 Update `apps/api/src/pois/providers/google-places.provider.test.ts`:
    - `findPlaceId`: calls Text Search with `X-Goog-FieldMask: places.id`, correct locationBias
    - `findPlaceId`: returns `null` when API returns no results
    - `findPlaceId`: returns `null` when `API_KEY` not set
    - `getPlaceDetails`: calls correct URL, correct FieldMask (Essentials fields only)
    - `getPlaceDetails`: maps response correctly to `GooglePlaceDetails` type
    - `getPlaceDetails`: throws on non-200 response
  - [ ] 4.2 Update `apps/api/src/pois/pois.service.test.ts`:
    - `getPoiGoogleDetails`: returns `null` when `isConfigured()` is false
    - `getPoiGoogleDetails`: returns cached details from Redis without calling Google
    - `getPoiGoogleDetails`: calls `findPlaceId` when `placeIdKey` not in Redis
    - `getPoiGoogleDetails`: returns `null` when `findByExternalId` returns nothing
    - `getPoiGoogleDetails`: calls `getPlaceDetails` when `placeId` found but details not cached

---

### Shared Packages

- [ ] Task 5 — Add `GooglePlaceDetails` type to shared (AC: #5)
  - [ ] 5.1 Create `packages/shared/src/types/google-place.types.ts`:
    ```typescript
    export interface GooglePlaceDetails {
      placeId: string
      displayName: string | null
      formattedAddress: string | null
      rating: number | null
      isOpenNow: boolean | null
      phone: string | null
      website: string | null
      types: string[]
    }
    ```
  - [ ] 5.2 Export from `packages/shared/src/index.ts`:
    ```typescript
    export type { GooglePlaceDetails } from './types/google-place.types.js'
    ```

---

### Frontend — Next.js Web

- [ ] Task 6 — Add `getPoiGoogleDetails()` to `api-client.ts` (AC: #5)
  - [ ] 6.1 Add to `apps/web/src/lib/api-client.ts`:
    ```typescript
    import type { GooglePlaceDetails } from '@ridenrest/shared'

    export async function getPoiGoogleDetails(
      externalId: string,
      segmentId: string,
    ): Promise<GooglePlaceDetails | null> {
      try {
        return await apiFetch<GooglePlaceDetails>(
          `/api/pois/google-details?externalId=${encodeURIComponent(externalId)}&segmentId=${encodeURIComponent(segmentId)}`,
        )
      } catch {
        return null  // Enrichment is optional — never throw to caller
      }
    }

    export async function trackBookingClick(
      externalId: string,
      platform: 'booking_com' | 'hotels_com' | 'airbnb',
    ): Promise<void> {
      // Fire-and-forget — do NOT await in the click handler
      void apiFetch('/api/pois/booking-click', {
        method: 'POST',
        body: JSON.stringify({ externalId, platform }),
      }).catch(() => {/* ignore tracking errors */})
    }

    export type { GooglePlaceDetails }
    ```

- [ ] Task 7 — Create `usePoiGoogleDetails` TanStack Query hook (AC: #5)
  - [ ] 7.1 Create `apps/web/src/hooks/use-poi-google-details.ts`:
    ```typescript
    import { useQuery } from '@tanstack/react-query'
    import { getPoiGoogleDetails } from '@/lib/api-client'
    import type { GooglePlaceDetails } from '@ridenrest/shared'

    export function usePoiGoogleDetails(
      externalId: string | null,
      segmentId: string | null,
    ): { details: GooglePlaceDetails | null; isPending: boolean } {
      const { data, isPending } = useQuery({
        queryKey: ['poi-google-details', externalId, segmentId],
        queryFn: () => getPoiGoogleDetails(externalId!, segmentId!),
        enabled: !!externalId && !!segmentId,
        staleTime: 1000 * 60 * 60 * 24 * 7,  // 7 days — matches Redis TTL
        retry: false,  // Enrichment is optional — no retry on failure
      })

      return { details: data ?? null, isPending: isPending && !!externalId }
    }
    ```

- [ ] Task 8 — Create `<PoiDetailSheet />` component (AC: #1–#6)
  - [ ] 8.1 Create `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.tsx`:
    ```tsx
    'use client'
    import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
    import { Skeleton } from '@/components/ui/skeleton'
    import { useUIStore } from '@/stores/ui.store'
    import { useMapStore } from '@/stores/map.store'
    import { usePoiGoogleDetails } from '@/hooks/use-poi-google-details'
    import { computeElevationGain } from '@ridenrest/gpx'
    import { LAYER_CATEGORIES } from '@ridenrest/shared'
    import { trackBookingClick } from '@/lib/api-client'
    import type { Poi, MapLayer } from '@ridenrest/shared'
    import type { MapSegmentData } from '@/lib/api-client'

    const LAYER_ICONS: Record<MapLayer, string> = {
      accommodations: '🏨',
      restaurants:    '🍽️',
      supplies:       '🛒',
      bike:           '🚲',
    }

    const ACCOMMODATION_CATEGORIES = LAYER_CATEGORIES.accommodations

    const DEFAULT_SPEED_KMH = 15

    interface PoiDetailSheetProps {
      poi: Poi | null
      segments: MapSegmentData[]
      segmentId: string | null
    }

    export function PoiDetailSheet({ poi, segments, segmentId }: PoiDetailSheetProps) {
      const { selectedPoiId, setSelectedPoi } = useUIStore()
      const { fromKm } = useMapStore()
      const isOpen = !!selectedPoiId && !!poi

      const { details, isPending: detailsPending } = usePoiGoogleDetails(
        poi?.externalId ?? null,
        segmentId,
      )

      if (!poi) return null

      // ── D+ and ETA computation ────────────────────────────────────────────────
      const layer = (Object.entries(LAYER_CATEGORIES).find(([, cats]) =>
        cats.includes(poi.category),
      )?.[0] ?? 'accommodations') as MapLayer

      const poiKm = poi.distAlongRouteKm

      // Find waypoints between fromKm and poiKm across all segments
      const rangeWaypoints = segments.flatMap((seg) => {
        const segStart = seg.cumulativeStartKm
        const localFrom = Math.max(0, fromKm - segStart)
        const localTo = Math.min(seg.distanceKm, poiKm - segStart)
        if (localTo <= localFrom || !seg.waypoints) return []
        return seg.waypoints
          .filter((wp) => wp.distKm >= localFrom && wp.distKm <= localTo)
          .map((wp) => ({ lat: wp.lat, lng: wp.lng, elevM: wp.ele ?? undefined }))
      })

      const elevationGainM = rangeWaypoints.length > 1
        ? Math.round(computeElevationGain(rangeWaypoints))
        : null

      const distanceKm = Math.max(0, poiKm - fromKm)
      const etaMin = Math.round((distanceKm / DEFAULT_SPEED_KMH) * 60)

      // ── OSM fallback data ─────────────────────────────────────────────────────
      const rawData = (poi as Poi & { rawData?: Record<string, string> }).rawData
      const osmPhone = rawData?.phone ?? rawData?.['contact:phone'] ?? null
      const osmWebsite = rawData?.website ?? rawData?.['contact:website'] ?? null

      const displayPhone = details?.phone ?? osmPhone
      const displayWebsite = details?.website ?? osmWebsite

      // ── Booking deep links ────────────────────────────────────────────────────
      const isAccommodation = ACCOMMODATION_CATEGORIES.includes(poi.category)

      const bookingUrl = `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(poi.name)}`
      const hotelsUrl  = `https://www.hotels.com/search.html?q-destination=${encodeURIComponent(poi.name)}`

      const handleBookingClick = (platform: 'booking_com' | 'hotels_com') => {
        // Fire-and-forget analytics — do NOT await
        trackBookingClick(poi.externalId, platform)
      }

      return (
        <Sheet open={isOpen} onOpenChange={(open) => { if (!open) setSelectedPoi(null) }}>
          <SheetContent side="bottom" className="rounded-t-2xl max-h-[70vh] overflow-y-auto">
            <SheetHeader className="text-left pb-2">
              <div className="flex items-center gap-2">
                <span className="text-2xl" aria-hidden="true">{LAYER_ICONS[layer]}</span>
                <SheetTitle className="text-base font-semibold leading-tight">
                  {poi.name}
                </SheetTitle>
              </div>
            </SheetHeader>

            {/* ── Stats ── */}
            <div className="grid grid-cols-2 gap-2 py-3 border-y border-zinc-100 dark:border-zinc-800">
              <StatItem label="Sur la trace" value={`km ${poiKm.toFixed(1)}`} />
              <StatItem
                label="Distance trace"
                value={
                  poi.distFromTraceM < 1000
                    ? `${Math.round(poi.distFromTraceM)} m`
                    : `${(poi.distFromTraceM / 1000).toFixed(1)} km`
                }
              />
              {elevationGainM !== null && (
                <StatItem label="D+ depuis km actuel" value={`↑ ${elevationGainM} m`} />
              )}
              <StatItem
                label="Temps estimé"
                value={`~${etaMin} min`}
                hint={`(à ${DEFAULT_SPEED_KMH} km/h)`}
              />
            </div>

            {/* ── Google enrichment (progressive) ── */}
            {detailsPending ? (
              <div className="py-3 space-y-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-36" />
              </div>
            ) : details ? (
              <div className="py-3 space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                {details.rating !== null && (
                  <p>⭐ {details.rating.toFixed(1)} / 5</p>
                )}
                {details.isOpenNow !== null && (
                  <p className={details.isOpenNow ? 'text-green-600' : 'text-red-500'}>
                    {details.isOpenNow ? '✓ Ouvert maintenant' : '✗ Fermé'}
                  </p>
                )}
                {details.formattedAddress && (
                  <p className="text-xs">{details.formattedAddress}</p>
                )}
              </div>
            ) : null}

            {/* ── Contact ── */}
            {(displayPhone || displayWebsite) && (
              <div className="py-2 space-y-1 text-sm">
                {displayPhone && (
                  <a href={`tel:${displayPhone}`} className="flex items-center gap-2 text-blue-600 dark:text-blue-400">
                    <span aria-hidden="true">📞</span> {displayPhone}
                  </a>
                )}
                {displayWebsite && (
                  <a
                    href={displayWebsite}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-blue-600 dark:text-blue-400 text-xs truncate"
                  >
                    <span aria-hidden="true">🌐</span> {displayWebsite}
                  </a>
                )}
              </div>
            )}

            {/* ── Booking deep links (accommodations only) ── */}
            {isAccommodation && (
              <div className="pt-3 space-y-2">
                <p className="text-[10px] text-zinc-400 text-right">Lien partenaire</p>
                <a
                  href={bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => handleBookingClick('booking_com')}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium hover:bg-blue-700"
                >
                  Rechercher sur Booking.com
                </a>
                <a
                  href={hotelsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => handleBookingClick('hotels_com')}
                  className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-zinc-300 dark:border-zinc-600 text-sm font-medium hover:bg-zinc-50 dark:hover:bg-zinc-800"
                >
                  Rechercher sur Hotels.com
                </a>
              </div>
            )}
          </SheetContent>
        </Sheet>
      )
    }

    // ── Helpers ──────────────────────────────────────────────────────────────────

    function StatItem({ label, value, hint }: { label: string; value: string; hint?: string }) {
      return (
        <div>
          <p className="text-[10px] text-zinc-400 uppercase tracking-wide">{label}</p>
          <p className="text-sm font-semibold text-zinc-800 dark:text-zinc-200">
            {value}
            {hint && <span className="text-xs font-normal text-zinc-400 ml-1">{hint}</span>}
          </p>
        </div>
      )
    }
    ```
    ⚠️ `computeElevationGain` from `@ridenrest/gpx` takes `GpxPoint[]` (with `elevM?`). The conversion from `MapWaypoint` (which has `ele?: number | null`) is done inline: `.map((wp) => ({ lat: wp.lat, lng: wp.lng, elevM: wp.ele ?? undefined }))`. If `ele` is `null`, it becomes `undefined` which `computeElevationGain` handles gracefully (skips those points).
    ⚠️ `poi.rawData` is typed as `Record<string, unknown>` in `Poi` — cast to `Record<string, string>` locally for OSM tag access. This is acceptable since OSM rawData is always string values.

- [ ] Task 9 — Wire POI pin click to open `<PoiDetailSheet />` (AC: #1)
  - [ ] 9.1 Update `apps/web/src/hooks/use-poi-layers.ts` — add click handler on unclustered points:
    ```typescript
    // In usePoiLayers, inside the source creation block, after adding the pointLayerId layer:
    import { useUIStore } from '@/stores/ui.store'

    // Get setSelectedPoi inside the hook
    const { setSelectedPoi } = useUIStore.getState()  // Use getState() for event handler (not reactive)

    // POI pin click → open detail sheet
    map.on('click', pointLayerId, (e) => {
      if (!e.features || e.features.length === 0) return
      const props = e.features[0].properties as { id: string }
      setSelectedPoi(props.id)
      e.preventDefault()  // Prevent map click-through
    })

    map.on('mouseenter', pointLayerId, () => { map.getCanvas().style.cursor = 'pointer' })
    map.on('mouseleave', pointLayerId, () => { map.getCanvas().style.cursor = '' })
    ```
    ⚠️ Use `useUIStore.getState()` (not the hook) inside MapLibre event handlers — these run outside React's render cycle and calling the hook would violate Rules of Hooks. `.getState()` gives direct Zustand access without React reactivity.
    ⚠️ The `poi.id` stored in GeoJSON feature properties is the full Poi `id` field (e.g., `"overpass-12345678"`). The `externalId` is the raw Overpass node ID (`"12345678"`). Ensure the GeoJSON properties include BOTH:
    ```typescript
    // In usePoiLayers feature mapping:
    properties: { id: poi.id, externalId: poi.externalId, name: poi.name, category: poi.category },
    ```

  - [ ] 9.2 Update GeoJSON feature properties in `apps/web/src/hooks/use-poi-layers.ts` to include `externalId`:
    ```typescript
    // Update feature mapping (currently only has id, name, category):
    const features: GeoJSON.Feature[] = pois.map((poi) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [poi.lng, poi.lat] },
      properties: {
        id: poi.id,
        externalId: poi.externalId,  // ADD THIS — needed by PoiDetailSheet
        name: poi.name,
        category: poi.category,
      },
    }))
    ```

- [ ] Task 10 — Integrate `<PoiDetailSheet />` in `map-view.tsx` (AC: #1–#6)
  - [ ] 10.1 Update `apps/web/src/app/(app)/map/[id]/_components/map-view.tsx`:
    ```tsx
    // Add imports:
    import { PoiDetailSheet } from './poi-detail-sheet'
    import { useUIStore } from '@/stores/ui.store'

    // Inside MapView component:
    const { selectedPoiId } = useUIStore()

    // Find the selected POI from poisByLayer (already loaded in memory — no extra fetch)
    const allPois = Object.values(poisByLayer).flat()
    const selectedPoi = selectedPoiId
      ? allPois.find((p) => p.id === selectedPoiId) ?? null
      : null

    // Find which segment contains the selected POI (for Google Details lookup)
    const selectedSegmentId = selectedPoi
      ? readySegments.find((seg) => {
          const segStart = seg.cumulativeStartKm
          const segEnd = segStart + seg.distanceKm
          return selectedPoi.distAlongRouteKm >= segStart && selectedPoi.distAlongRouteKm <= segEnd
        })?.id ?? null
      : null

    // Add to JSX (outside the map div, at the root level of the return):
    return (
      <div className="relative flex h-full w-full">
        {/* ... existing map + POI list ... */}

        <PoiDetailSheet
          poi={selectedPoi}
          segments={readySegments}
          segmentId={selectedSegmentId}
        />
      </div>
    )
    ```

- [ ] Task 11 — Frontend tests (Vitest)
  - [ ] 11.1 Create `apps/web/src/app/(app)/map/[id]/_components/poi-detail-sheet.test.tsx`:
    - Does not render when `poi=null`
    - Renders POI name and category icon
    - Shows `km X.X` on-trace value
    - Shows distance from trace in meters when < 1km
    - Shows D+ when elevation data available (`elevM` on waypoints)
    - Shows `~X min` ETA with "(à 15 km/h)" hint
    - Shows booking buttons for accommodation POI
    - Does NOT show booking buttons for restaurant POI
    - Shows "Lien partenaire" label when booking buttons visible
    - Booking link `href` contains POI name encoded
    - `trackBookingClick` called on booking button click (mock via `vi.mock('@/lib/api-client')`)
    - Shows `<Skeleton />` when `detailsPending=true`
    - Shows rating and openNow status when `details` loaded
    - `setSelectedPoi(null)` called when Sheet closed
    - OSM rawData phone/website shown when Google details not available
    - Google details phone/website takes precedence over OSM rawData
  - [ ] 11.2 Update `apps/web/src/hooks/use-poi-layers.test.ts`:
    - `map.on('click', pointLayerId, ...)` registered for each visible layer
    - Simulated click calls `useUIStore.getState().setSelectedPoi` with correct POI id
    - Feature properties include `externalId` (new field from Task 9.2)
  - [ ] 11.3 Create `apps/web/src/hooks/use-poi-google-details.test.ts`:
    - Returns `{ details: null, isPending: false }` when `externalId=null`
    - Returns `{ details: null, isPending: false }` when `segmentId=null`
    - Fires query when both provided
    - `retry: false` — no automatic retry on error
    - `staleTime` = 7 days (verify with `queryClient.getQueryState`)

---

## Dev Notes

### CRITICAL: What's Already Done (Stories 4.1–4.3) — Do NOT Redo

**`apps/api/src/pois/` — existing infrastructure:**
- ✅ `GooglePlacesProvider` with `searchPlaceIds()`, `searchLayerPlaceIds()` — story 4.3
- ✅ `PoisService` with `getGooglePlaceIds()`, `prefetchGooglePlaceIds()` — story 4.3
- ✅ `GET /pois/google-ids` endpoint — story 4.3 (for corridor-level pre-cache)
- ✅ `RedisProvider`, `OverpassProvider`, `PoisRepository` — stories 4.2, 4.3
- ✅ Redis keys: `google_place_ids:{segmentId}:{fromKm}:{toKm}:{layer}` — story 4.3 pre-cache
- ✅ `accommodations_cache` table — has `name, lat, lng, externalId` for lookup

**`apps/web/` — existing infrastructure:**
- ✅ `useUIStore` — `selectedPoiId: string | null`, `setSelectedPoi()` already defined
- ✅ `useMapStore` — `fromKm, toKm` for D+ range computation
- ✅ `usePoiLayers` — manages MapLibre POI layers, click handlers to add (Task 9)
- ✅ `poisByLayer` in `map-view.tsx` — all POIs already in memory, no extra fetch needed
- ✅ shadcn `<Sheet />` — verify at `apps/web/src/components/ui/sheet.tsx`
- ✅ `computeElevationGain(points: GpxPoint[])` from `@ridenrest/gpx` — exists in `packages/gpx/src/parser.ts`
- ✅ `LAYER_CATEGORIES` from `@ridenrest/shared` — for accommodation check

**What does NOT exist yet:**
- ❌ `GooglePlacesProvider.getPlaceDetails()` — add to existing provider
- ❌ `GooglePlacesProvider.findPlaceId()` — add to existing provider
- ❌ `GET /pois/google-details` endpoint
- ❌ `POST /pois/booking-click` endpoint
- ❌ `PoisRepository.findByExternalId()`
- ❌ `<PoiDetailSheet />` component
- ❌ `usePoiGoogleDetails` hook
- ❌ `getPoiGoogleDetails()` in api-client.ts
- ❌ `trackBookingClick()` in api-client.ts
- ❌ POI pin click handler in `usePoiLayers`
- ❌ `externalId` in GeoJSON feature properties (update in Task 9.2)

---

### Architecture: Google Places — Two Tiers Used in This Story

| Operation | Tier | Cost | Usage |
|---|---|---|---|
| `findPlaceId()` (Text Search) | **IDs Only** → `places.id` | Unlimited, $0 | When corridor pre-cache missed — once per POI |
| `getPlaceDetails()` (Place Details) | **Essentials** → text fields | 10k/month free | Once per tap, cached 7 days |

**Field mask budget for Place Details:**
```
id, displayName, formattedAddress, rating,
regularOpeningHours.openNow, internationalPhoneNumber, websiteUri, types
```
All are Essentials fields = one "Place Details Essentials" call per unique POI tapped.

**Do NOT add** `photos` to the field mask — photo fetching requires a second `GET /v1/{name}/media` call per photo and would double the quota usage for no MVP value.

---

### Architecture: `computeElevationGain` — Type Mismatch Handling

The function signature: `computeElevationGain(points: GpxPoint[]): number`

`GpxPoint` type (from `packages/gpx/src/cumulative-distances.ts`):
```typescript
export interface GpxPoint {
  lat: number
  lng: number
  elevM?: number  // Optional elevation in meters
}
```

`MapWaypoint` type (from story 4.1):
```typescript
export interface MapWaypoint {
  lat: number
  lng: number
  ele?: number | null   // elevation in meters (nullable)
  distKm: number
}
```

Conversion in `<PoiDetailSheet />`:
```typescript
// MapWaypoint → GpxPoint
const gpxPoints = rangeWaypoints.map((wp) => ({
  lat: wp.lat,
  lng: wp.lng,
  elevM: wp.ele ?? undefined,  // null → undefined (GpxPoint accepts undefined, not null)
}))
const gainM = computeElevationGain(gpxPoints)
```

If all waypoints have `ele = null` (elevation not in GPX), `elevationGainM` will be 0. In the UI, show "↑ 0 m" or hide the stat entirely if 0. Hide if 0: `elevationGainM !== null && elevationGainM > 0 && <StatItem ... />`.

---

### Architecture: Booking Deep Links — No Affiliate for MVP

Per project decision (from memory): "Affiliés Booking.com refusés (early stage) → réappliquer quand trafic établi". Deep links work without affiliate codes:

```typescript
// Booking.com — search by name (works without affiliate)
`https://www.booking.com/searchresults.html?ss=${encodeURIComponent(poi.name)}`

// Hotels.com — search by destination name
`https://www.hotels.com/search.html?q-destination=${encodeURIComponent(poi.name)}`
```

The `"Lien partenaire"` label is shown as per AC #4, even without active affiliate codes. This prepares the UI for future affiliate integration (when approved, just add `?aid=XXXXX` to Booking.com and the equivalent for Hotels.com).

**IMPORTANT**: Never hardcode an affiliate ID that's not approved — this would violate the affiliate program terms.

---

### Architecture: `useUIStore.getState()` in MapLibre Event Handlers

MapLibre event handlers run outside React's render cycle. Using `useUIStore()` hook inside them would violate Rules of Hooks (hooks can only be called in React components/hooks). The solution:

```typescript
// ✅ Direct Zustand store access — not a hook, works anywhere
import { useUIStore } from '@/stores/ui.store'

map.on('click', layerId, (e) => {
  const { setSelectedPoi } = useUIStore.getState()  // Direct access
  setSelectedPoi(props.id)
})

// ❌ Would violate Rules of Hooks
map.on('click', layerId, (e) => {
  const { setSelectedPoi } = useUIStore()  // Hook inside event handler
  setSelectedPoi(props.id)
})
```

Zustand's `store.getState()` is always available as a static method on any store created with `create()`. It returns the current state snapshot (not reactive, but fine for event handlers that just need to dispatch an action).

---

### Architecture: Selected POI Lookup — No Extra Fetch

Story 4.4 avoids an additional API call for the base POI data. When a pin is clicked:
1. `selectedPoiId` is set in `useUIStore`
2. `map-view.tsx` already has `poisByLayer` (from `usePois` — all POIs in memory)
3. `allPois.find(p => p.id === selectedPoiId)` finds the full `Poi` object instantly
4. `<PoiDetailSheet />` receives the full `Poi` — no loading state needed for base data
5. Only Google enrichment is async (shows skeleton while loading)

This pattern avoids a `GET /pois/:id` endpoint entirely for the base detail view.

---

### Architecture: Segment ID for Google Details Lookup

The `externalId` is the Overpass node ID. The `segmentId` is needed to query `accommodations_cache` for the POI's lat/lng (since the same Overpass node could theoretically be cached for multiple segments).

Finding `segmentId` from `poi.distAlongRouteKm` in `map-view.tsx`:
```typescript
const selectedSegmentId = selectedPoi
  ? readySegments.find((seg) => {
      const segStart = seg.cumulativeStartKm
      const segEnd = segStart + seg.distanceKm
      return selectedPoi.distAlongRouteKm >= segStart &&
             selectedPoi.distAlongRouteKm <= segEnd
    })?.id ?? null
  : null
```

Edge case: POI exactly at segment boundary → found by first matching segment (correct behavior).

---

### Project Structure Notes

**Files to CREATE:**
```
packages/shared/src/types/google-place.types.ts

apps/web/src/app/(app)/map/[id]/_components/
  poi-detail-sheet.tsx
  poi-detail-sheet.test.tsx

apps/web/src/hooks/
  use-poi-google-details.ts
  use-poi-google-details.test.ts
```

**Files to MODIFY:**
```
apps/api/src/pois/providers/google-places.provider.ts  ← Add findPlaceId() + getPlaceDetails()
apps/api/src/pois/providers/google-places.provider.test.ts  ← New test cases
apps/api/src/pois/pois.service.ts                      ← Add getPoiGoogleDetails()
apps/api/src/pois/pois.service.test.ts                 ← New test cases
apps/api/src/pois/pois.repository.ts                   ← Add findByExternalId()
apps/api/src/pois/pois.controller.ts                   ← Add GET /pois/google-details + POST /pois/booking-click
packages/shared/src/index.ts                           ← Export GooglePlaceDetails
apps/web/src/lib/api-client.ts                         ← Add getPoiGoogleDetails() + trackBookingClick()
apps/web/src/hooks/use-poi-layers.ts                   ← Add click handlers + externalId in feature properties
apps/web/src/app/(app)/map/[id]/_components/map-view.tsx  ← Add PoiDetailSheet
```

**No DB migration required.** No new tables. Only Redis keys added:
- `google_place_id:{externalId}` → Google place_id string, TTL 7d
- `google_place_details:{placeId}` → JSON GooglePlaceDetails, TTL 7d

---

### Anti-Patterns to Avoid

```typescript
// ❌ Awaiting trackBookingClick in click handler (delays navigation)
onClick={async () => { await trackBookingClick(...); window.open(url) }}
// ✅ Fire-and-forget — let the link open immediately
onClick={() => { trackBookingClick(...) }}  // void return, no await

// ❌ Using useUIStore() hook inside MapLibre event handler
map.on('click', id, () => { const { setSelectedPoi } = useUIStore() })
// ✅ Use .getState() for non-React contexts
map.on('click', id, () => { const { setSelectedPoi } = useUIStore.getState() })

// ❌ Adding 'photos' to Place Details field mask
'X-Goog-FieldMask': 'id,displayName,rating,photos'  // → extra cost per request
// ✅ Text fields only for story 4.4
'X-Goog-FieldMask': 'id,displayName,formattedAddress,rating,...'

// ❌ Fetching the POI again from API to show in the sheet
const { data: poi } = useQuery({ queryKey: ['pois', id], queryFn: () => getPoi(id) })
// ✅ Find from already-loaded poisByLayer (already in memory)
const poi = allPois.find(p => p.id === selectedPoiId)

// ❌ Hardcoding affiliate ID that hasn't been approved
`https://www.booking.com/searchresults.html?ss=${name}&aid=12345`
// ✅ No affiliate params until program approved
`https://www.booking.com/searchresults.html?ss=${encodeURIComponent(name)}`

// ❌ Passing [lat, lng] to MapLibre GeoJSON (wrong order)
coordinates: [poi.lat, poi.lng]
// ✅ GeoJSON always [lng, lat]
coordinates: [poi.lng, poi.lat]

// ❌ Not encoding POI name in booking URL
`https://www.booking.com/searchresults.html?ss=${poi.name}`
// ✅ Always encode URI components
`https://www.booking.com/searchresults.html?ss=${encodeURIComponent(poi.name)}`
```

---

### References

- [Source: _bmad-output/planning-artifacts/epics.md — Epic 4, Story 4.4 ACs: FR-032, FR-033, FR-060, FR-061, FR-062, FR-080, FR-081, NFR-045]
- [Source: _bmad-output/project-context.md — RGPD: GPS position NEVER sent to server (POI coords are public OSM data — different rule)]
- [Source: _bmad-output/planning-artifacts/architecture.md — POI detail sheet: poi-detail-sheet.tsx in _components/]
- [Source: packages/gpx/src/parser.ts — computeElevationGain(points: GpxPoint[]): number]
- [Source: packages/gpx/src/index.ts — confirms computeElevationGain exported from @ridenrest/gpx]
- [Source: apps/web/src/stores/ui.store.ts — selectedPoiId, setSelectedPoi() already defined]
- [Source: apps/web/src/stores/map.store.ts — fromKm for D+ range start]
- [Source: _bmad-output/implementation-artifacts/4-3-corridor-search-poi-discovery-by-km-range.md — GooglePlacesProvider existing methods, Redis cache keys]
- [Source: _bmad-output/implementation-artifacts/4-2-poi-layer-toggles-pin-display.md — usePoiLayers hook structure, feature properties, useUIStore.getState() pattern]
- [Project memory — "Deep links paramétrés sans affilié : Booking.com, Hotels.com, Airbnb (fonctionnent sans programme)"]
- [Project memory — "Affiliés Booking.com refusés (early stage) → réappliquer quand trafic établi"]
- [Google Places API (New) pricing — Place Details Essentials: 10k/month free for text fields]

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

### File List
