'use client'
import { useEffect, useState } from 'react'
import { Drawer } from 'vaul'
import type { MapLayer, Poi, PoiCategory } from '@ridenrest/shared'
import { useMapStore } from '@/stores/map.store'
import { useLiveStore } from '@/stores/live.store'
import { ACCOMMODATION_SUB_TYPES, computeAccCountByType } from '@/app/(app)/map/[id]/_components/accommodation-sub-types'

const POI_LAYER_CARDS: { layer: MapLayer; label: string; icon: string }[] = [
  { layer: 'accommodations', label: 'Hébergements', icon: '🛏️' },
  { layer: 'restaurants',    label: 'Restauration',  icon: '🍴' },
  { layer: 'supplies',       label: 'Alimentation',  icon: '🧺' },
  { layer: 'bike',           label: 'Vélo',          icon: '🚲' },
]

interface LiveFiltersDrawerProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  accommodationPois?: Poi[]
}

export function LiveFiltersDrawer({ open, onOpenChange, accommodationPois }: LiveFiltersDrawerProps) {
  const { visibleLayers, weatherActive, densityColorEnabled, activeAccommodationTypes } = useMapStore()
  const searchRadiusKm = useLiveStore((s) => s.searchRadiusKm)
  const setSearchRadius = useLiveStore((s) => s.setSearchRadius)

  // Count POIs per accommodation sub-type — null when no data (no badge shown)
  const accCountByType = computeAccCountByType(accommodationPois)

  // Local state — only committed on "Appliquer"
  const [localLayers, setLocalLayers] = useState<Set<MapLayer>>(new Set(visibleLayers))
  const [localWeather, setLocalWeather] = useState(weatherActive)
  const [localDensity, setLocalDensity] = useState(densityColorEnabled)
  const [localAccTypes, setLocalAccTypes] = useState<Set<PoiCategory>>(new Set(activeAccommodationTypes))
  const [localRadius, setLocalRadius] = useState(searchRadiusKm)

  // Reinitialize local state from stores when drawer opens
  useEffect(() => {
    if (open) {
      setLocalLayers(new Set(visibleLayers))
      setLocalWeather(weatherActive)
      setLocalDensity(densityColorEnabled)
      setLocalAccTypes(new Set(activeAccommodationTypes))
      setLocalRadius(searchRadiusKm)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const toggleLocalLayer = (layer: MapLayer) => {
    setLocalLayers((prev) => {
      const next = new Set(prev)
      if (next.has(layer)) {
        next.delete(layer)
      } else {
        next.add(layer)
      }
      return next
    })
  }

  const toggleLocalAccType = (type: PoiCategory) => {
    setLocalAccTypes((prev) => {
      const next = new Set(prev)
      if (next.has(type)) {
        next.delete(type)
      } else {
        next.add(type)
      }
      return next
    })
  }

  const hasPoi =
    localLayers.has('accommodations') ||
    localLayers.has('restaurants') ||
    localLayers.has('supplies') ||
    localLayers.has('bike')

  const handleApply = () => {
    useMapStore.setState({
      visibleLayers: localLayers,
      weatherActive: localWeather,
      densityColorEnabled: localDensity,
      activeAccommodationTypes: localAccTypes,
    })
    setSearchRadius(localRadius)
    onOpenChange(false)
  }

  return (
    <Drawer.Root open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 bg-black/40 z-40" />
        <Drawer.Content className="fixed bottom-0 left-0 right-0 z-50 bg-background rounded-t-2xl p-4 pb-8 max-h-[85vh] overflow-y-auto">
          {/* Drag handle */}
          <div className="w-12 h-1.5 bg-[--border] rounded-full mx-auto mb-4" />
          <Drawer.Title className="text-base font-semibold mb-4">Filtres</Drawer.Title>

          {/* Section 1: Distance de la trace */}
          <div className="mb-6">
            <p className="text-xs font-medium text-[--text-secondary] mb-2">Distance de la trace</p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setLocalRadius((r) => Math.max(0.5, r - 0.5))}
                className="h-9 w-9 rounded-lg bg-muted text-muted-foreground font-bold text-lg flex items-center justify-center"
                aria-label="Diminuer le rayon"
              >
                —
              </button>
              <span className="font-mono text-lg font-bold w-16 text-center">{localRadius} km</span>
              <button
                onClick={() => setLocalRadius((r) => Math.min(30, r + 0.5))}
                className="h-9 w-9 rounded-lg bg-muted text-muted-foreground font-bold text-lg flex items-center justify-center"
                aria-label="Augmenter le rayon"
              >
                +
              </button>
            </div>
          </div>

          {/* Section 2: POI layers — 2×2 grid */}
          <div className="mb-4">
            <p className="text-xs font-medium text-[--text-secondary] mb-3">Calques</p>
            <div className="grid grid-cols-2 gap-2">
              {POI_LAYER_CARDS.map(({ layer, label, icon }) => {
                const isActive = localLayers.has(layer)
                return (
                  <button
                    key={layer}
                    onClick={() => toggleLocalLayer(layer)}
                    aria-pressed={isActive}
                    className={[
                      'flex flex-col items-center justify-center gap-1.5 rounded-2xl p-3 min-h-[64px]',
                      'text-xs font-medium transition-colors',
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground',
                    ].join(' ')}
                  >
                    <span className="text-xl leading-none" aria-hidden="true">{icon}</span>
                    <span>{label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Section 2b: Météo toggle */}
          <div className="mb-2 flex items-center justify-between px-1 py-2">
            <div className="flex items-center gap-2">
              <span className="text-base" aria-hidden="true">☁️</span>
              <span className="text-sm font-medium">Météo</span>
            </div>
            <button
              onClick={() => setLocalWeather((v) => !v)}
              aria-pressed={localWeather}
              className={[
                'text-xs px-3 py-1.5 rounded-full font-medium',
                localWeather
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground',
              ].join(' ')}
            >
              {localWeather ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Section 2c: Densité toggle */}
          <div className="mb-6 flex items-center justify-between px-1 py-2">
            <div className="flex items-center gap-2">
              <span className="text-base" aria-hidden="true">📊</span>
              <span className="text-sm font-medium">Densité</span>
            </div>
            <button
              onClick={() => setLocalDensity((v) => !v)}
              aria-pressed={localDensity}
              className={[
                'text-xs px-3 py-1.5 rounded-full font-medium',
                localDensity
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground',
              ].join(' ')}
            >
              {localDensity ? 'ON' : 'OFF'}
            </button>
          </div>

          {/* Section 3: Sub-types hébergement (conditional) */}
          {localLayers.has('accommodations') && (
            <div className="mb-6">
              <p className="text-xs font-medium text-[--text-secondary] mb-2">Type d&apos;hébergement</p>
              <div className="flex flex-wrap gap-1.5">
                {ACCOMMODATION_SUB_TYPES.map(({ type, label, icon }) => {
                  const isActive = localAccTypes.has(type)
                  const count = accCountByType ? (accCountByType[type] ?? 0) : null
                  const hasZeroResults = count !== null && count === 0
                  return (
                    <button
                      key={type}
                      onClick={() => toggleLocalAccType(type)}
                      aria-pressed={isActive}
                      className={[
                        'text-xs px-2.5 py-1 rounded-full font-medium',
                        hasZeroResults
                          ? 'bg-muted text-muted-foreground border border-[--border] opacity-60'
                          : isActive
                            ? 'bg-primary text-primary-foreground border border-transparent'
                            : 'bg-muted text-muted-foreground border border-[--border]',
                      ].join(' ')}
                    >
                      {icon} {label}{count !== null ? ` (${count})` : ''}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* Validation message */}
          {!hasPoi && (
            <p className="text-sm text-destructive text-center mb-2">
              Sélectionne au moins un type de lieu
            </p>
          )}

          {/* Apply button */}
          <button
            disabled={!hasPoi}
            onClick={handleApply}
            className="w-full h-11 bg-primary text-primary-foreground rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Appliquer les filtres
          </button>
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  )
}
