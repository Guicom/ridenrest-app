'use client'

import { useEffect } from 'react'
import { Search, SlidersHorizontal, MountainSnow, Clock, Minus, Plus } from 'lucide-react'
import { Slider } from '@/components/ui/slider'
import { useLiveStore } from '@/stores/live.store'
import { SearchOnDropdown } from '@/components/shared/search-on-dropdown'
import { useOfflineGate } from '@/hooks/use-offline-ready'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'

/** Round down to nearest multiple of step */
export function roundDownToStep(value: number, step: number): number {
  return Math.floor(value / step) * step
}

interface LiveControlsProps {
  onFiltersOpen: () => void
  onSearch: () => void
  activeFilterCount: number
  elevationGain: number | null
  elevationLoss: number | null
  /** Center point for the search area. null = Booking/Airbnb buttons disabled. */
  center: { lat: number; lng: number } | null
  /** City name for Booking.com search. If provided, uses ?ss=city instead of coordinates. */
  city?: string | null
  /** Postal code appended to city in Booking.com ?ss= param for disambiguation. */
  postcode?: string | null
  /** Region/province for Booking.com ?ss= param. */
  adminArea?: string | null
  /** Country for Booking.com ?ss= param. */
  country?: string | null
  /** Max km ahead based on remaining distance. Defaults to 100 when undefined (GPS not snapped). */
  maxAheadKm?: number
}

const SLIDER_STEP = 5
const DEFAULT_MAX = 100

export function LiveControls({ onFiltersOpen, onSearch, activeFilterCount, elevationGain, elevationLoss, center, city, postcode, adminArea, country, maxAheadKm }: LiveControlsProps) {
  const { isOnline, disabledReason } = useOfflineGate()
  const targetAheadKm = useLiveStore((s) => s.targetAheadKm)
  const speedKmh = useLiveStore((s) => s.speedKmh)
  const setTargetAheadKm = useLiveStore((s) => s.setTargetAheadKm)

  // Compute effective slider max: round down to step, minimum 5 (AC #1, #3, #4)
  const effectiveMax = Math.max(SLIDER_STEP, roundDownToStep(maxAheadKm ?? DEFAULT_MAX, SLIDER_STEP))

  // Clamp targetAheadKm when max shrinks below current value (AC #2)
  useEffect(() => {
    if (targetAheadKm > effectiveMax) {
      setTargetAheadKm(effectiveMax)
    }
  }, [effectiveMax, targetAheadKm, setTargetAheadKm])

  const etaSummary = formatEtaSummary(targetAheadKm, speedKmh)

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 lg:right-auto lg:w-[360px] lg:bottom-4 lg:left-4 bg-white rounded-t-2xl lg:rounded-2xl shadow-lg lg:shadow-none px-4 pt-5 pb-8" data-testid="live-controls">
      {/* Header row */}
      <div className="flex items-start justify-between mb-7">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[--text-secondary]">MON HÔTEL DANS</p>
          <p className="font-mono text-4xl font-bold text-primary leading-none">{targetAheadKm} km</p>
        </div>
        <div className="flex items-center gap-3">
          {/* D+/ETA info — slightly left to make room for filters icon */}
          <div className="flex flex-col items-end gap-0.5 text-right">
            <div className="flex items-center gap-1">
              <span className="font-mono text-sm font-bold" data-testid="elevation-gain-display">
                {elevationGain != null ? `D+ ${Math.round(elevationGain)}m` : '—'}
                {elevationLoss != null ? ` · D- ${Math.round(elevationLoss)}m` : ''}
              </span>
              <MountainSnow className="h-3.5 w-3.5 text-[--text-secondary]" aria-hidden="true" />
            </div>
            <div className="flex items-center gap-1">
              <span className="font-mono text-sm font-bold" data-testid="eta-display">{etaSummary}</span>
              <Clock className="h-3.5 w-3.5 text-[--text-secondary]" aria-hidden="true" />
            </div>
          </div>
          {/* Filters icon button — moved from action row to header */}
          <button
            onClick={onFiltersOpen}
            data-testid="btn-filters"
            aria-label="Ouvrir les filtres"
            className="relative flex h-9 w-14 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground cursor-pointer transition-all duration-75 hover:brightness-90 active:scale-[0.97]"
          >
            <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
            {activeFilterCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-primary text-[10px] font-bold border border-primary">
                {activeFilterCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Distance cible slider with +/- buttons */}
      {(() => {
        const atMin = targetAheadKm <= SLIDER_STEP
        const atMax = targetAheadKm >= effectiveMax
        return (
          <div className="flex items-center gap-2 mb-8">
            <button
              onClick={() => !atMin && setTargetAheadKm(Math.max(SLIDER_STEP, targetAheadKm - SLIDER_STEP))}
              disabled={atMin}
              data-testid="btn-minus"
              aria-label="Diminuer de 5 km"
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary text-primary transition-all duration-75 ${atMin ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-primary/10 active:scale-95'}`}
            >
              <Minus className="h-4 w-4" />
            </button>
            <Slider
              value={[Math.min(targetAheadKm, effectiveMax)]}
              onValueChange={(v: number | readonly number[]) => {
                const val = typeof v === 'number' ? v : v[0]
                setTargetAheadKm(val)
              }}
              min={SLIDER_STEP}
              max={effectiveMax}
              step={SLIDER_STEP}
              data-testid="slider-target"
              className="flex-1"
              thumbClassName="size-6 border-2 after:-inset-1"
            />
            <button
              onClick={() => !atMax && setTargetAheadKm(Math.min(effectiveMax, targetAheadKm + SLIDER_STEP))}
              disabled={atMax}
              data-testid="btn-plus"
              aria-label="Augmenter de 5 km"
              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-primary text-primary transition-all duration-75 ${atMax ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-primary/10 active:scale-95'}`}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>
        )
      })()}

      {/* Action buttons */}
      <div className="flex gap-3">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              onClick={isOnline ? onSearch : undefined}
              data-testid="btn-search"
              className={`flex-1 h-11 bg-primary text-primary-foreground rounded-full font-medium flex items-center justify-center gap-2 cursor-pointer transition-all duration-75 hover:brightness-90 active:scale-[0.97] ${!isOnline ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <Search className="h-4 w-4" aria-hidden="true" />
              RECHERCHER
            </TooltipTrigger>
            {!isOnline && (
              <TooltipContent>{disabledReason}</TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>
        <SearchOnDropdown center={center} city={city} postcode={postcode} adminArea={adminArea} country={country} variant="action" className="flex-1" page="live" />
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
