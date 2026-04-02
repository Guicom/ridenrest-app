'use client'
import { useEffect, useState } from 'react'
import { X, ChevronDown, ChevronUp, CloudRain, LayoutGrid, Thermometer, Umbrella, Wind, Calendar } from 'lucide-react'
import { Drawer } from 'vaul'
import type { Poi } from '@ridenrest/shared'
import { Switch } from '@/components/ui/switch'
import { useMapStore } from '@/stores/map.store'
import { useLiveStore } from '@/stores/live.store'
import { PoiLayerGrid } from '@/app/(app)/map/[id]/_components/poi-layer-grid'
import { AccommodationSubTypes } from '@/app/(app)/map/[id]/_components/accommodation-sub-types'
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
}

export function LiveFiltersDrawer({ open, onOpenChange, accommodationPois, onSearch, defaultSpeedKmh }: LiveFiltersDrawerProps) {
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
  const [weatherExpanded, setWeatherExpanded] = useState(false)
  const [densityExpanded, setDensityExpanded] = useState(false)

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

  const handleApply = () => {
    setSearchRadius(localRadius)
    setSpeedKmh(localSpeed)
    setWeatherDepartureTime(localDepartureTime || null)
    onOpenChange(false)
    onSearch?.()
  }

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl p-4 pb-8 max-h-[95vh] overflow-y-auto">
          {/* Drag handle */}
          <div className="w-12 h-1.5 bg-[--border] rounded-full mx-auto mb-4" />

          {/* Title + X close */}
          <div className="flex items-center justify-between mb-4">
            <Drawer.Title className="text-base font-semibold">Filtres</Drawer.Title>
            <button
              onClick={() => onOpenChange(false)}
              aria-label="Fermer les filtres"
              data-testid="filters-close-btn"
              className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-[--surface] active:scale-[0.85] transition-all duration-75 cursor-pointer"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

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
                onClick={() => setLocalRadius((r) => Math.min(30, r + 0.5))}
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

          {/* Section: Étapes — immediate toggle (no Apply) */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold text-foreground">Étapes</p>
            <Switch
              checked={stageLayerActive}
              onCheckedChange={setStageLayerActive}
              aria-label="Afficher les étapes"
              data-testid="switch-stages"
            />
          </div>

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
              </div>
            )}
          </div>

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
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
