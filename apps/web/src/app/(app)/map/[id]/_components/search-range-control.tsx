'use client'
import { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp, Minus, Plus, Search } from 'lucide-react'
import { useMapStore } from '@/stores/map.store'
import { getCorridorCenter } from '@/lib/booking-url'
import { SearchOnDropdown } from '@/components/shared/search-on-dropdown'
import { useReverseCity } from '@/hooks/use-reverse-city'
import { computeElevationGain, computeElevationLoss } from '@ridenrest/gpx'
import { MAX_SEARCH_RANGE_KM } from '@ridenrest/shared'
import { useOfflineGate } from '@/hooks/use-offline-ready'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import type { MapWaypoint, Poi, AdventureStageResponse } from '@ridenrest/shared'
import { PoiLayerGrid } from './poi-layer-grid'
import { AccommodationSubTypes } from './accommodation-sub-types'
import { SectionTooltip } from '@/components/shared/section-tooltip'

const MAX_RANGE_KM = MAX_SEARCH_RANGE_KM

interface SearchRangeControlProps {
  totalDistanceKm: number
  waypoints: MapWaypoint[] | null
  isPoisPending: boolean
  accommodationPois?: Poi[]
  stages?: AdventureStageResponse[]
}

// D+ cumulé de km 0 jusqu'au point fromKm
function computeElevationToStart(waypoints: MapWaypoint[], fromKm: number): number | null {
  const toStart = waypoints.filter((w) => w.distKm <= fromKm)
  if (toStart.length < 2) return null
  if (toStart.every((w) => w.ele == null)) return null
  return computeElevationGain(toStart.map((w) => ({ lat: w.lat, lng: w.lng, elevM: w.ele ?? undefined })))
}

// D+ sur la plage [fromKm, toKm] — pour le mode étape (référentiel relatif)
function computeElevationInRange(waypoints: MapWaypoint[], fromKm: number, toKm: number): number | null {
  const inRange = waypoints.filter((w) => w.distKm >= fromKm && w.distKm <= toKm)
  if (inRange.length < 2) return null
  if (inRange.every((w) => w.ele == null)) return null
  return computeElevationGain(inRange.map((w) => ({ lat: w.lat, lng: w.lng, elevM: w.ele ?? undefined })))
}

function computeLossToStart(waypoints: MapWaypoint[], fromKm: number): number | null {
  const toStart = waypoints.filter((w) => w.distKm <= fromKm)
  if (toStart.length < 2) return null
  if (toStart.every((w) => w.ele == null)) return null
  return computeElevationLoss(toStart.map((w) => ({ lat: w.lat, lng: w.lng, elevM: w.ele ?? undefined })))
}

function computeLossInRange(waypoints: MapWaypoint[], fromKm: number, toKm: number): number | null {
  const inRange = waypoints.filter((w) => w.distKm >= fromKm && w.distKm <= toKm)
  if (inRange.length < 2) return null
  if (inRange.every((w) => w.ele == null)) return null
  return computeElevationLoss(inRange.map((w) => ({ lat: w.lat, lng: w.lng, elevM: w.ele ?? undefined })))
}

