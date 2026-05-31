'use client'
import { TrendingUp, TrendingDown, Milestone, Clock } from 'lucide-react'
import type { AccessOrigin, PoiCategory } from '@ridenrest/shared'
import { getAccessLabel } from '@/lib/poi-labels'
import { useAccess } from './useAccess'
import { AccessMetricsSkeleton } from './AccessMetricsSkeleton'
import { AccessFallback } from './AccessFallback'
import { formatAccessDistance, formatAccessElevation, formatAccessEta } from './format'

/**
 * Métriques d'accès cyclable réel vers un POI d'hébergement (Story 2.4).
 *
 * - `full` (POI detail sheet) : title contextualisé + distance + D+ + D-
 * - `compact` : distance + D+ + D- en ligne
 * - `stats` (popup) : rangée 4 colonnes distance / D+ / D- / temps estimé (icône au-dessus),
 *   même style que la rangée de stats du popup. `speedKmh` requis pour l'ETA.
 *
 * Le hook `useAccess` est lazy : ce composant ne doit être monté que lorsque le
 * conteneur (sheet/popup) est ouvert (cf. Discovery #3 — pas de fetch silencieux).
 */
interface AccessMetricsProps {
  poiId: string
  origin: AccessOrigin
  category: PoiCategory | null
  fallbackDistanceM?: number
  variant?: 'full' | 'compact' | 'stats'
  /** Vitesse cycliste (km/h) pour l'ETA de la variante `stats`. */
  speedKmh?: number
}

export function AccessMetrics({
  poiId,
  origin,
  category,
  fallbackDistanceM,
  variant = 'full',
  speedKmh,
}: AccessMetricsProps) {
  const { data, isLoading } = useAccess(poiId, origin)

  if (isLoading) return <AccessMetricsSkeleton variant={variant} />

  // Un résultat `ok`/`fallback` déjà en cache reste affichable même si un refetch
  // d'arrière-plan échoue ensuite (TanStack conserve `data`). Le routage est
  // déterministe pour (poi, origin) → la donnée n'est jamais réellement périmée.
  // On ne bascule sur l'erreur que faute de donnée exploitable.
  const usableData = data && data.status !== 'error' ? data : null

  if (!usableData) {
    const message = data?.status === 'error' ? data.message : "Itinéraire d'accès indisponible"
    return (
      <p className="text-xs text-destructive" data-testid="access-error">
        {message}
      </p>
    )
  }

  if (usableData.status === 'fallback') {
    return <AccessFallback fallbackDistanceM={usableData.fallbackDistanceM ?? fallbackDistanceM ?? 0} />
  }

  // status === 'ok'
  const distance = formatAccessDistance(usableData.distanceM)

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-2.5 text-sm" data-testid="access-metrics-compact">
        <span className="font-medium text-[--text-primary]">{distance}</span>
        <span className="flex items-center gap-0.5 text-[--text-secondary]">
          <TrendingUp className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          {formatAccessElevation(usableData.elevationGainM)}
        </span>
        <span className="flex items-center gap-0.5 text-[--text-secondary]">
          <TrendingDown className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          {formatAccessElevation(usableData.elevationLossM)}
        </span>
      </div>
    )
  }

  if (variant === 'stats') {
    // Rangée 4 colonnes : icône au-dessus de la donnée (distance / D+ / D- / temps).
    const eta = formatAccessEta(usableData.distanceM / 1000, speedKmh ?? 0)
    const cell = 'flex flex-col items-center gap-0.5'
    const val = 'text-xs font-medium text-[--text-primary]'
    return (
      <div className="px-4 py-3 grid grid-cols-4 gap-2 text-center" data-testid="access-metrics-stats">
        <div className={cell}>
          <Milestone className="h-4 w-4 text-primary" aria-hidden="true" />
          <span className={val}>{distance}</span>
        </div>
        <div className={cell}>
          <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
          <span className={val}>{formatAccessElevation(usableData.elevationGainM)} D+</span>
        </div>
        <div className={cell}>
          <TrendingDown className="h-4 w-4 text-primary" aria-hidden="true" />
          <span className={val}>{formatAccessElevation(usableData.elevationLossM)} D-</span>
        </div>
        <div className={cell}>
          <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
          <span className={val}>{eta}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-1" data-testid="access-metrics-full">
      <p className="text-sm font-medium text-[--text-primary]">{getAccessLabel(category)}</p>
      <div className="flex items-center gap-4 text-sm text-[--text-secondary]">
        <span className="font-medium text-[--text-primary]">{distance}</span>
        <span className="flex items-center gap-1">
          <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
          {formatAccessElevation(usableData.elevationGainM)} D+
        </span>
        <span className="flex items-center gap-1">
          <TrendingDown className="h-4 w-4 text-primary" aria-hidden="true" />
          {formatAccessElevation(usableData.elevationLossM)} D-
        </span>
      </div>
    </div>
  )
}
