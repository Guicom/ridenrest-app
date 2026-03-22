'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useQuery } from '@tanstack/react-query'
import { snapToTrace } from '@ridenrest/gpx'
import type { KmWaypoint } from '@ridenrest/gpx'
import type { WeatherDimension } from '@/app/(app)/map/[id]/_components/weather-layer'
import { SlidersHorizontal } from 'lucide-react'
import { useLiveMode } from '@/hooks/use-live-mode'
import { useLivePoisSearch } from '@/hooks/use-live-poi-search'
import { useNetworkStatus } from '@/hooks/use-network-status'
import { useLiveWeather } from '@/hooks/use-live-weather'
import { useLiveStore } from '@/stores/live.store'
import { useMapStore } from '@/stores/map.store'
import { useUIStore } from '@/stores/ui.store'
import { getAdventureMapData } from '@/lib/api-client'
import { LAYER_CATEGORIES } from '@ridenrest/shared'
import { Button } from '@/components/ui/button'
import { LiveMapCanvas } from './_components/live-map-canvas'
import { GeolocationConsent } from './_components/geolocation-consent'
import { LiveControls } from './_components/live-controls'
import { LiveFiltersDrawer } from './_components/live-filters-drawer'
import { StatusBanner } from './_components/status-banner'
import { LiveWeatherOverlay } from './_components/live-weather-overlay'
import { PoiDetailSheet } from '../../map/[id]/_components/poi-detail-sheet'
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

  const [quitPending, setQuitPending] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const quitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => { if (quitTimerRef.current) clearTimeout(quitTimerRef.current) }
  }, [])

  const handleQuitRequest = () => {
    if (quitPending) {
      stopWatching()
      router.push('/adventures')
      return
    }
    setQuitPending(true)
    quitTimerRef.current = setTimeout(() => setQuitPending(false), 3000)
  }

  const [mounted, setMounted] = useState(false)
  const [showConsent, setShowConsent] = useState(false)

  // Weather layer state
  const [weatherActive, setWeatherActive] = useState(false)
  const [weatherDimension, setWeatherDimension] = useState<WeatherDimension>('temperature')
  const [weatherDepartureTime, setWeatherDepartureTime] = useState('')

  const { data: mapData, isPending } = useQuery({
    queryKey: ['adventures', adventureId, 'map'],
    queryFn: () => getAdventureMapData(adventureId),
  })

  const segments = mapData?.segments ?? []
  const firstSegment = segments[0]
  const segmentId = firstSegment?.id

  // Network status
  const { isOnline } = useNetworkStatus()

  // Live POI search
  const { pois, isPending: poisPending, targetKm, isError: poisError } = useLivePoisSearch(segmentId)

  // Banner state
  const showOfflineBanner = !isOnline && isLiveModeActive
  const showErrorBanner = isOnline && poisError && isLiveModeActive && !poisPending

  // Live weather — pass user departure time if set
  const weatherDepartureTimeIso = weatherDepartureTime
    ? new Date(weatherDepartureTime).toISOString()
    : undefined
  const {
    weatherPoints,
    isGpsLost,
  } = useLiveWeather(segmentId, {
    departureTime: weatherDepartureTimeIso,
  })

  // POI detail sheet — find selected POI from live results
  const selectedPoiId = useUIStore((s) => s.selectedPoiId)
  const selectedPoi = pois.find((p) => p.id === selectedPoiId) ?? null

  // Active filter count for badge
  const mapVisibleLayers = useMapStore((s) => s.visibleLayers)
  const mapWeatherActive = useMapStore((s) => s.weatherActive)
  const mapDensityColorEnabled = useMapStore((s) => s.densityColorEnabled)
  const liveSearchRadiusKm = useLiveStore((s) => s.searchRadiusKm)
  const activeFilterCount = useMemo(() => {
    let count = 0
    if (!mapVisibleLayers.has('accommodations')) count++
    if (mapVisibleLayers.has('restaurants')) count++
    if (mapVisibleLayers.has('supplies')) count++
    if (mapVisibleLayers.has('bike')) count++
    if (mapWeatherActive) count++
    if (!mapDensityColorEnabled) count++
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
  const liveContext = isLiveModeActive && currentKmOnRoute !== null
    ? { currentKmOnRoute, speedKmh }
    : undefined

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
    <div className="relative h-dvh w-full overflow-hidden">
      {/* Map canvas — z-0 */}
      <LiveMapCanvas
        adventureId={adventureId}
        segments={segments}
        targetKm={targetKm}
        pois={pois}
        weatherPoints={weatherPoints}
        weatherDimension={weatherDimension}
        weatherActive={weatherActive}
      />

      {/* Quitter le live — top right z-40 */}
      <div className="absolute top-4 right-4 z-40">
        <button
          data-testid="quit-live-btn"
          onClick={handleQuitRequest}
          className="inline-flex items-center gap-1.5 rounded-md bg-background/80 px-3 py-1.5 text-sm font-medium text-foreground backdrop-blur-sm hover:bg-background/90 border border-[--border]"
        >
          {quitPending ? '✓ Confirmer ?' : '⏹ Quitter le live'}
        </button>
      </div>

      {/* FILTERS button — bottom-left z-30, above LiveControls */}
      {mounted && isLiveModeActive && (
        <div className="absolute bottom-32 left-4 z-30">
          <button
            onClick={() => setFiltersOpen(true)}
            data-testid="live-filters-btn"
            className="inline-flex items-center gap-1.5 rounded-lg bg-background/90 px-3 py-2 text-sm font-medium backdrop-blur-sm border border-[--border] shadow-sm"
          >
            <SlidersHorizontal className="h-4 w-4" />
            FILTERS
            {activeFilterCount > 0 && (
              <span className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Weather overlay — top right z-40 */}
      {mounted && isLiveModeActive && (
        <LiveWeatherOverlay
          weatherActive={weatherActive}
          onToggle={() => setWeatherActive((v) => !v)}
          dimension={weatherDimension}
          onDimensionChange={setWeatherDimension}
          isGpsLost={isGpsLost}
          departureTime={weatherDepartureTime}
          onDepartureTimeChange={setWeatherDepartureTime}
        />
      )}

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

      {/* Bottom overlay — z-30 (only render after mount to avoid hydration mismatch) */}
      {mounted && (
        <>
          {isLiveModeActive && (
            <LiveControls />
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

      {/* POI search loading indicator */}
      {poisPending && isLiveModeActive && (
        <div className="absolute top-14 right-4 z-40">
          <div className="flex items-center gap-2 rounded-md bg-background/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur-sm">
            <div className="h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            Recherche POIs…
          </div>
        </div>
      )}

      {/* POI detail sheet — opens when a pin is clicked on the map */}
      <PoiDetailSheet
        poi={selectedPoi}
        segments={segments}
        segmentId={segmentId ?? null}
        liveContext={liveContext}
      />

      {/* Live filters drawer — z-50 */}
      <LiveFiltersDrawer
        open={filtersOpen}
        onOpenChange={setFiltersOpen}
        accommodationPois={accommodationPois}
      />
    </div>
  )
}