export function SearchRangeControl({
  totalDistanceKm, waypoints, isPoisPending, accommodationPois, stages,
}: SearchRangeControlProps) {
  const [expanded, setExpanded] = useState(true)
  const {
    fromKm, toKm, setSearchRange, visibleLayers, selectedStageId, setSelectedStageId,
    setSearchCommitted, searchCommitted,
  } = useMapStore()

  // Corridor center for reverse geocoding — only when search is committed with accommodations layer
  const corridorCenter = useMemo(
    () =>
      searchCommitted && visibleLayers.has('accommodations') && waypoints && waypoints.length > 0
        ? getCorridorCenter(waypoints, (fromKm + toKm) / 2)
        : null,
    [searchCommitted, visibleLayers, waypoints, fromKm, toKm],
  )
  const { city: corridorCity, postcode: corridorPostcode, state: corridorState, country: corridorCountry } = useReverseCity(corridorCenter)
  const { isOnline, disabledReason } = useOfflineGate()

  // rangeKm local state — initialized from store values
  const [rangeKm, setRangeKm] = useState(() => toKm - fromKm)
  const [rangeInput, setRangeInput] = useState(() => String(toKm - fromKm))

  // Derive selected stage — drives the relative coordinate mode
  const selectedStage = useMemo(
    () => (selectedStageId && stages ? (stages.find((s) => s.id === selectedStageId) ?? null) : null),
    [selectedStageId, stages],
  )
  const stageEndKm = selectedStage?.endKm ?? null

  // km relatif depuis le début de l'étape (0 au stage endpoint, croît vers la droite)
  const relativeKm = stageEndKm != null ? Math.max(0, fromKm - stageEndKm) : null

  // D+ : depuis km 0 en mode normal, depuis stageEndKm en mode étape
  const elevationGain = useMemo(() => {
    if (!waypoints || waypoints.length < 2) return null
    if (stageEndKm != null) return computeElevationInRange(waypoints, stageEndKm, fromKm)
    return computeElevationToStart(waypoints, fromKm)
  }, [waypoints, fromKm, stageEndKm])

  // D- : même logique que D+
  const elevationLoss = useMemo(() => {
    if (!waypoints || waypoints.length < 2) return null
    if (stageEndKm != null) return computeLossInRange(waypoints, stageEndKm, fromKm)
    return computeLossToStart(waypoints, fromKm)
  }, [waypoints, fromKm, stageEndKm])

  const applyRange = (newRange: number) => {
    const clamped = Math.min(MAX_RANGE_KM, Math.max(1, newRange))
    setRangeKm(clamped)
    setRangeInput(String(clamped))
    setSelectedStageId(null)  // AC5 — manual range change clears stage mode
    setSearchRange(fromKm, Math.min(fromKm + clamped, totalDistanceKm))
  }

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const sliderValue = Number(e.target.value)
    // En mode étape : sliderValue est relatif à stageEndKm → convertir en absolu
    const newFrom = stageEndKm != null ? stageEndKm + sliderValue : sliderValue
    const newTo = Math.min(newFrom + rangeKm, totalDistanceKm)
    // Sync rangeKm display when clamped at end of trace (M3 fix)
    const effectiveRange = Math.round(newTo - newFrom)
    if (effectiveRange < rangeKm) {
      setRangeKm(effectiveRange)
      setRangeInput(String(effectiveRange))
    }
    setSearchRange(newFrom, newTo)
  }

  const handleStageSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const stageId = e.target.value
    if (!stageId) {
      setSelectedStageId(null)
      return
    }
    const stage = stages?.find((s) => s.id === stageId)
    if (!stage) return
    // Le slider démarre à 0 (= stage.endKm en absolu) — pas de décalage ±5
    const from = stage.endKm
    const to = Math.min(totalDistanceKm, stage.endKm + rangeKm)
    // Sync rangeKm display when clamped at end of trace (M3 fix)
    const effectiveRange = Math.round(to - from)
    if (effectiveRange < rangeKm) {
      setRangeKm(effectiveRange)
      setRangeInput(String(effectiveRange))
    }
    setSelectedStageId(stageId)
    setSearchRange(from, to)
  }

  const handleRangeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRangeInput(e.target.value)
  }

  const handleRangeInputBlur = () => {
    const parsed = parseInt(rangeInput, 10)
    if (!isNaN(parsed) && parsed !== rangeKm) {
      applyRange(parsed)
    } else {
      setRangeInput(String(rangeKm))
    }
  }

  const handleRangeInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
  }

  // Valeurs affichées selon le mode
  const displayKm = relativeKm != null ? Math.round(relativeKm) : Math.round(fromKm)
  const sliderMax = stageEndKm != null ? Math.max(0, totalDistanceKm - stageEndKm) : totalDistanceKm
  const sliderValue = relativeKm != null ? relativeKm : fromKm

  return (
    // overflow-hidden intentionally omitted: SearchOnDropdown renders an absolute dropdown
    // that must not be clipped by this container
    <div className="rounded-xl border border-[--border]">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
        data-testid="search-range-header"
      >
        <SectionTooltip content="Définissez une plage kilométrique sur la trace. Cliquez 'Rechercher' pour afficher les hébergements, restaurants et autres POIs dans ce corridor. ATTENTION: les résultats ne sont pas exhaustifs et ne sont pas garantis. Utilisez le bouton 'Rechercher sur' pour afficher les résultats sur Booking ou Airbnb.">
          <div className="flex items-center gap-2">
            <Search className="h-4 w-4" aria-hidden="true" />
            <span className="text-sm font-medium">Recherche</span>
          </div>
        </SectionTooltip>
        <span className="text-muted-foreground" aria-hidden="true">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </div>

      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-4">
          {/* Stage select — visible uniquement si des étapes existent */}
          {stages && stages.length > 0 && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground shrink-0">À partir :</span>
              <select
                value={selectedStageId ?? ''}
                onChange={handleStageSelect}
                data-testid="stage-select"
                className="flex-1 rounded-md border border-[--border] bg-background px-2 py-1 text-xs text-foreground focus:outline-none focus:border-primary"
              >
                <option value="">Début</option>
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>{stage.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Position + D+ dynamiques */}
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span data-testid="current-position" className="font-mono font-bold text-foreground">
              {displayKm.toLocaleString('fr')} km
            </span>
            {elevationGain != null ? (
              <span data-testid="elevation-gain" className="font-mono">
                {Math.round(elevationGain).toLocaleString('fr')}m D+
                {elevationLoss != null && ` · ${Math.round(elevationLoss).toLocaleString('fr')}m D-`}
              </span>
            ) : (
              <span className="text-[--text-muted]">↑ — m D+ · ↓ — m D-</span>
            )}
          </div>

          {/* Slider with +/- buttons */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const newValue = Math.max(0, sliderValue - 1)
                  handleSliderChange({ target: { value: String(newValue) } } as React.ChangeEvent<HTMLInputElement>)
                }}
                disabled={sliderValue <= 0}
                data-testid="slider-minus"
                aria-label="Reculer de 1 km"
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary text-primary transition-all duration-75 ${sliderValue <= 0 ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-primary/10 active:scale-95'}`}
              >
                <Minus className="h-3.5 w-3.5" />
              </button>
              <input
                type="range"
                min={0}
                max={sliderMax}
                step={1}
                value={sliderValue}
                onChange={handleSliderChange}
                data-testid="from-km-slider"
                className="flex-1"
              />
              <button
                onClick={() => {
                  const newValue = Math.min(sliderMax, sliderValue + 1)
                  handleSliderChange({ target: { value: String(newValue) } } as React.ChangeEvent<HTMLInputElement>)
                }}
                disabled={sliderValue >= sliderMax}
                data-testid="slider-plus"
                aria-label="Avancer de 1 km"
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-primary text-primary transition-all duration-75 ${sliderValue >= sliderMax ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-primary/10 active:scale-95'}`}
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex justify-between px-9">
              <span className="text-[10px] text-muted-foreground">0 km</span>
              <span className="text-[10px] text-muted-foreground">
                {stageEndKm != null
                  ? `${Math.round(totalDistanceKm - stageEndKm)} km`
                  : `${Math.round(totalDistanceKm)} km`}
              </span>
            </div>
          </div>

          {/* POI layer cards */}
          <PoiLayerGrid isPending={isPoisPending} />

          {/* Accommodation sub-types — visible uniquement si Hébergements actif */}
          {visibleLayers.has('accommodations') && <AccommodationSubTypes accommodationPois={accommodationPois} />}

          {/* Range stepper + input */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Rechercher sur</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => applyRange(rangeKm - 1)}
                data-testid="range-decrement"
                aria-label="Diminuer la plage"
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-sm font-bold text-foreground hover:bg-muted/80 disabled:opacity-50"
                disabled={rangeKm <= 1}
              >
                —
              </button>
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  inputMode="numeric"
                  value={rangeInput}
                  onChange={handleRangeInputChange}
                  onBlur={handleRangeInputBlur}
                  onKeyDown={handleRangeInputKeyDown}
                  data-testid="range-value"
                  className="font-mono text-sm font-bold w-10 text-center bg-transparent border-b border-[--border] focus:outline-none focus:border-primary"
                  aria-label="Plage en km"
                />
                <span className="font-mono text-sm font-bold">km</span>
              </div>
              <button
                onClick={() => applyRange(rangeKm + 1)}
                data-testid="range-increment"
                aria-label="Augmenter la plage"
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-sm font-bold text-foreground hover:bg-muted/80 disabled:opacity-50"
                disabled={rangeKm >= MAX_RANGE_KM}
              >
                +
              </button>
            </div>
          </div>

          {/* Search CTA — explicit trigger (AC #2) */}
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                data-testid="search-commit-btn"
                onClick={!isOnline ? undefined : () => setSearchCommitted(true)}
                disabled={isOnline && (fromKm >= toKm || totalDistanceKm === 0)}
                className={`w-full py-2 rounded-lg bg-[var(--primary)] text-white text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40 ${!isOnline ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                Rechercher
              </TooltipTrigger>
              {!isOnline && (
                <TooltipContent>{disabledReason}</TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>

          {/* Rechercher sur CTA — shown after search completes with accommodations layer active */}
          {searchCommitted && !isPoisPending && visibleLayers.has('accommodations') && (
            <SearchOnDropdown
              center={corridorCenter}
              city={corridorCity}
              postcode={corridorPostcode}
              adminArea={corridorState}
              country={corridorCountry}
              variant="outline"
              className="w-full"
              page="map"
            />
          )}
        </div>
      )}
    </div>
  )
}
