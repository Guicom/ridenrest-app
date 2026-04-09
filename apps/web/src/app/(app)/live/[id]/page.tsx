'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { snapToTrace, computeElevationGain, computeElevationLoss } from '@ridenrest/gpx'
import type { KmWaypoint } from '@ridenrest/gpx'
import { useLiveMode } from '@/hooks/use-live-mode'
import { useLivePoisSearch } from '@/hooks/use-live-poi-search'
import { useNetworkStatus } from '@/hooks/use-network-status'
import { useLiveWeather } from '@/hooks/use-live-weather'
import { useDensity } from '@/hooks/use-density'
import { useLiveStore } from '@/stores/live.store'
import { useMapStore } from '@/stores/map.store'
import { useUIStore } from '@/stores/ui.store'
import { getAdventureMapData, getAdventure } from '@/lib/api-client'
import { LAYER_CATEGORIES } from '@ridenrest/shared'
import { useAdventureWaypoints } from '@/hooks/use-adventure-waypoints'
import { useReverseCity } from '@/hooks/use-reverse-city'
import { useStages } from '@/hooks/use-stages'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog'
import { LiveMapCanvas } from './_components/live-map-canvas'
import type { LiveMapCanvasHandle } from './_components/live-map-canvas'
import { GeolocationConsent } from './_components/geolocation-consent'
import { LiveControls } from './_components/live-controls'
import { LiveFiltersDrawer } from './_components/live-filters-drawer'
import { Undo2, ChevronUp, ChevronDown, LocateFixed } from 'lucide-react'
import { getCorridorCenter } from '@/lib/booking-url'
import { Badge } from '@/components/ui/badge'
import { ACCOMMODATION_SUB_TYPES } from '@/app/(app)/map/[id]/_components/accommodation-sub-types'
import { NoResultsSubTypeBanner } from '@/app/(app)/map/[id]/_components/no-results-sub-type-banner'
import { MapStylePicker } from '@/app/(app)/map/[id]/_components/map-style-picker'
import { MapSearchOverlay } from '@/app/(app)/map/[id]/_components/map-search-overlay'
import { ResetZoomButton } from '@/app/(app)/map/[id]/_components/reset-zoom-button'
import { StatusBanner } from './_components/status-banner'
import { PoiPopup } from '../../map/[id]/_components/poi-popup'
import { ElevationStrip } from './_components/elevation-strip'
import { ElevationProfile } from '../../map/[id]/_components/elevation-profile'
import { trackPoiSearchTriggered } from '@/lib/analytics'

const DEFAULT_RADIUS = 5

