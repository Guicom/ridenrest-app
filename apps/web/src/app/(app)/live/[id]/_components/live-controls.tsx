'use client'

import { useEffect, type ReactNode } from 'react'
import { Search, SlidersHorizontal, Minus, Plus, ChevronUp, ChevronDown } from 'lucide-react'
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
  /** Max km ahead based on remaining distance. Defaults to 100 when undefined (GPS not snapped). */
  maxAheadKm?: number
  /** Whether the collapsible "PROFIL" section is open (FR-LP-002..005). */
  profileOpen: boolean
  /** Manual toggle of the "PROFIL" section via the header chevron (FR-LP-005). */
  onProfileToggle: () => void
  /** Auto-open the "PROFIL" section on first slider / +/- interaction (FR-LP-003). */
  onProfileAutoOpen: () => void
  /** Content rendered inside the collapsible "PROFIL" section (elevation profile). */
  profileContent?: ReactNode
}

const SLIDER_STEP = 5
const DEFAULT_MAX = 100

export function LiveControls({
  onFiltersOpen,
  onSearch,
  activeFilterCount,
  elevationGain,
  elevationLoss,
  center,
  city,
  maxAheadKm,
  profileOpen,
  onProfileToggle,
  onProfileAutoOpen,
  profileContent,
}: LiveControlsProps) {
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

  // Auto-open the PROFIL section on slider / +/- interaction, then apply the new value (FR-LP-003)
  const changeTarget = (value: number) => {
    onProfileAutoOpen()
    setTargetAheadKm(value)
  }

  const etaSummary = formatEtaSummary(targetAheadKm, speedKmh)

  // PROFIL section can only expand when there is content to show (Review P1)
  const hasProfile = profileContent != null
  const profileExpanded = profileOpen && hasProfile

  // Elevation metrics — join only present values so no orphan "·" separator (Review P3)
  const hasElevation = elevationGain != null || elevationLoss != null
  const elevationText = (() => {
    const parts: string[] = []
    if (elevationGain != null) parts.push(`↑ ${Math.round(elevationGain)} m`)
    if (elevationLoss != null) parts.push(`↓ ${Math.round(elevationLoss)} m`)
    return parts.length > 0 ? parts.join(' · ') : '—'
  })()

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 lg:right-auto lg:w-[360px] lg:bottom-4 lg:left-4 bg-white rounded-t-2xl lg:rounded-2xl shadow-lg lg:shadow-none px-4 pt-2 pb-6" data-testid="live-controls">
      {/* PROFIL header — chevron toggles the collapsible section (FR-LP-005), separated from the rest */}
      <button
        type="button"
        onClick={onProfileToggle}
        disabled={!hasProfile}
        data-testid="btn-profile-toggle"
        aria-expanded={hasProfile ? profileOpen : undefined}
        aria-label={profileOpen ? "Masquer le profil d'élévation" : "Afficher le profil d'élévation"}
        className={`group flex w-full min-h-[36px] items-center justify-between py-1 text-[--text-secondary] ${hasProfile ? 'cursor-pointer' : 'cursor-not-allowed opacity-60'}`}
      >
        <span className="text-xs font-medium uppercase tracking-wide">PROFIL</span>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-colors group-hover:bg-primary/15 group-focus-visible:bg-primary/15">
          {profileOpen ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" /> : <ChevronUp className="h-3.5 w-3.5" aria-hidden="true" />}
        </span>
      </button>

      {/* Collapsible PROFIL section — smooth height transition (NFR-LP-004), pattern map-view.tsx.
          aria-hidden when collapsed/empty so its content isn't announced while hidden (Review P2). */}
      <div
        data-testid="profile-section"
        aria-hidden={!profileExpanded}
        className={`overflow-hidden transition-all duration-200 ${profileExpanded ? 'h-[80px] mb-[5px]' : 'h-0'}`}
      >
        {profileContent}
      </div>

      {/* MON HÔTEL DANS + filters icon — separator sits between the profile and the rest */}
      <div data-testid="profile-separator" className="m-0 flex items-start justify-between border-t border-[--border] pt-2">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-[--text-secondary]">MON HÔTEL DANS</p>
          <p className="font-mono text-4xl font-bold text-primary leading-none">{targetAheadKm} km</p>
        </div>
        {/* Filters icon button */}
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

      {/* Distance cible slider with +/- buttons */}
      {(() => {
        const atMin = targetAheadKm <= SLIDER_STEP
        const atMax = targetAheadKm >= effectiveMax
        return (
          <div className="flex items-center gap-2 mb-3">
            <button
              onClick={() => !atMin && changeTarget(Math.max(SLIDER_STEP, targetAheadKm - SLIDER_STEP))}
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
                changeTarget(val)
              }}
              min={SLIDER_STEP}
              max={effectiveMax}
              step={SLIDER_STEP}
              data-testid="slider-target"
              className="flex-1"
              thumbClassName="size-6 border-2 after:-inset-1"
            />
            <button
              onClick={() => !atMax && changeTarget(Math.min(effectiveMax, targetAheadKm + SLIDER_STEP))}
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

      {/* Metrics — single hierarchized line ↑ D+ · ↓ D- · ~ ETA, under the slider (FR-LP-001) */}
      <div className="mb-4 flex items-center gap-2 font-mono text-sm font-bold text-[--text-primary]">
        <span data-testid="elevation-gain-display">{elevationText}</span>
        {etaSummary && (
          <span data-testid="eta-display">{hasElevation ? `· ${etaSummary}` : etaSummary}</span>
        )}
      </div>

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
        <SearchOnDropdown center={center} city={city} variant="action" className="flex-1" page="live" />
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
