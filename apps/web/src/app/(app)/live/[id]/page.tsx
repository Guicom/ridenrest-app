'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { snapToTrace } from '@ridenrest/gpx'
import type { KmWaypoint } from '@ridenrest/gpx'
import type { WeatherDimension } from '@/app/(app)/map/[id]/_components/weather-layer'
import { useLiveMode } from '@/hooks/use-live-mode'
import { useLivePoisSearch } from '@/hooks/use-live-poi-search'
import { useLiveWeather } from '@/hooks/use-live-weather'
import { useLiveStore } from '@/stores/live.store'
import { useUIStore } from '@/stores/ui.store'
import { getAdventureMapData } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { LiveMapCanvas } from './_components/live-map-canvas'
import { GeolocationConsent } from './_components/geolocation-consent'
import { LiveControls } from './_components/live-controls'
import { LiveWeatherOverlay } from './_components/live-weather-overlay'
import { PoiDetailSheet } from '../../map/[id]/_components/poi-detail-sheet'

export default function LivePage() {
  const { id: adventureId } = useParams<{ id: string }>()
  const {
    isLiveModeActive,
    hasConsented,
    permissionDenied,
    startWatching,
    grantConsent,
  } = useLiveMode()

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

  // Live POI search
  const { pois, isPending: poisPending, targetKm } = useLivePoisSearch(segmentId)

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

      {/* Top bar — z-40 */}
      <div className="absolute top-4 left-4 z-40">
        <Link
          href="/adventures"
          className="inline-flex items-center gap-1 rounded-md bg-background/80 px-3 py-1.5 text-sm font-medium text-foreground backdrop-blur-sm hover:bg-background/90"
        >
          <ArrowLeft className="h-4 w-4" />
          Aventures
        </Link>
      </div>

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
    </div>
  )
}
