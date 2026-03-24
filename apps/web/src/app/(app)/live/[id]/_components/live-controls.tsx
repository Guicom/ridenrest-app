'use client'

import { Search, SlidersHorizontal, MountainSnow, Clock } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { useLiveStore } from '@/stores/live.store'

interface LiveControlsProps {
  onFiltersOpen: () => void
  onSearch: () => void
  activeFilterCount: number
  elevationGain: number | null
}

export function LiveControls({ onFiltersOpen, onSearch, activeFilterCount, elevationGain }: LiveControlsProps) {
  const targetAheadKm = useLiveStore((s) => s.targetAheadKm)
  const speedKmh = useLiveStore((s) => s.speedKmh)
  const setTargetAheadKm = useLiveStore((s) => s.setTargetAheadKm)

  const etaSummary = formatEtaSummary(targetAheadKm, speedKmh)

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 lg:hidden bg-white rounded-t-2xl shadow-lg px-4 pt-5 pb-8" data-testid="live-controls">
      {/* Header row */}
      <div className="flex items-start justify-between mb-7">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[--text-secondary]">MON HÔTEL DANS</p>
          <p className="font-mono text-4xl font-bold text-primary leading-none">{targetAheadKm} km</p>
        </div>
        <div className="flex flex-col items-end gap-0.5 text-right">
          <div className="flex items-center gap-1">
            <span className="font-mono text-sm font-bold" data-testid="elevation-gain-display">
              {elevationGain != null ? `D+ ${Math.round(elevationGain)}m` : '—'}
            </span>
            <MountainSnow className="h-3.5 w-3.5 text-[--text-secondary]" aria-hidden="true" />
          </div>
          <div className="flex items-center gap-1">
            <span className="font-mono text-sm font-bold" data-testid="eta-display">{etaSummary}</span>
            <Clock className="h-3.5 w-3.5 text-[--text-secondary]" aria-hidden="true" />
          </div>
        </div>
      </div>

      {/* Distance cible slider */}
      <Slider
        value={[targetAheadKm]}
        onValueChange={(v: number | readonly number[]) => {
          const val = typeof v === 'number' ? v : v[0]
          setTargetAheadKm(val)
        }}
        min={5}
        max={100}
        step={5}
        data-testid="slider-target"
        className="mb-8"
        thumbClassName="size-6 border-2 after:-inset-1"
      />

      {/* Action buttons */}
      <div className="flex gap-3">
        <button
          onClick={onSearch}
          data-testid="btn-search"
          className="flex-1 h-11 bg-primary text-primary-foreground rounded-full font-medium flex items-center justify-center gap-2"
        >
          <Search className="h-4 w-4" aria-hidden="true" />
          RECHERCHER
        </button>
        <button
          onClick={onFiltersOpen}
          data-testid="btn-filters"
          className="flex-1 h-11 bg-primary text-primary-foreground rounded-full font-medium flex items-center justify-center gap-2"
        >
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          FILTERS
          {activeFilterCount > 0 && (
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-white text-primary text-[10px] font-bold">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>
    </div>
  )
}

function formatEtaSummary(distanceKm: number, speedKmh: number): string {
  if (speedKmh <= 0) return ''
  const totalMinutes = Math.round((distanceKm / speedKmh) * 60)
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return h > 0 ? `~${h}h${String(m).padStart(2, '0')}` : `~${m}min`
}
