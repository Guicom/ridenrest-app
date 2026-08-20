'use client'

import { Pencil, Trash2 } from 'lucide-react'
import type { AdventureStageResponse } from '@ridenrest/shared'
import { computeStageArrival, formatDuration } from '@ridenrest/shared'
import { StageWeatherBadge } from '@/app/(app)/map/[id]/_components/stage-weather-badge'
import { OfflineTooltipWrapper } from '@/components/shared/offline-tooltip-wrapper'

/** Format ISO date → "jeu. 15 avril · 07:30" in French */
function formatStageDeparture(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  const weekday = d.toLocaleDateString('fr-FR', { weekday: 'short' })
  const day = d.getDate()
  const month = d.toLocaleDateString('fr-FR', { month: 'long' })
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return `${weekday} ${day} ${month} · ${time}`
}

/**
 * Durée en `~2h15` / `~45 min`.
 *
 * ⚠️ C'est une **durée**, pas une heure d'arrivée. Le cartouche l'affichait sous le label
 * « ETA » au format `~13h00`, qui se lit comme 13:00 — d'où la confusion signalée le
 * 2026-08-20 (195 km partant à 08:00 arrivent à 21:00, pas à 13:00). L'heure d'arrivée passe
 * désormais par `computeStageArrival`.
 */
function formatEta(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes < 0) return '—'
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60)
    const m = minutes % 60
    return `~${h}h${String(m).padStart(2, '0')}`
  }
  return `~${minutes} min`
}

/** "21:00", ou "ven. 21 août · 01:00" quand l'arrivée tombe le lendemain. */
function formatArrival(iso: string, nextDay: boolean): string {
  const d = new Date(iso)
  const time = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  if (!nextDay) return time
  const weekday = d.toLocaleDateString('fr-FR', { weekday: 'short' })
  const day = d.getDate()
  const month = d.toLocaleDateString('fr-FR', { month: 'long' })
  return `${weekday} ${day} ${month} · ${time}`
}

interface StageCardProps {
  stage: AdventureStageResponse
  mode: 'planning' | 'live'
  /** Live mode: is this the current stage based on GPS? */
  isCurrent?: boolean
  /** Live mode: is this stage already passed? */
  isPassed?: boolean
  /** Live mode: ETA in minutes from current position to stage end */
  etaFromCurrentMinutes?: number | null
  /** Weather badge visibility */
  weatherActive?: boolean
  /** Whether stages have individual departures (controls weather badge) */
  stagesHaveDepartures?: boolean
  /** Global departure time fallback */
  departureTime?: string | null
  /** Speed for weather computation */
  speedKmh?: number
  /** Callbacks (planning only) */
  onEdit?: (stage: AdventureStageResponse) => void
  onDelete?: (stage: AdventureStageResponse) => void
}

export function StageCard({
  stage,
  mode,
  isCurrent = false,
  isPassed = false,
  etaFromCurrentMinutes,
  weatherActive = false,
  stagesHaveDepartures = false,
  departureTime,
  speedKmh,
  onEdit,
  onDelete,
}: StageCardProps) {
  const isPlanning = mode === 'planning'
  // `etaMinutes` est une DURÉE (roulage + pause) : l'heure d'arrivée s'en déduit, elle n'est
  // pas stockée. Sans départ renseigné, seule la durée est connaissable.
  const arrival = computeStageArrival(stage.departureTime, stage.etaMinutes)

  // Container classes — live mode conditional styles
  let containerClass = 'flex flex-col gap-1 rounded-md border p-2'
  if (!isPlanning) {
    if (isCurrent) {
      containerClass += ' border-2 border-primary bg-primary/5'
    } else if (isPassed) {
      containerClass += ' opacity-50'
    } else {
      containerClass += ' border-[--border]'
    }
  } else {
    containerClass += ' border-[--border]'
  }

  // Line 3 content
  const showDepartureTime = isPlanning && stage.departureTime
  const showEta = !isPlanning && etaFromCurrentMinutes != null
  const showWeather = weatherActive && !stagesHaveDepartures
  const hasLine3 = showDepartureTime || showEta || showWeather

  return (
    <div className={containerClass} data-testid={`stage-item-${stage.id}`}>
      {/* Line 1: dot + name + action buttons (planning only) */}
      <div className="flex items-center gap-2">
        <div
          className="h-3 w-3 rounded-full shrink-0"
          style={{ backgroundColor: stage.color }}
          aria-hidden="true"
        />
        <span className="flex-1 truncate text-sm font-medium">{stage.name}</span>
        {isPlanning && (
          <>
            <OfflineTooltipWrapper>
              <button
                onClick={() => onEdit?.(stage)}
                aria-label={`Modifier ${stage.name}`}
                className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors active:scale-[0.85]"
                data-testid={`edit-stage-${stage.id}`}
              >
                <Pencil className="h-3 w-3" />
              </button>
            </OfflineTooltipWrapper>
            <OfflineTooltipWrapper>
              <button
                onClick={() => onDelete?.(stage)}
                aria-label={`Supprimer ${stage.name}`}
                className="text-muted-foreground hover:text-destructive cursor-pointer transition-colors active:scale-[0.85]"
                data-testid={`delete-stage-${stage.id}`}
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </OfflineTooltipWrapper>
          </>
        )}
      </div>

      {/* Line 2: km + D+ · D- */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground pl-5">
        <span>{stage.distanceKm.toFixed(1)} km</span>
        <span>·</span>
        <span>↑ {stage.elevationGainM !== null ? `${stage.elevationGainM} m` : '—'}</span>
        <span>·</span>
        <span>↓ {stage.elevationLossM !== null ? `${stage.elevationLossM} m` : '—'}</span>
      </div>

      {/* Line 3: date/time (planning) or ETA (live) + weather badge */}
      {hasLine3 && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-5">
          {showDepartureTime && (
            <span>{formatStageDeparture(stage.departureTime!)}</span>
          )}
          {showEta && (
            <span>dans {formatEta(etaFromCurrentMinutes!)}</span>
          )}
          {showWeather && (
            <StageWeatherBadge
              stageId={stage.id}
              stageDepartureTime={stage.departureTime}
              departureTime={departureTime ?? undefined}
              speedKmh={speedKmh}
            />
          )}
        </div>
      )}

      {/* Line 4: heure d'arrivée (si le départ est connu) + durée */}
      {isPlanning && stage.etaMinutes != null && (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-5">
          <span>
            {arrival
              ? `Arrivée ${formatArrival(arrival.iso, arrival.nextDay)} · ${formatDuration(stage.etaMinutes)} de trajet`
              : `Durée ${formatDuration(stage.etaMinutes)}`}
            {stage.pauseHours != null && stage.pauseHours > 0 && (
              <> (dont {formatDuration(stage.pauseHours * 60)} de pause)</>
            )}
          </span>
        </div>
      )}

    </div>
  )
}
