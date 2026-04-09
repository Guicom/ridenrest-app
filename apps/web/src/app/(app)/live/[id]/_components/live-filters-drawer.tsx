'use client'
import { useEffect, useRef, useState } from 'react'
import { X, ChevronDown, ChevronUp, CloudRain, LayoutGrid, Loader2, Thermometer, Umbrella, Wind, Calendar, MapPin } from 'lucide-react'
import { Drawer } from 'vaul'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { MAX_LIVE_RADIUS_KM } from '@ridenrest/shared'
import type { Poi, MapSegmentData, AdventureStageResponse } from '@ridenrest/shared'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { useMapStore } from '@/stores/map.store'
import { useLiveStore } from '@/stores/live.store'
import { PoiLayerGrid } from '@/app/(app)/map/[id]/_components/poi-layer-grid'
import { AccommodationSubTypes } from '@/app/(app)/map/[id]/_components/accommodation-sub-types'
import { DensityCategoryDialog } from '@/app/(app)/adventures/[id]/_components/density-category-dialog'
import { triggerDensityAnalysis } from '@/lib/api-client'
import { useDensity } from '@/hooks/use-density'
import { StageCard } from '@/components/shared/stage-card'
import type { WeatherDimension } from '@/app/(app)/map/[id]/_components/weather-layer'

const WEATHER_DIMS: { id: WeatherDimension; label: string; icon: typeof Thermometer }[] = [
  { id: 'temperature',   label: 'Temp.',  icon: Thermometer },
  { id: 'precipitation', label: 'Pluie',  icon: Umbrella },
  { id: 'wind',          label: 'Vent',   icon: Wind },
]

interface LiveFiltersDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accommodationPois?: Poi[]
  onSearch?: () => void
  defaultSpeedKmh?: number
  adventureId: string
  segments: MapSegmentData[]
  stages?: AdventureStageResponse[]
  currentKmOnRoute?: number | null
  liveSpeedKmh?: number
}