export default function LivePage() {
  const { id: adventureId } = useParams<{ id: string }>()
  const router = useRouter()
  const {
    isLiveModeActive,
    hasConsented,
    permissionDenied,
    startWatching,
    stopWatching,
    grantConsent,
  } = useLiveMode()

  const [filtersOpen, setFiltersOpen] = useState(false)
  const [searchTrigger, setSearchTrigger] = useState(0)
  const [elevationCollapsed, setElevationCollapsed] = useState(false)
  const [stageLongPressStageId, setStageLongPressStageId] = useState<string | null>(null)

  const handleQuitRequest = () => {
    stopWatching()
    router.push('/adventures')
  }

  const [mounted, setMounted] = useState(false)
  const [showConsent, setShowConsent] = useState(false)

  const { data: adventure } = useQuery({
    queryKey: ['adventures', adventureId],
    queryFn: () => getAdventure(adventureId),
    staleTime: 30_000,
  })

  const { data: mapData, isPending } = useQuery({
    queryKey: ['adventures', adventureId, 'map'],
    queryFn: () => getAdventureMapData(adventureId),
  })

  const segments = mapData?.segments ?? []
  const firstSegment = segments[0]
  const segmentId = firstSegment?.id

  // Elevation strip data
  const readySegments = segments.filter((s) => s.parseStatus === 'done')
  const allCumulativeWaypoints = useAdventureWaypoints(readySegments)

  // Density
  const { coverageGaps, densityStatus } = useDensity(adventureId)

  // Network status
  const { isOnline } = useNetworkStatus()

  // Live POI search
  const { pois, hasFetched: poisHasFetched, isFetching: poisFetching, targetKm, isError: poisError, refetch: refetchPois, canSearch } = useLivePoisSearch(segmentId)

  // Always-current ref to refetchPois — queryKey changes when store state changes (radius, targetKm),
  // so we must call the *latest* refetch (post-re-render) to avoid fetching with a stale key.
  const liveMapCanvasRef = useRef<LiveMapCanvasHandle>(null)
  const refetchPoisRef = useRef(refetchPois)
  useLayoutEffect(() => { refetchPoisRef.current = refetchPois }, [refetchPois])
  const canSearchRef = useRef(canSearch)
  useLayoutEffect(() => { canSearchRef.current = canSearch }, [canSearch])

  // Stable search handler — deferred to ensure React has re-rendered with latest store state
  const handleSearch = useCallback(() => {
    setSearchTrigger((v) => v + 1)
    setTimeout(() => {
      if (!canSearchRef.current) return
      void refetchPoisRef.current()
    }, 0)
  }, [])

  // Banner state
  const showOfflineBanner = !isOnline && isLiveModeActive
  const showErrorBanner = isOnline && poisError && isLiveModeActive && !poisFetching
  const showNoResultsBanner = isLiveModeActive && !poisFetching && !poisError && poisHasFetched && pois.length === 0

  // Stages for live map layer + updateStage mutation
  const { stages, updateStage: updateStageMutation } = useStages(adventureId)

  // Live weather — data still fetched for map layer (toggle removed)
  const weatherDepartureTime = useLiveStore((s) => s.weatherDepartureTime)
  const { weatherPoints, isPending: weatherPending } = useLiveWeather(segmentId, {
    departureTime: weatherDepartureTime ?? undefined,
  })

  // POI detail sheet — find selected POI from live results
  const selectedPoiId = useUIStore((s) => s.selectedPoiId)
  const selectedPoi = pois.find((p) => p.id === selectedPoiId) ?? null

  // Active filter count for badge
  const mapVisibleLayers = useMapStore((s) => s.visibleLayers)
  const activeAccommodationTypes = useMapStore((s) => s.activeAccommodationTypes)
  const mapWeatherActive = useMapStore((s) => s.weatherActive)
  const mapWeatherDimension = useMapStore((s) => s.weatherDimension)
  const mapDensityColorEnabled = useMapStore((s) => s.densityColorEnabled)
  const liveSearchRadiusKm = useLiveStore((s) => s.searchRadiusKm)
  const stageLayerActive = useLiveStore((s) => s.stageLayerActive)
  const gpsTrackingActive = useLiveStore((s) => s.gpsTrackingActive)
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (!mapVisibleLayers.has('accommodations')) count++
    if (mapVisibleLayers.has('restaurants')) count++
    if (mapVisibleLayers.has('supplies')) count++
    if (mapVisibleLayers.has('bike')) count++
    if (mapWeatherActive) count++
    if (mapDensityColorEnabled) count++
    if (liveSearchRadiusKm !== DEFAULT_RADIUS) count++
    if (stageLayerActive) count++
    return count
  }, [mapVisibleLayers, mapWeatherActive, mapDensityColorEnabled, liveSearchRadiusKm, stageLayerActive])

  // Filter accommodation pois once — memoized to avoid new reference on every render (GPS poll)
  const accommodationPois = useMemo(
    () => pois.filter((p) => (LAYER_CATEGORIES.accommodations as readonly string[]).includes(p.category)),
    [pois],
  )

  // Detect "filter empty" for accommodations in live mode (Story 16.17, AC-4)
  // In live mode, API already filters by activeAccommodationTypes, so we can't compute exact alternative counts.
  // Detect: pois exist (other layers) but no accommodation pois, and not all acc types are selected.
  const allAccommodationTypes = LAYER_CATEGORIES.accommodations as readonly string[]
  const hasLiveUnfilteredResults = isLiveModeActive && !poisFetching && poisHasFetched
    && mapVisibleLayers.has('accommodations')
    && accommodationPois.length === 0
    && activeAccommodationTypes.size < allAccommodationTypes.length
  const liveActiveTypeLabels = useMemo(
    () => ACCOMMODATION_SUB_TYPES.filter(({ type }) => activeAccommodationTypes.has(type)).map(({ label }) => label.toLowerCase()),
    [activeAccommodationTypes],
  )
  // In live mode, we don't know the alternative counts — show non-selected types as available
  const liveAlternatives = useMemo(() => {
    if (!hasLiveUnfilteredResults) return []
    return ACCOMMODATION_SUB_TYPES
      .filter(({ type }) => !activeAccommodationTypes.has(type))
      .map(({ label }) => ({ label: label.toLowerCase(), count: 0 }))
  }, [hasLiveUnfilteredResults, activeAccommodationTypes])

  // Center point for the Rechercher sur dropdown (Booking/Airbnb) in LiveControls
  // Available as soon as live mode is active and the slider position is known — no search required
  const liveSearchCenter = useMemo(() => {
    if (!isLiveModeActive || targetKm === null || allCumulativeWaypoints.length === 0) return null
    return getCorridorCenter(allCumulativeWaypoints, targetKm)
  }, [isLiveModeActive, targetKm, allCumulativeWaypoints])

  // Reverse geocoding for Booking.com city-based search
  const { city: liveCity, postcode: livePostcode, state: liveState, country: liveCountry } = useReverseCity(isLiveModeActive ? liveSearchCenter : null)

  // Live context for PoiDetailSheet (D+/ETA with live mode values)
  const currentKmOnRoute = useLiveStore((s) => s.currentKmOnRoute)
  const speedKmh = useLiveStore((s) => s.speedKmh)
  const targetAheadKm = useLiveStore((s) => s.targetAheadKm)

  // Elevation strip positions
  const elevationCurrentDistKm = currentKmOnRoute
  const elevationTargetDistKm = currentKmOnRoute !== null ? currentKmOnRoute + targetAheadKm : null
  // Dynamic slider max — remaining distance on trace (Story 16.20)
  const maxAheadKm = useMemo(() => {
    if (currentKmOnRoute === null || allCumulativeWaypoints.length === 0) return undefined
    const totalDistKm = allCumulativeWaypoints[allCumulativeWaypoints.length - 1].distKm
    const remaining = totalDistKm - currentKmOnRoute
    return Math.ceil(remaining)
  }, [currentKmOnRoute, allCumulativeWaypoints])

  // D+ / D- computation for LiveControls
  const elevationSlice = useMemo(() => {
    if (currentKmOnRoute === null || allCumulativeWaypoints.length === 0) return null
    const targetDistKm = currentKmOnRoute + targetAheadKm
    const slice = allCumulativeWaypoints.filter(
      (wp) => wp.distKm >= currentKmOnRoute && wp.distKm <= targetDistKm,
    )
    if (slice.length < 2) return null
    const gpxPoints = slice.map((wp) => ({ lat: wp.lat, lng: wp.lng, elevM: wp.ele ?? undefined }))
    return { gain: computeElevationGain(gpxPoints), loss: computeElevationLoss(gpxPoints) }
  }, [allCumulativeWaypoints, currentKmOnRoute, targetAheadKm])
  const elevationGain = elevationSlice?.gain ?? null
  const elevationLoss = elevationSlice?.loss ?? null

  // Convert MapWaypoint[] → KmWaypoint[] for snapToTrace
  const kmWaypoints: KmWaypoint[] = useMemo(
    () => (firstSegment?.waypoints ?? []).map((wp) => ({ lat: wp.lat, lng: wp.lng, km: wp.distKm })),
    [firstSegment?.waypoints],
  )

  // Snap GPS position to trace → compute currentKmOnRoute
  const currentPosition = useLiveStore((s) => s.currentPosition)
  const setCurrentKm = useLiveStore((s) => s.setCurrentKm)

  useEffect(() => {
    if (!currentPosition || kmWaypoints.length === 0) return
    const snap = snapToTrace(currentPosition, kmWaypoints)
    if (snap) {
      setCurrentKm(snap.kmAlongRoute)
    }
  }, [currentPosition, kmWaypoints, setCurrentKm])

  // Auto-zoom to search zone after live POI search completes (Story 16.15, AC #4, #5, #6)
  // Two paths: cold cache (poisFetching true→false) and warm cache (searchTrigger increments while !poisFetching)
  const prevPoisFetchingRef = useRef(false)
  const prevSearchTriggerRef = useRef(0)
  useEffect(() => {
    const justResolved = prevPoisFetchingRef.current && !poisFetching
    const justSearched = searchTrigger > 0 && searchTrigger !== prevSearchTriggerRef.current && !poisFetching && poisHasFetched

    // justResolved: fetch completed (success or error) → zoom regardless of poisHasFetched
    // justSearched: warm cache (poisHasFetched already required in justSearched definition)
    if ((justResolved || justSearched) && isLiveModeActive) {
      const targetKmValue = targetKm ?? 0
      liveMapCanvasRef.current?.fitToSearchZone(
        targetKmValue,
        liveSearchRadiusKm,
        segments,
        allCumulativeWaypoints,
      )
      // Track POI search completion — live mode (AC #3, Story 15.3)
      // Only track successful searches — errors would report stale result_count
      if (!poisError) {
        trackPoiSearchTriggered({
          mode: 'live',
          poi_categories: [...mapVisibleLayers],
          result_count: pois.length,
        })
      }
    }
    prevPoisFetchingRef.current = poisFetching
    prevSearchTriggerRef.current = searchTrigger
    return () => {
      prevPoisFetchingRef.current = false
      prevSearchTriggerRef.current = 0
    }
  }, [poisFetching, poisHasFetched, isLiveModeActive, searchTrigger])
  // Note: targetKm, liveSearchRadiusKm, segments, allCumulativeWaypoints intentionally excluded
  // (refs or stable-during-search values — same pattern as map-view.tsx)

  // Hydration-safe: defer client-only rendering until after mount
  useEffect(() => {
    setMounted(true)
  }, [])

  // On mount: if already consented, start watching immediately (AC #5)
  useEffect(() => {
    if (!mounted) return
    if (hasConsented) {
      startWatching()
    } else {
      setShowConsent(true)
    }
  }, [mounted, hasConsented, startWatching])

  const handleConsent = () => {
    setShowConsent(false)
    grantConsent()
  }

  const handleDismiss = () => {
    setShowConsent(false)
  }

  return (
    <div className="flex h-dvh w-full overflow-hidden">
      {/* Map area + elevation profile */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
      {/* Map canvas area */}
      <div className="relative flex-1 min-h-0">
        {/* Map canvas — z-0 */}
        <LiveMapCanvas
          ref={liveMapCanvasRef}
          adventureId={adventureId}
          segments={segments}
          targetKm={targetKm}
          searchRadiusKm={liveSearchRadiusKm}
          pois={pois}
          weatherPoints={weatherPoints}
          weatherDimension={mapWeatherDimension}
          weatherActive={mapWeatherActive}
          stages={stages}
          stageLayerActive={stageLayerActive}
          currentKmOnRoute={currentKmOnRoute}
          onStageLongPress={setStageLongPressStageId}
          coverageGaps={coverageGaps}
          densityStatus={densityStatus}
        />

        {/* POI popup — floating above the clicked pin */}
        {selectedPoi && liveMapCanvasRef.current?.getMap() && (
          <PoiPopup
            poi={selectedPoi}
            segments={segments}
            segmentId={segmentId ?? null}
            map={liveMapCanvasRef.current.getMap()!}
            onClose={() => {
              useUIStore.getState().setSelectedPoi(null)
              useMapStore.getState().setSelectedPoiId(null)
            }}
            liveContext={isLiveModeActive && currentKmOnRoute !== null ? { currentKmOnRoute, speedKmh } : undefined}
          />
        )}

        {/* Quitter le live + Live badge — top left z-40 */}
        <div className="absolute top-4 left-4 z-40 flex items-center gap-2">
          <button
            data-testid="quit-live-btn"
            onClick={handleQuitRequest}
            aria-label="Quitter le live"
            className="inline-flex items-center justify-center rounded-md bg-background/80 p-2 text-foreground backdrop-blur-sm hover:bg-background/90 border border-[--border]"
          >
            <Undo2 className="h-5 w-5" />
          </button>
          <Badge
            variant="outline"
            className="bg-green-500/10 text-green-600 border-green-500/20 text-xs font-medium"
          >
            Live
          </Badge>
          {readySegments.some((s) => s.source === 'strava') && (
            <img src="/powered-by-strava.svg" alt="Powered by Strava" className="h-4" />
          )}
        </div>

        {/* Consent modal — z-60 */}
        <GeolocationConsent
          open={showConsent && !hasConsented}
          onConsent={handleConsent}
          onDismiss={handleDismiss}
        />

        {/* Status banners — z-30, above LiveControls */}
        {mounted && showOfflineBanner && (
          <StatusBanner variant="offline" message="Mode hors ligne — données non disponibles" />
        )}
        {mounted && showErrorBanner && !showOfflineBanner && (
          <StatusBanner
            variant="error"
            message={`Connexion instable — ${pois.length} résultat${pois.length !== 1 ? 's' : ''} chargé${pois.length !== 1 ? 's' : ''}`}
          />
        )}
        {/* Contextual sub-type filter banner — live mode (Story 16.17, AC-4) */}
        {mounted && hasLiveUnfilteredResults && liveAlternatives.length > 0 && !showOfflineBanner && !showErrorBanner && (
          <NoResultsSubTypeBanner
            activeTypeLabels={liveActiveTypeLabels}
            alternatives={liveAlternatives}
            onResetFilters={() => {
              useMapStore.getState().resetAccommodationTypes()
              handleSearch()
            }}
            className="absolute top-16 left-1/2 -translate-x-1/2 z-40"
          />
        )}
        {mounted && showNoResultsBanner && !hasLiveUnfilteredResults && !showOfflineBanner && !showErrorBanner && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 z-40 whitespace-nowrap rounded-lg bg-orange-500/90 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm">
            Aucun résultat dans cette zone
          </div>
        )}

        {/* Bottom overlay — z-30 (only render after mount to avoid hydration mismatch) */}
        {mounted && (
          <>
            {isLiveModeActive && allCumulativeWaypoints.length > 0 && (
              <div className="lg:hidden absolute bottom-[88px] left-0 right-0 z-20 h-[60px] bg-background/80 backdrop-blur-sm border-t border-[--border]">
                <ElevationStrip
                  waypoints={allCumulativeWaypoints}
                  segments={readySegments}
                  currentDistKm={elevationCurrentDistKm}
                  targetDistKm={elevationTargetDistKm}
                />
              </div>
            )}

            {isLiveModeActive && (
              <LiveControls
                onFiltersOpen={() => setFiltersOpen(true)}
                onSearch={handleSearch}
                activeFilterCount={activeFilterCount}
                elevationGain={elevationGain}
                elevationLoss={elevationLoss}
                center={liveSearchCenter}
                city={liveCity}
                postcode={livePostcode}
                adminArea={liveState}
                country={liveCountry}
                maxAheadKm={maxAheadKm}
              />
            )}

            {!isLiveModeActive && (
              <div className="absolute bottom-8 left-0 right-0 z-30 flex justify-center">
                {permissionDenied && (
                  <div className="rounded-lg bg-destructive/90 px-4 py-2 text-sm text-destructive-foreground">
                    Géolocalisation refusée — activez-la dans les paramètres de votre navigateur
                  </div>
                )}

                {!permissionDenied && hasConsented && (
                  <Button
                    onClick={startWatching}
                    variant="destructive"
                    size="lg"
                  >
                    Activer le mode Live
                  </Button>
                )}

                {!permissionDenied && !hasConsented && !showConsent && (
                  <Button
                    onClick={() => setShowConsent(true)}
                    variant="destructive"
                    size="lg"
                  >
                    Activer le mode Live
                  </Button>
                )}
              </div>
            )}
          </>
        )}

        {isPending && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/50">
            <div className="text-sm text-muted-foreground">Chargement de l&apos;aventure…</div>
          </div>
        )}

        {/* POI search loading overlay (same as planning mode) */}
        <MapSearchOverlay visible={poisFetching && isLiveModeActive} />

        {/* Weather loading overlay */}
        <MapSearchOverlay visible={mapWeatherActive && weatherPending && isLiveModeActive} message="Chargement météo…" />

        {/* Reset zoom button — below style picker */}
        <div className="absolute top-14 right-4 z-10">
          <ResetZoomButton onClick={() => liveMapCanvasRef.current?.resetZoom()} />
        </div>

        {/* Center on GPS — only in live mode; highlighted when tracking is paused */}
        {isLiveModeActive && (
          <div className="absolute top-24 right-4 z-10">
            <button
              onClick={() => liveMapCanvasRef.current?.centerOnGps()}
              aria-label="Centrer sur ma position"
              data-testid="center-on-gps-btn"
              className={`flex h-10 w-10 items-center justify-center rounded-xl shadow-sm border transition-colors ${
                gpsTrackingActive
                  ? 'bg-white border-[--border] text-foreground hover:bg-white/90'
                  : 'bg-primary border-primary text-primary-foreground hover:bg-primary/90'
              }`}
            >
              <LocateFixed className="h-4 w-4" />
            </button>
          </div>
        )}

        {/* Map style selector — top-right (bottom-right hidden under LiveControls on mobile) */}
        <MapStylePicker className="top-4 right-4 bottom-auto" />
      </div>

      {/* Elevation profile — desktop only, same as planning mode */}
      <div className={`hidden lg:block relative shrink-0 border-t border-[--border] bg-background transition-all duration-200 ${elevationCollapsed ? 'h-0' : 'h-[180px]'}`}>
        <button
          onClick={() => setElevationCollapsed((v) => !v)}
          className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-background border border-[--border] shadow-sm text-muted-foreground hover:text-foreground"
          aria-label={elevationCollapsed ? "Afficher le profil d'élévation" : "Masquer le profil d'élévation"}
          data-testid="elevation-collapse-btn"
        >
          {elevationCollapsed ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </button>
        <ElevationProfile
          waypoints={allCumulativeWaypoints}
          segments={readySegments}
          className="h-full w-full"
        />
      </div>
      </div>

      {/* Live filters drawer — z-50 */}
      <LiveFiltersDrawer
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        accommodationPois={accommodationPois}
        onSearch={handleSearch}
        defaultSpeedKmh={adventure?.avgSpeedKmh}
        adventureId={adventureId}
        segments={readySegments}
      />

      {/* Stage position update confirmation modal */}
      {(() => {
        const pressedStage = stages.find((s) => s.id === stageLongPressStageId)
        if (!pressedStage) return null
        return (
          <Dialog
            open={stageLongPressStageId !== null}
            onOpenChange={(open) => { if (!open) setStageLongPressStageId(null) }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Mettre à jour l&apos;étape</DialogTitle>
                <DialogDescription>
                  {`Mettre à jour la fin de « ${pressedStage.name} » à votre position actuelle${currentKmOnRoute !== null ? ` (${currentKmOnRoute.toFixed(1)} km)` : ''} ?`}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setStageLongPressStageId(null)}
                  data-testid="stage-update-cancel-btn"
                >
                  Annuler
                </Button>
                <Button
                  size="lg"
                  disabled={currentKmOnRoute === null}
                  onClick={async () => {
                    await updateStageMutation(pressedStage.id, { endKm: currentKmOnRoute! })
                    setStageLongPressStageId(null)
                  }}
                  data-testid="stage-update-confirm-btn"
                >
                  Mettre à jour
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )
      })()}
    </div>
  )
}
