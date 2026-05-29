'use client'
import { TrendingUp, TrendingDown } from 'lucide-react'
import type { AccessOrigin, PoiCategory } from '@ridenrest/shared'
import { getAccessLabel } from '@/lib/poi-labels'
import { useAccess } from './useAccess'
import { AccessMetricsSkeleton } from './AccessMetricsSkeleton'
import { AccessFallback } from './AccessFallback'
import { formatAccessDistance, formatAccessElevation } from './format'

/**
 * Métriques d'accès cyclable réel vers un POI d'hébergement (Story 2.4).
 *
 * - `full` (POI detail sheet) : title contextualisé + distance + D+ + D-
 * - `compact` (popup) : distance seule
 *
 * Le hook `useAccess` est lazy : ce composant ne doit être monté que lorsque le
 * conteneur (sheet/popup) est ouvert (cf. Discovery #3 — pas de fetch silencieux).
 */
interface AccessMetricsProps {
  poiId: string
  origin: AccessOrigin
  category: PoiCategory | null
  fallbackDistanceM?: number
  variant?: 'full' | 'compact'
}

export function AccessMetrics({
  poiId,
  origin,
  category,
  fallbackDistanceM,
  variant = 'full',
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
      <p className="text-sm font-medium text-[--text-primary]" data-testid="access-metrics-compact">
        {distance}
      </p>
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
