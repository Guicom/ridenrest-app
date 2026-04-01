'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { snapToTrace, computeElevationGain } from '@ridenrest/gpx'
import type { KmWaypoint } from '@ridenrest/gpx'
import { useLiveMode } from '@/hooks/use-live-mode'
import { useLivePoisSearch } from '@/hooks/use-live-poi-search'
import { useNetworkStatus } from '@/hooks/use-network-status'
import { useLiveWeather } from '@/hooks/use-live-weather'
import { useLiveStore } from '@/stores/live.store'
import { useMapStore } from '@/stores/map.store'
import { useUIStore } from '@/stores/ui.store'
import { getAdventureMapData } from '@/lib/api-client'
import { LAYER_CATEGORIES } from '@ridenrest/shared'
import { useAdventureWaypoints } from '@/hooks/use-adventure-waypoints'
import { Button } from '@/components/ui/button'
import { LiveMapCanvas } from './_components/live-map-canvas'
import type { LiveMapCanvasHandle } from './_components/live-map-canvas'
import { GeolocationConsent } from './_components/geolocation-consent'
import { LiveControls } from './_components/live-controls'
import { LiveFiltersDrawer } from './_components/live-filters-drawer'
import { Undo2, ChevronUp, ChevronDown } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { MapStylePicker } from '@/app/(app)/map/[id]/_components/map-style-picker'
import { MapSearchOverlay } from '@/app/(app)/map/[id]/_components/map-search-overlay'
import { ResetZoomButton } from '@/app/(app)/map/[id]/_components/reset-zoom-button'
import { StatusBanner } from './_components/status-banner'
import { PoiPopup } from '../../map/[id]/_components/poi-popup'
import { ElevationStrip } from './_components/elevation-strip'
import { ElevationProfile } from '../../map/[id]/_components/elevation-profile'

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

  const handleQuitRequest = () => {
    stopWatching()
    router.push('/adventures')
  }

  const [mounted, setMounted] = useState(false)
  const [showConsent, setShowConsent] = useState(false)

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

  // Live weather — data still fetched for map layer (toggle removed)
  const weatherDepartureTime = useLiveStore((s) => s.weatherDepartureTime)
  const { weatherPoints } = useLiveWeather(segmentId, {
    departureTime: weatherDepartureTime ?? undefined,
  })

  // POI detail sheet — find selected POI from live results
  const selectedPoiId = useUIStore((s) => s.selectedPoiId)
  const selectedPoi = pois.find((p) => p.id === selectedPoiId) ?? null

  // Active filter count for badge
  const mapVisibleLayers = useMapStore((s) => s.visibleLayers)
  const mapWeatherActive = useMapStore((s) => s.weatherActive)
  const mapWeatherDimension = useMapStore((s) => s.weatherDimension)
  const mapDensityColorEnabled = useMapStore((s) => s.densityColorEnabled)
  const liveSearchRadiusKm = useLiveStore((s) => s.searchRadiusKm)
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (!mapVisibleLayers.has('accommodations')) count++
    if (mapVisibleLayers.has('restaurants')) count++
    if (mapVisibleLayers.has('supplies')) count++
    if (mapVisibleLayers.has('bike')) count++
    if (mapWeatherActive) count++
    if (mapDensityColorEnabled) count++
    if (liveSearchRadiusKm !== DEFAULT_RADIUS) count++
    return count
  }, [mapVisibleLayers, mapWeatherActive, mapDensityColorEnabled, liveSearchRadiusKm])

  // Filter accommodation pois once — memoized to avoid new reference on every render (GPS poll)
  const accommodationPois = useMemo(
    () => pois.filter((p) => (LAYER_CATEGORIES.accommodations as readonly string[]).includes(p.category)),
    [pois],
  )

  // Live context for PoiDetailSheet (D+/ETA with live mode values)
  const currentKmOnRoute = useLiveStore((s) => s.currentKmOnRoute)
  const speedKmh = useLiveStore((s) => s.speedKmh)
  const targetAheadKm = useLiveStore((s) => s.targetAheadKm)

  // Elevation strip positions
  const elevationCurrentDistKm = currentKmOnRoute
  const elevationTargetDistKm = currentKmOnRoute !== null ? currentKmOnRoute + targetAheadKm : null
  // D+ computation for LiveControls
  const elevationGain = useMemo(() => {
    if (currentKmOnRoute === null || allCumulativeWaypoints.length === 0) return null
    const targetDistKm = currentKmOnRoute + targetAheadKm
    const slice = allCumulativeWaypoints.filter(
      (wp) => wp.distKm >= currentKmOnRoute && wp.distKm <= targetDistKm,
    )
    if (slice.length < 2) return null
    return computeElevationGain(slice.map((wp) => ({ lat: wp.lat, lng: wp.lng, elevM: wp.ele ?? undefined })))
  }, [allCumulativeWaypoints, currentKmOnRoute, targetAheadKm])

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
          pois={pois}
          weatherPoints={weatherPoints}
          weatherDimension={mapWeatherDimension}
          weatherActive={mapWeatherActive}
          searchTrigger={searchTrigger}
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
        {mounted && showNoResultsBanner && !showOfflineBanner && !showErrorBanner && (
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

        {/* Reset zoom button — below style picker */}
        <div className="absolute top-14 right-4 z-10">
          <ResetZoomButton onClick={() => liveMapCanvasRef.current?.resetZoom()} />
        </div>

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
      />
    </div>
  )
}