export function LiveFiltersDrawer({ open, onOpenChange, accommodationPois, onSearch, defaultSpeedKmh, adventureId, segments, stages = [], currentKmOnRoute = null, liveSpeedKmh = 0 }: LiveFiltersDrawerProps) {
  const {
    visibleLayers,
    weatherActive, weatherDimension,
    densityColorEnabled,
    setWeatherActive, setWeatherDimension, toggleDensityColor,
  } = useMapStore()

  const searchRadiusKm      = useLiveStore((s) => s.searchRadiusKm)
  const speedKmh            = useLiveStore((s) => s.speedKmh)
  const weatherDepartureTime = useLiveStore((s) => s.weatherDepartureTime)
  const stageLayerActive    = useLiveStore((s) => s.stageLayerActive)
  const setSearchRadius      = useLiveStore((s) => s.setSearchRadius)
  const setSpeedKmh          = useLiveStore((s) => s.setSpeedKmh)
  const setWeatherDepartureTime = useLiveStore((s) => s.setWeatherDepartureTime)
  const setStageLayerActive  = useLiveStore((s) => s.setStageLayerActive)

  // Local state — only radius, speed, and departure time require Apply (layer/weather/density toggles are immediate)
  const [localRadius,        setLocalRadius]        = useState(searchRadiusKm)
  const [localSpeed,         setLocalSpeed]         = useState(defaultSpeedKmh ?? speedKmh)
  const [localDepartureTime, setLocalDepartureTime] = useState(weatherDepartureTime ?? '')

  // Accordion expansion state
  const [stagesExpanded, setStagesExpanded] = useState(false)
  const [weatherExpanded, setWeatherExpanded] = useState(false)
  const [densityExpanded, setDensityExpanded] = useState(false)
  const [densityDialogOpen, setDensityDialogOpen] = useState(false)

  // Auto-scroll to current stage when accordion expands, drawer opens, or GPS position changes
  const currentStageRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (stagesExpanded && open && currentStageRef.current?.scrollIntoView) {
      currentStageRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [stagesExpanded, open, currentKmOnRoute])

  // Density status + mutation
  const { densityStatus, densityStale, densityProgress } = useDensity(adventureId)
  const queryClient = useQueryClient()
  const densityNeedsCalculation = densityStatus === 'idle' || densityStatus === 'error' || (densityStatus === 'success' && densityStale)
  const densityIsAnalyzing = densityStatus === 'pending' || densityStatus === 'processing'
  const densityIsDone = densityStatus === 'success' && !densityStale
  const allSegmentsParsed = segments.every((s) => s.parseStatus === 'done') && segments.length > 0

  const densityTriggerMutation = useMutation({
    mutationFn: (categories: string[]) => triggerDensityAnalysis(adventureId, categories),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['density', adventureId] })
      toast.success('Analyse de densité démarrée')
      setDensityDialogOpen(false)
    },
    onError: (err: Error & { status?: number }) => {
      toast.error(err.status === 409 ? 'Analyse déjà en cours' : "Erreur lors du lancement de l'analyse")
    },
  })

  // Reinitialize local state when drawer opens
  useEffect(() => {
    if (open) {
      setLocalRadius(searchRadiusKm)
      setLocalSpeed(defaultSpeedKmh ?? speedKmh)
      setLocalDepartureTime(weatherDepartureTime ?? '')
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const hasPoi = (
    visibleLayers.has('accommodations') ||
    visibleLayers.has('restaurants') ||
    visibleLayers.has('supplies') ||
    visibleLayers.has('bike')
  )

  // Persist local values to the store on any close (swipe, overlay tap, X button)
  const handleClose = () => {
    setSearchRadius(localRadius)
    setSpeedKmh(localSpeed)
    setWeatherDepartureTime(localDepartureTime || null)
    onOpenChange(false)
  }

  // Wrapper for Drawer.Root onOpenChange — intercept close to persist values
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      handleClose()
    } else {
      onOpenChange(true)
    }
  }

  const handleApply = () => {
    setSearchRadius(localRadius)
    setSpeedKmh(localSpeed)
    setWeatherDepartureTime(localDepartureTime || null)
    onOpenChange(false)
    onSearch?.()
  }

  return (
    <>
    <Drawer.Root open={open} onOpenChange={handleOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl max-h-[95vh] flex flex-col">
          {/* Drag handle */}
          <div className="w-12 h-1.5 bg-[--border] rounded-full mx-auto mt-4 mb-4 shrink-0" />

          {/* Title + X close */}
          <div className="flex items-center justify-between mb-4 px-4 shrink-0">
            <Drawer.Title className="text-base font-semibold">Filtres</Drawer.Title>
            <button
              onClick={handleClose}
              aria-label="Fermer les filtres"
              data-testid="filters-close-btn"
              className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-[--surface] active:scale-[0.85] transition-all duration-75 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto px-4 min-h-0">

          {/* Section 1: Vitesse moyenne */}
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-semibold text-foreground">Vitesse moyenne</p>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={5}
                max={50}
                value={localSpeed}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (v >= 5 && v <= 50) setLocalSpeed(v)
                }}
                data-testid="input-speed"
                className="h-9 w-16 rounded-lg border border-[--border] bg-white px-2 text-sm text-center font-mono"
              />
              <span className="text-sm text-[--text-secondary]">km/h</span>
            </div>
          </div>

          {/* Section 2: Distance de la trace */}
          <div className="mb-4">
            <p className="text-sm font-semibold text-foreground mb-2">Distance de la trace</p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setLocalRadius((r) => Math.max(0.5, r - 0.5))}
                className="h-9 w-9 rounded-lg bg-white border border-[--border] text-foreground font-bold text-lg flex items-center justify-center cursor-pointer transition-all duration-75 hover:bg-[--surface-raised] active:scale-[0.90]"
                aria-label="Diminuer le rayon"
              >
                —
              </button>
              <span className="font-mono text-lg font-bold whitespace-nowrap min-w-[4.5rem] text-center">
                {localRadius} km
              </span>
              <button
                onClick={() => setLocalRadius((r) => Math.min(MAX_LIVE_RADIUS_KM, r + 0.5))}
                className="h-9 w-9 rounded-lg bg-white border border-[--border] text-foreground font-bold text-lg flex items-center justify-center cursor-pointer transition-all duration-75 hover:bg-[--surface-raised] active:scale-[0.90]"
                aria-label="Augmenter le rayon"
              >
                +
              </button>
            </div>
          </div>

          {/* Section 2: Calques POI — 1 row, same icons as planning mode */}
          <div className="mb-3">
            <p className="text-sm font-semibold text-foreground mb-2">Je cherche</p>
            <PoiLayerGrid isPending={false} />
          </div>

          {/* Section 2b: Sub-types hébergement (conditional) */}
          {visibleLayers.has('accommodations') && (
            <div className="mb-4">
              <AccommodationSubTypes accommodationPois={accommodationPois} onlyCountActive />
            </div>
          )}

          {/* Section: Étapes — accordion with StageCards when stages exist, simple toggle otherwise */}
          {stages.length > 0 ? (
            <div className="rounded-xl border border-[--border] overflow-hidden mb-3" data-testid="stages-accordion">
              <button
                className="w-full flex items-center justify-between px-4 py-3 select-none cursor-pointer hover:bg-[--surface-raised] active:bg-[--border] transition-colors"
                onClick={() => setStagesExpanded((v) => !v)}
                data-testid="stages-accordion-header"
              >
                <div className="flex items-center gap-2">
                  <MapPin className="h-5 w-5" aria-hidden="true" />
                  <span className="text-sm font-medium">Étapes ({stages.length})</span>
                </div>
                <div className="flex items-center gap-2">
                  <div onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={stageLayerActive}
                      onCheckedChange={setStageLayerActive}
                      aria-label="Afficher les étapes"
                      data-testid="switch-stages"
                    />
                  </div>
                  {stagesExpanded
                    ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                    : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                </div>
              </button>
              {stagesExpanded && (
                <div className="px-4 pb-4 flex flex-col gap-2 max-h-64 overflow-y-auto" data-testid="stages-list">
                  {stages.map((stage) => {
                    const isPassed = currentKmOnRoute !== null && currentKmOnRoute >= stage.endKm
                    const isCurrent = currentKmOnRoute !== null && currentKmOnRoute >= stage.startKm && currentKmOnRoute < stage.endKm
                    const hasPosition = currentKmOnRoute !== null && liveSpeedKmh > 0
                    const etaFromCurrentMinutes = hasPosition && (isCurrent || !isPassed)
                      ? Math.round(((stage.endKm - currentKmOnRoute!) / liveSpeedKmh) * 60)
                      : null

                    return (
                      <div key={stage.id} ref={isCurrent ? currentStageRef : undefined}>
                        <StageCard
                          stage={stage}
                          mode="live"
                          isCurrent={isCurrent}
                          isPassed={isPassed}
                          etaFromCurrentMinutes={etaFromCurrentMinutes}
                        />
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold text-foreground">Étapes</p>
              <Switch
                checked={stageLayerActive}
                onCheckedChange={setStageLayerActive}
                aria-label="Afficher les étapes"
                data-testid="switch-stages"
              />
            </div>
          )}

          {/* Section 3: Météo (accordion) */}
          <div className="rounded-xl border border-[--border] overflow-hidden mb-3">
            <button
              className="w-full flex items-center justify-between px-4 py-3 select-none cursor-pointer hover:bg-[--surface-raised] active:bg-[--border] transition-colors"
              onClick={() => setWeatherExpanded((v) => !v)}
              data-testid="weather-accordion-header"
            >
              <div className="flex items-center gap-2">
                <CloudRain className="h-5 w-5" aria-hidden="true" />
                <span className="text-sm font-medium">Météo</span>
              </div>
              {weatherExpanded
                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
            {weatherExpanded && (
              <div className="px-4 pb-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Afficher sur la carte</span>
                  <Switch
                    checked={weatherActive}
                    onCheckedChange={setWeatherActive}
                    aria-label="Activer la météo"
                    data-testid="switch-weather"
                  />
                </div>
                {/* Dimension segmented control */}
                <div className="flex p-1 bg-muted rounded-full">
                  {WEATHER_DIMS.map(({ id, label, icon: Icon }) => (
                    <button
                      key={id}
                      onClick={() => setWeatherDimension(id)}
                      aria-pressed={weatherDimension === id}
                      className={[
                        'flex-1 flex items-center justify-center gap-1.5 py-1.5 text-sm font-medium rounded-full transition-all duration-75 cursor-pointer active:scale-[0.95]',
                        weatherDimension === id
                          ? 'bg-background text-primary shadow-sm'
                          : 'text-muted-foreground hover:text-foreground',
                      ].join(' ')}
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {label}
                    </button>
                  ))}
                </div>
                {/* Departure date/time */}
                <div className="flex items-center gap-3 bg-muted rounded-xl px-4 py-3">
                  <Calendar className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden="true" />
                  <input
                    type="datetime-local"
                    value={localDepartureTime}
                    onChange={(e) => setLocalDepartureTime(e.target.value)}
                    data-testid="input-departure-time"
                    className="bg-transparent text-sm text-foreground w-full outline-none"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Section 3: Densité (accordion) */}
          <div className="rounded-xl border border-[--border] overflow-hidden mb-4">
            <button
              className="w-full flex items-center justify-between px-4 py-3 select-none cursor-pointer hover:bg-[--surface-raised] active:bg-[--border] transition-colors"
              onClick={() => setDensityExpanded((v) => !v)}
              data-testid="density-accordion-header"
            >
              <div className="flex items-center gap-2">
                <LayoutGrid className="h-5 w-5" aria-hidden="true" />
                <span className="text-sm font-medium">Densité</span>
              </div>
              {densityExpanded
                ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
            </button>
            {densityExpanded && (
              <div className="px-4 pb-4 flex flex-col gap-3">
                {/* CTA — density not calculated or stale */}
                {densityNeedsCalculation && (
                  <>
                    <p className="text-xs text-muted-foreground">
                      {densityStatus === 'error'
                        ? "L'analyse a échoué. Réessayez."
                        : densityStale
                          ? 'Les segments ont changé depuis la dernière analyse. Relancez pour mettre à jour.'
                          : "Identifie les zones avec peu d'hébergements sur votre parcours."}
                    </p>
                    <Button
                      variant="ghost"
                      className="w-full gap-2 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
                      onClick={() => setDensityDialogOpen(true)}
                      disabled={!allSegmentsParsed || densityTriggerMutation.isPending}
                      data-testid="live-density-cta-btn"
                    >
                      <LayoutGrid className="h-4 w-4" />
                      {densityStatus === 'error' ? 'Réessayer' : 'Calculer la densité'}
                    </Button>
                  </>
                )}

                {/* Progress — analysis running */}
                {densityIsAnalyzing && (
                  <div className="flex items-center gap-3 py-2">
                    <Loader2 className="h-4 w-4 animate-spin text-primary shrink-0" />
                    <div className="flex-1">
                      <p className="text-sm text-muted-foreground">
                        Analyse en cours… {densityProgress > 0 ? `${densityProgress}%` : ''}
                      </p>
                      {densityProgress > 0 && (
                        <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary transition-all duration-300"
                            style={{ width: `${densityProgress}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Done — toggle + legend */}
                {densityIsDone && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">Afficher sur la carte</span>
                      <Switch
                        checked={densityColorEnabled}
                        onCheckedChange={toggleDensityColor}
                        aria-label="Afficher la densité"
                        data-testid="switch-density"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <p className="text-sm font-semibold text-foreground uppercase tracking-wide mb-1">
                        Densité hébergements / 10 km
                      </p>
                      {[
                        { color: 'var(--density-high)',   label: 'Bonne disponibilité',   detail: '2+ hébergements / 10km' },
                        { color: 'var(--density-medium)', label: 'Disponibilité limitée', detail: '1 hébergement / 10km' },
                        { color: 'var(--density-low)',    label: 'Zone critique',          detail: 'Aucun hébergement / 10km' },
                      ].map(({ color, label, detail }) => (
                        <div key={label} className="flex items-center gap-2">
                          <span className="inline-block h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: color }} aria-hidden="true" />
                          <span className="text-xs font-medium">{label}</span>
                          <span className="text-xs text-muted-foreground">— {detail}</span>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          </div>{/* end scrollable content */}

          {/* Fixed bottom section */}
          <div className="shrink-0 px-4 pb-8 pt-3">
            {/* Validation message */}
            {!hasPoi && (
              <p className="text-sm text-destructive text-center mb-2">
                Sélectionne au moins un type de lieu
              </p>
            )}

            {/* Search button */}
            <button
              disabled={!hasPoi}
              onClick={handleApply}
              data-testid="search-btn"
              className="w-full h-12 bg-primary text-primary-foreground rounded-full font-medium cursor-pointer transition-all duration-75 hover:enabled:brightness-90 active:enabled:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Rechercher
            </button>
          </div>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
    <DensityCategoryDialog
      open={densityDialogOpen}
      onOpenChange={setDensityDialogOpen}
      onConfirm={(cats) => densityTriggerMutation.mutate(cats)}
      isLoading={densityTriggerMutation.isPending}
    />
    </>
  )
}
