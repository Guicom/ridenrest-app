'use client'
import { useState, useMemo } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { useMapStore } from '@/stores/map.store'
import { computeElevationGain } from '@ridenrest/gpx'
import type { MapWaypoint } from '@ridenrest/shared'

interface SearchRangeControlProps {
  totalDistanceKm: number
  waypoints: MapWaypoint[] | null
}

function computeRangeElevation(waypoints: MapWaypoint[], fromKm: number, toKm: number): number | null {
  const inRange = waypoints.filter((w) => w.distKm >= fromKm && w.distKm <= toKm)
  if (inRange.length < 2) return null
  if (inRange.every((w) => w.ele == null)) return null
  return computeElevationGain(inRange.map((w) => ({ lat: w.lat, lng: w.lng, elevM: w.ele ?? undefined })))
}

export function SearchRangeControl({ totalDistanceKm, waypoints }: SearchRangeControlProps) {
  const [expanded, setExpanded] = useState(true)
  const { fromKm, toKm, setSearchRange } = useMapStore()

  // rangeKm local state — default 15 km when store is at initial values (0, 30)
  const [rangeKm, setRangeKm] = useState(() =>
    fromKm === 0 && toKm === 30 ? 15 : toKm - fromKm,
  )

  const elevationGain = useMemo(
    () => (waypoints && waypoints.length >= 2 ? computeRangeElevation(waypoints, fromKm, toKm) : null),
    [waypoints, fromKm, toKm],
  )

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newFrom = Number(e.target.value)
    setSearchRange(newFrom, Math.min(newFrom + rangeKm, totalDistanceKm))
  }

  const handleRangeDecrement = () => {
    const newRange = Math.max(1, rangeKm - 1)
    setRangeKm(newRange)
    setSearchRange(fromKm, Math.min(fromKm + newRange, totalDistanceKm))
  }

  const handleRangeIncrement = () => {
    const newRange = Math.min(30, rangeKm + 1)
    setRangeKm(newRange)
    setSearchRange(fromKm, Math.min(fromKm + newRange, totalDistanceKm))
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
          <span className="text-base" aria-hidden="true">🔍</span>
          <span className="text-sm font-medium">Recherche</span>
        </div>
        <span className="text-muted-foreground" aria-hidden="true">
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </span>
      </div>

      {expanded && (
        <div className="px-4 pb-4 flex flex-col gap-4">
          {/* Adventure info */}
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span data-testid="total-distance" className="font-mono font-medium text-foreground">
              📍 {Math.round(totalDistanceKm).toLocaleString('fr')} km
            </span>
            {elevationGain != null ? (
              <span data-testid="elevation-gain" className="font-mono">
                ↑ {Math.round(elevationGain).toLocaleString('fr')} m D+
              </span>
            ) : (
              <span className="text-[--text-muted]">↑ — m D+</span>
            )}
          </div>

          {/* Slider */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Plage de recherche
              </p>
              <span
                className="text-xs font-mono font-bold bg-primary/10 text-primary px-2 py-0.5 rounded-full"
                data-testid="range-badge"
              >
                {rangeKm} km
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={totalDistanceKm}
              step={1}
              value={fromKm}
              onChange={handleSliderChange}
              data-testid="from-km-slider"
              className="w-full accent-primary cursor-pointer"
            />
            <div className="flex justify-between">
              <span className="text-[10px] text-muted-foreground">0 km</span>
              <span className="text-[10px] text-muted-foreground">{Math.round(totalDistanceKm)} km</span>
            </div>
          </div>

          {/* Range stepper */}
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Rechercher sur</span>
            <div className="flex items-center gap-2">
              <button
                onClick={handleRangeDecrement}
                data-testid="range-decrement"
                aria-label="Diminuer la plage"
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-sm font-bold text-foreground hover:bg-muted/80 disabled:opacity-50"
                disabled={rangeKm <= 1}
              >
                —
              </button>
              <span className="font-mono text-sm font-bold w-14 text-center" data-testid="range-value">
                {rangeKm} km
              </span>
              <button
                onClick={handleRangeIncrement}
                data-testid="range-increment"
                aria-label="Augmenter la plage"
                className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted text-sm font-bold text-foreground hover:bg-muted/80 disabled:opacity-50"
                disabled={rangeKm >= 30}
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
