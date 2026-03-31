'use client'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useQuery, useQueries, useQueryClient } from '@tanstack/react-query'
import Link from 'next/link'
import { ArrowLeft, ChevronLeft, ChevronRight, ChevronUp, ChevronDown } from 'lucide-react'
import { getAdventureMapData, getWeatherForecast } from '@/lib/api-client'
import { WEATHER_CACHE_TTL } from '@ridenrest/shared'
import { MapCanvas } from './map-canvas'
import type { MapCanvasHandle } from './map-canvas'
import { SearchRangeControl } from './search-range-control'
import { PoiPopup } from './poi-popup'
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
import { ElevationProfile } from './elevation-profile'
import { MapStylePicker } from './map-style-picker'
import { ResetZoomButton } from './reset-zoom-button'
import { TraceClickCta } from './trace-click-cta'
import { MapSearchOverlay } from './map-search-overlay'
import { SidebarStagesSection } from './sidebar-stages-section'
import { useStages } from '@/hooks/use-stages'
import { useElevationProfile } from '@/hooks/use-elevation-profile'
import { getStoredWeatherPace } from '@/lib/weather-pace'

interface MapViewProps {
  adventureId: string
}

export function MapView({ adventureId }: MapViewProps) {
  const [collapsed, setCollapsed] = useState(false)
  const [elevationCollapsed, setElevationCollapsed] = useState(false)
  const [stageClickMode, setStageClickMode] = useState(false)
  const [pendingEndKm, setPendingEndKm] = useState<number | null>(null)
  const [showNamingDialog, setShowNamingDialog] = useState(false)
  const [stagesVisible, setStagesVisible] = useState(false)
  // Ref-based crosshair — bypasses React state to avoid re-renders on every mouse move
  const mapCanvasRef = useRef<MapCanvasHandle>(null)
  const handleHoverKm = useCallback((km: number | null) => {
    mapCanvasRef.current?.updateCrosshair(km)
  }, [])

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
  const { weatherActive, setWeatherActive, searchRangeInteracted, fromKm: mapFromKm, toKm: mapToKm, selectedStageId, setSelectedStageId, setSearchCommitted, searchCommitted, setTraceClickedKm, visibleLayers } = useMapStore()

  // Reset transient map state when leaving the map (SPA navigation keeps Zustand alive)
  useEffect(() => {
    return () => {
      setWeatherActive(false)
      setSelectedStageId(null)
      setSearchCommitted(false)  // prevent auto-search on return navigation
    }
  }, [setWeatherActive, setSelectedStageId, setSearchCommitted])

  // Auto-show stage segments when a stage is selected from the search panel
  useEffect(() => {
    if (selectedStageId) setStagesVisible(true)
  }, [selectedStageId, setStagesVisible])

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
  // useMemo — stable reference prevents spurious re-renders and effect re-runs
  const readySegments = useMemo(
    () => data?.segments.filter((s) => s.parseStatus === 'done') ?? [],
    [data],
  )
  const { poisByLayer, isPending: poisPending, hasError: poisError } = usePois(readySegments)
  const { coverageGaps, densityStatus, densityCategories } = useDensity(adventureId)

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

  const { stages, createStage, updateStage, deleteStage } = useStages(adventureId)

  // Read pace from localStorage once on mount — not reactive (acceptable per story dev notes)
  const stagePace = getStoredWeatherPace()

  // Hover preview overlay during stageClickMode (AC1)
  const [hoverKmPreview, setHoverKmPreview] = useState<number | null>(null)
  // Drag hover overlay during stage marker drag
  const [dragHoverState, setDragHoverState] = useState<{ stageId: string; distKm: number } | null>(null)
  const { points: elevationPoints } = useElevationProfile(allCumulativeWaypoints, readySegments)

  // Reset hover preview when exiting click mode
  useEffect(() => {
    if (!stageClickMode) setHoverKmPreview(null)
  }, [stageClickMode])

  // Auto-zoom to corridor after POI search completes (AC #1, Story 16.3)
  // NOTE: mapFromKm, mapToKm, readySegments intentionally excluded from deps —
  // they are stable during an active search, and including them would cause the
  // cleanup to reset prevIsPendingRef before the transition fires.
  const prevIsPendingRef = useRef(false)
  const mapFromKmRef = useRef(mapFromKm)
  const mapToKmRef = useRef(mapToKm)
  const readySegmentsRef = useRef(readySegments)
  useEffect(() => { mapFromKmRef.current = mapFromKm }, [mapFromKm])
  useEffect(() => { mapToKmRef.current = mapToKm }, [mapToKm])
  useEffect(() => { readySegmentsRef.current = readySegments }, [readySegments])
  useEffect(() => {
    if (searchCommitted && prevIsPendingRef.current && !poisPending) {
      mapCanvasRef.current?.fitToCorridorRange(mapFromKmRef.current, mapToKmRef.current, readySegmentsRef.current)
    }
    prevIsPendingRef.current = poisPending
    return () => { prevIsPendingRef.current = false }
  }, [poisPending, searchCommitted])

  // Clear trace CTA when search is committed (AC #3, Story 16.3)
  useEffect(() => {
    if (searchCommitted) {
      setTraceClickedKm(null)
    }
  }, [searchCommitted, setTraceClickedKm])

  // Close trace CTA on Escape key (AC #3, Story 16.3)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setTraceClickedKm(null)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [setTraceClickedKm])

  // Compute overlay values — works for both click mode (hoverKmPreview) and drag (dragHoverState)
  const overlayKm = dragHoverState?.distKm ?? hoverKmPreview
  const overlayFromKm = dragHoverState
    ? (stages.find((s) => s.id === dragHoverState.stageId)?.startKm ?? 0)
    : (stages.length > 0 ? stages[stages.length - 1].endKm : 0)
  const previewDeltaKm = overlayKm !== null ? Math.max(0, overlayKm - overlayFromKm) : null
  const previewDPlus = useMemo(() => {
    if (overlayKm === null || elevationPoints.length === 0) return null
    const fromPt = elevationPoints.find((p) => p.distKm >= overlayFromKm) ?? elevationPoints[0]
    const toPt = [...elevationPoints].reverse().find((p) => p.distKm <= overlayKm) ?? elevationPoints[0]
    return Math.max(0, toPt.cumulativeDPlus - fromPt.cumulativeDPlus)
  }, [overlayKm, overlayFromKm, elevationPoints])

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
            stages={stages.length > 0 ? stages : undefined}
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
          <SidebarStagesSection
            stages={stages}
            onEnterClickMode={() => setStageClickMode(true)}
            onExitClickMode={() => setStageClickMode(false)}
            isClickModeActive={stageClickMode}
            pendingEndKm={pendingEndKm}
            showNamingDialog={showNamingDialog}
            onNamingDialogClose={() => {
              setShowNamingDialog(false)
              setPendingEndKm(null)
            }}
            stagesVisible={stagesVisible}
            onStagesVisibilityChange={setStagesVisible}
            onCreateStage={createStage}
            onUpdateStage={updateStage}
            onDeleteStage={deleteStage}
            weatherActive={weatherActive}
            departureTime={stagePace.departureTime}
            speedKmh={stagePace.speedKmh}
          />
        </div>
      </aside>

      {/* Right column: map + elevation profile */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Map area */}
        <div className="relative flex-1 min-h-0">
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
            ref={mapCanvasRef}
            segments={readySegments}
            adventureName={data.adventureName}
            poisByLayer={poisByLayer}
            coverageGaps={coverageGaps}
            densityStatus={densityStatus}
            segmentsWeather={segmentsWeather}
            allWaypoints={allCumulativeWaypoints.length > 0 ? allCumulativeWaypoints : null}
            stages={stagesVisible ? stages : []}
            stageClickMode={stageClickMode}
            onStageClick={(endKm) => {
              setPendingEndKm(endKm)
              setShowNamingDialog(true)
              setStageClickMode(false)
            }}
            onStageDragEnd={async (stageId, newEndKm) => {
              try {
                await updateStage(stageId, { endKm: newEndKm })
              } catch (err) {
                console.error('Failed to update stage position:', err)
                // TODO: show user-visible error and reset marker to previous position
              }
            }}
            onStageHoverKm={setHoverKmPreview}
            onStageDragHoverKm={(stageId, distKm) => {
              if (stageId === null || distKm === null) setDragHoverState(null)
              else setDragHoverState({ stageId, distKm })
            }}
          />

          {/* Loading overlay while POI search is pending (AC #4, Story 16.3) */}
          <MapSearchOverlay visible={searchCommitted && poisPending} />

          {/* No-results banner — orange, centered, shown after a committed search returns nothing */}
          {searchCommitted && !poisPending && !poisError && allPois.length === 0 && readySegments.length > 0 && visibleLayers.size > 0 && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 whitespace-nowrap rounded-lg bg-orange-500/90 px-4 py-2 text-sm font-medium text-white backdrop-blur-sm">
              Aucun résultat dans cette zone
            </div>
          )}

          {/* Trace click CTA — centered above elevation profile (AC #3, Story 16.3) */}
          <TraceClickCta />


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

          {selectedPoi && mapCanvasRef.current?.getMap() && (
            <PoiPopup
              poi={selectedPoi}
              segments={readySegments}
              segmentId={selectedSegmentId}
              map={mapCanvasRef.current.getMap()!}
              onClose={() => {
                useUIStore.getState().setSelectedPoi(null)
                useMapStore.getState().setSelectedPoiId(null)
              }}
            />
          )}

          {/* Reset zoom button — above style picker (AC #2, Story 16.3) */}
          <div className="absolute bottom-20 right-4 z-10">
            <ResetZoomButton onClick={() => mapCanvasRef.current?.resetZoom()} />
          </div>

          {/* Map style selector — floating bottom-right */}
          <MapStylePicker />

          {/* Hover preview overlay: click mode (AC1) + drag marker */}
          {(stageClickMode || dragHoverState !== null) && overlayKm !== null && previewDeltaKm !== null && (
            <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2 rounded-md bg-background/90 px-9 py-4 text-base shadow-md backdrop-blur-sm border border-[--border]">
              <span className="font-mono font-semibold">+{previewDeltaKm.toFixed(1)} km</span>
              {previewDPlus !== null && (
                <span className="ml-6 text-muted-foreground">D+ <span className="font-mono font-semibold">{previewDPlus.toFixed(0)} m</span></span>
              )}
            </div>
          )}

          {/* Mobile corridor range pill — visible on mobile only when user has interacted (AC #4) */}
          {searchRangeInteracted && (
            <div className="lg:hidden absolute bottom-0 left-0 right-0 z-20 flex justify-center bg-[--surface] rounded-t-2xl shadow-lg px-6 py-3">
              <span className="font-mono text-lg font-bold text-[--text-primary]">
                {Math.round(mapFromKm).toLocaleString('fr')} – {Math.round(mapToKm).toLocaleString('fr')} km
              </span>
            </div>
          )}
        </div>

        {/* Elevation profile — desktop only (AC6: hidden on mobile) */}
        <div className={`hidden lg:block relative shrink-0 border-t border-[--border] bg-background transition-all duration-200 ${elevationCollapsed ? 'h-0' : 'h-[180px]'}`}>
          {/* Collapse toggle — circle button at top edge, centered */}
          <button
            onClick={() => setElevationCollapsed((v) => !v)}
            className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 flex h-6 w-6 items-center justify-center rounded-full bg-background border border-[--border] shadow-sm text-muted-foreground hover:text-foreground"
            aria-label={elevationCollapsed ? "Afficher le profil d'élévation" : "Masquer le profil d'élévation"}
          >
            {elevationCollapsed ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
          <ElevationProfile
            waypoints={allCumulativeWaypoints}
            segments={readySegments}
            onHoverKm={handleHoverKm}
            className="h-full w-full"
            stages={stages}
            stagesVisible={stagesVisible}
          />
        </div>
      </div>
    </div>
  )
}
