'use client'
import { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp, Search } from 'lucide-react'
import { useMapStore } from '@/stores/map.store'
import { computeElevationGain } from '@ridenrest/gpx'
import type { MapWaypoint } from '@ridenrest/shared'
import { PoiLayerGrid } from './poi-layer-grid'
import { AccommodationSubTypes } from './accommodation-sub-types'

const MAX_RANGE_KM = 50

interface SearchRangeControlProps {
  totalDistanceKm: number
  waypoints: MapWaypoint[] | null
  isPoisPending: boolean
}

// D+ cumulé de km 0 jusqu'au point de départ (fromKm) — pas la plage
function computeElevationToStart(waypoints: MapWaypoint[], fromKm: number): number | null {
  const toStart = waypoints.filter((w) => w.distKm <= fromKm)
  if (toStart.length < 2) return null
  if (toStart.every((w) => w.ele == null)) return null
  return computeElevationGain(toStart.map((w) => ({ lat: w.lat, lng: w.lng, elevM: w.ele ?? undefined })))
}

export function SearchRangeControl({ totalDistanceKm, waypoints, isPoisPending }: SearchRangeControlProps) {
  const [expanded, setExpanded] = useState(true)
  const { fromKm, toKm, setSearchRange, visibleLayers } = useMapStore()

  // rangeKm local state — default 15 km when store is at initial values (0, 30)
  const [rangeKm, setRangeKm] = useState(() =>
    fromKm === 0 && toKm === 30 ? 15 : toKm - fromKm,
  )
  const [rangeInput, setRangeInput] = useState(() =>
    fromKm === 0 && toKm === 30 ? '15' : String(toKm - fromKm),
  )

  // toKm intentionnellement absent — le D+ ne change que quand fromKm change
  const elevationGain = useMemo(
    () => (waypoints && waypoints.length >= 2 ? computeElevationToStart(waypoints, fromKm) : null),
    [waypoints, fromKm],
  )

  const applyRange = (newRange: number) => {
    const clamped = Math.min(MAX_RANGE_KM, Math.max(1, newRange))
    setRangeKm(clamped)
    setRangeInput(String(clamped))
    setSearchRange(fromKm, Math.min(fromKm + clamped, totalDistanceKm))
  }

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFrom = Number(e.target.value)
    setSearchRange(newFrom, Math.min(newFrom + rangeKm, totalDistanceKm))
  }

  const handleRangeInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRangeInput(e.target.value)
  }

  const handleRangeInputBlur = () => {
    const parsed = parseInt(rangeInput, 10)
    if (!isNaN(parsed)) {
      applyRange(parsed)
    } else {
      setRangeInput(String(rangeKm))
    }
  }

  const handleRangeInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
  }

  return (
    <div className="rounded-xl border border-[--border] overflow-hidden">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 cursor-pointer select-none"
        onClick={() => setExpanded((v) => !v)}
        data-testid="search-range-header"
      >
        <div className="flex items-center gap-2">
          <Search className="h-4 w-4" aria-hidden="true" />
          <span className="text-sm font-medium">Recherche</span>
        </div>
        <span className="text-muted-foreground" aria-hidden="true">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </div>

      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-4">
          {/* Position + D+ dynamiques */}
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span data-testid="current-position" className="font-mono font-medium text-foreground">
              {Math.round(fromKm).toLocaleString('fr')} km
            </span>
            {elevationGain != null ? (
              <span data-testid="elevation-gain" className="font-mono">
                {Math.round(elevationGain).toLocaleString('fr')}m D+
              </span>
            ) : (
              <span className="text-[--text-muted]">↑ — m D+</span>
            )}
          </div>

          {/* Slider */}
          <div className="flex flex-col gap-2">
            <input
              type="range"
              min={0}
              max={totalDistanceKm}
              step={1}
              value={fromKm}
              onChange={handleSliderChange}
              data-testid="from-km-slider"
              className="w-full"
            />
            <div className="flex justify-between">
              <span className="text-[10px] text-muted-foreground">0 km</span>
              <span className="text-[10px] text-muted-foreground">{Math.round(totalDistanceKm)} km</span>
            </div>
          </div>

          {/* POI layer cards */}
          <PoiLayerGrid isPending={isPoisPending} />

          {/* Accommodation sub-types — visible uniquement si Hébergements actif */}
          {visibleLayers.has('accommodations') && <AccommodationSubTypes />}

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
        </div>
      )}
    </div>
  )
}
