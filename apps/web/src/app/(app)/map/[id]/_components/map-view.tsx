'use client'
import { useState, useEffect } from 'react'
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react'
import { getAdventureMapData, getWeatherForecast } from '@/lib/api-client'
import { WEATHER_CACHE_TTL } from '@ridenrest/shared'
import { MapCanvas } from './map-canvas'
import { DensityLegend } from './density-legend'
import { SearchRangeControl } from './search-range-control'
import { PoiDetailSheet } from './poi-detail-sheet'
import { WEATHER_PACE_STORAGE_KEY } from './weather-controls'
import { SidebarWeatherSection } from './sidebar-weather-section'
import { SidebarDensitySection } from './sidebar-density-section'
import { StatusBanner } from '@/components/shared/status-banner'
import { Skeleton } from '@/components/ui/skeleton'
import { usePois } from '@/hooks/use-pois'
import { useDensity } from '@/hooks/use-density'
import { useMapStore } from '@/stores/map.store'
import type { SegmentWeatherData } from './map-canvas'
import { useUIStore } from '@/stores/ui.store'
import { useAdventureWaypoints } from '@/hooks/use-adventure-waypoints'
import type { AdventureMapResponse } from '@/lib/api-client'

interface MapViewProps {
  adventureId: string
}

export function MapView({ adventureId }: MapViewProps) {
  const [collapsed, setCollapsed] = useState(false)

  // Read saved pace params from localStorage (lazy init — runs once on mount)
  const [savedPace] = useState<{ departureTime: string; speedKmh: string }>(() => {
    try {
      const raw = typeof window !== 'undefined' ? localStorage.getItem(WEATHER_PACE_STORAGE_KEY) : null
      return raw ? (JSON.parse(raw) as { departureTime: string; speedKmh: string }) : { departureTime: '', speedKmh: '' }
    } catch { return { departureTime: '', speedKmh: '' } }
  })

  // Weather pace state — only updated on form submit
  const [paceParams, setPaceParams] = useState<{ departureTime: string | null; speedKmh: number | null }>(() => ({
    departureTime: savedPace.departureTime ? new Date(savedPace.departureTime).toISOString() : null,
    speedKmh: savedPace.speedKmh ? Number(savedPace.speedKmh) : null,
  }))
  const { weatherActive, setWeatherActive } = useMapStore()

  // Reset weatherActive when leaving the map (SPA navigation keeps Zustand alive)
  useEffect(() => {
    return () => { setWeatherActive(false) }
  }, [setWeatherActive])

  const { data, isPending, error } = useQuery<AdventureMapResponse>({
    queryKey: ['adventures', adventureId, 'map'],
    queryFn: () => getAdventureMapData(adventureId),
    staleTime: 0,
    // Poll every 3s while any segment is still processing — stops once all are done or errored
    refetchInterval: (query) => {
      const segments = query.state.data?.segments
      if (!segments) return false
      return segments.some((s) => s.parseStatus === 'pending' || s.parseStatus === 'processing')
        ? 3000
        : false
    },
  })

  // useDensity + usePois must be called unconditionally (Rules of Hooks)
  const readySegments = data?.segments.filter((s) => s.parseStatus === 'done') ?? []
  const { poisByLayer, isPending: poisPending, hasError: poisError } = usePois(readySegments)
  const { coverageGaps, densityStatus } = useDensity(adventureId)

  // Fetch weather for all ready segments as soon as layer is active.
  const weatherEnabled = weatherActive
  const weatherQueries = useQueries({
    queries: (weatherEnabled ? readySegments : []).map((segment) => ({
      queryKey: ['weather', { segmentId: segment.id, departureTime: paceParams.departureTime ?? null, speedKmh: paceParams.speedKmh ?? null }],
      queryFn: () => getWeatherForecast({
        segmentId: segment.id,
        departureTime: paceParams.departureTime ?? undefined,
        speedKmh: paceParams.speedKmh ?? undefined,
      }),
      staleTime: WEATHER_CACHE_TTL * 1000,
    })),
  })
  const weatherPending = weatherQueries.some((q) => q.isFetching)

  // Combine all segments into one continuous trace with cumulative distKm (C7.5).
  const allCumulativeWaypoints = useAdventureWaypoints(readySegments)
  const allWeatherPoints = weatherEnabled
    ? weatherQueries.flatMap((q) => q.data?.waypoints ?? [])
    : []
  const segmentsWeather: SegmentWeatherData[] = weatherEnabled && allWeatherPoints.length > 0
    ? [{ segmentId: 'adventure', weatherPoints: allWeatherPoints, waypoints: allCumulativeWaypoints }]
    : []

  const { selectedPoiId } = useUIStore()

  // Find the selected POI from poisByLayer (already in memory — no extra fetch needed)
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

  const queryClient = useQueryClient()

  // Retry handler — invalidates all POI queries for the current adventure segments
  const handlePoiRetry = () => {
    readySegments.forEach((s) => {
      queryClient.invalidateQueries({ queryKey: ['pois', { segmentId: s.id }], exact: false })
    })
  }

  if (isPending) return <Skeleton className="h-full w-full" />

  if (error) {
    return (
      <StatusBanner message="Impossible de charger la carte — vérifie ta connexion." />
    )
  }

  const pendingCount = data.segments.filter(
    (s) => s.parseStatus === 'pending' || s.parseStatus === 'processing',
  ).length

  const errorCount = data.segments.filter((s) => s.parseStatus === 'error').length

  return (
    <div className="flex h-full w-full">
      {/* Left column: desktop sidebar (hidden on mobile) */}
      <aside
        data-testid="planning-sidebar"
        className={`hidden lg:flex flex-col shrink-0 bg-background border-r border-[--border] transition-all duration-200 ${
          collapsed ? 'w-0 overflow-hidden' : 'w-[360px] overflow-y-auto'
        }`}
      >
        <div className="flex flex-col gap-4 p-4">
          {/* Search range slider */}
          <SearchRangeControl
            totalDistanceKm={data.totalDistanceKm}
            waypoints={allCumulativeWaypoints.length > 0 ? allCumulativeWaypoints : null}
            isPoisPending={poisPending}
            accommodationPois={poisByLayer.accommodations}
          />

          {/* Météo section — collapsible accordion (Story 8.4 correction) */}
          <SidebarWeatherSection
            isPending={weatherPending}
            initialDepartureTime={savedPace.departureTime}
            initialSpeedKmh={savedPace.speedKmh}
            onPaceSubmit={(departureTime, speedKmh) => {
              setPaceParams({ departureTime, speedKmh })
            }}
          />

          {/* Densité section — collapsible with legend (Story 8.4 correction / 8.5 merge) */}
          <SidebarDensitySection />

          {/* Stages list — Epic 11 */}
        </div>
      </aside>

      {/* Right column: map */}
      <div className="flex-1 relative min-w-0">
        {/* Sidebar collapse toggle — desktop only, at left edge of map column */}
        <button
          data-testid="sidebar-toggle"
          onClick={() => setCollapsed((v) => !v)}
          className={`hidden lg:flex absolute top-1/2 z-20 -translate-y-1/2 h-6 w-6 items-center justify-center rounded-full bg-background border border-[--border] shadow-sm text-text-secondary hover:text-text-primary ${
            collapsed ? 'left-0' : '-left-3'
          }`}
          aria-label={collapsed ? 'Ouvrir le panneau' : 'Fermer le panneau'}
        >
          {collapsed ? <ChevronRight className="h-3 w-3" /> : <ChevronLeft className="h-3 w-3" />}
        </button>

        {/* "← Aventures" back button */}
        <Link
          href="/adventures"
          data-testid="back-to-adventures"
          className="absolute top-4 left-4 z-40 inline-flex items-center gap-1 rounded-md bg-background/80 px-3 py-1.5 text-sm font-medium text-foreground backdrop-blur-sm hover:bg-background/90"
        >
          <ArrowLeft className="h-4 w-4" />
          Aventures
        </Link>

        {pendingCount > 0 && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10">
            <StatusBanner
              message={`${pendingCount} segment(s) en cours de traitement — ils apparaîtront automatiquement une fois prêts.`}
            />
          </div>
        )}
        {errorCount > 0 && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10" style={{ marginTop: pendingCount > 0 ? '3rem' : 0 }}>
            <StatusBanner
              message={`${errorCount} segment(s) n'ont pas pu être analysés — vérifiez le format GPX.`}
            />
          </div>
        )}

        <MapCanvas
          segments={readySegments}
          adventureName={data.adventureName}
          poisByLayer={poisByLayer}
          coverageGaps={coverageGaps}
          densityStatus={densityStatus}
          segmentsWeather={segmentsWeather}
          allWaypoints={allCumulativeWaypoints.length > 0 ? allCumulativeWaypoints : null}
        />
        {densityStatus === 'success' && (
          <div className="absolute bottom-16 right-4 z-10">
            <DensityLegend />
          </div>
        )}

        {poisError && (
          <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1">
            <StatusBanner message="Recherche indisponible — réessayer dans quelques instants." />
            <button
              onClick={handlePoiRetry}
              className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
            >
              Réessayer
            </button>
          </div>
        )}

        <PoiDetailSheet
          poi={selectedPoi}
          segments={readySegments}
          segmentId={selectedSegmentId}
        />
      </div>
    </div>
  )
}
