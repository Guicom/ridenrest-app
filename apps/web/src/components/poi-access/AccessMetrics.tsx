'use client'
import { TrendingUp, TrendingDown, Milestone, Clock, Route, TriangleAlert } from 'lucide-react'
import type { AccessOrigin, AccessVariant, PoiCategory } from '@ridenrest/shared'
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
  /** Variante d'accès sélectionnée (état détenu par la page, partagé avec la carte). */
  selectedVariantIndex?: number
  onSelectVariant?: (index: number) => void
}

export function AccessMetrics({
  poiId,
  origin,
  category,
  fallbackDistanceM,
  variant = 'full',
  speedKmh,
  selectedVariantIndex = 0,
  onSelectVariant,
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

  // status === 'ok' — on affiche la variante SÉLECTIONNÉE (l'utilisateur peut en changer).
  const variants = usableData.variants
  const sel = Math.min(Math.max(selectedVariantIndex, 0), variants.length - 1)
  const active = variants[sel]
  const distance = formatAccessDistance(active.distanceM)

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-2.5 text-sm" data-testid="access-metrics-compact">
        <span className="font-medium text-[--text-primary]">{distance}</span>
        <span className="flex items-center gap-0.5 text-[--text-secondary]">
          <TrendingUp className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          {formatAccessElevation(active.elevationGainM)}
        </span>
        <span className="flex items-center gap-0.5 text-[--text-secondary]">
          <TrendingDown className="h-3.5 w-3.5 text-primary" aria-hidden="true" />
          {formatAccessElevation(active.elevationLossM)}
        </span>
      </div>
    )
  }

  if (variant === 'stats') {
    // Rangée 4 colonnes : icône au-dessus de la donnée (distance / D+ / D- / temps).
    const eta = formatAccessEta(active.distanceM / 1000, speedKmh ?? 0)
    const cell = 'flex flex-col items-center gap-0.5'
    const val = 'text-xs font-medium text-[--text-primary]'
    return (
      <>
        <div className="px-4 py-3 grid grid-cols-4 gap-2 text-center" data-testid="access-metrics-stats">
          <div className={cell}>
            <Milestone className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className={val}>{distance}</span>
          </div>
          <div className={cell}>
            <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className={val}>{formatAccessElevation(active.elevationGainM)} D+</span>
          </div>
          <div className={cell}>
            <TrendingDown className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className={val}>{formatAccessElevation(active.elevationLossM)} D-</span>
          </div>
          <div className={cell}>
            <Clock className="h-4 w-4 text-primary" aria-hidden="true" />
            <span className={val}>{eta}</span>
          </div>
        </div>
        <VariantSelector variants={variants} selected={sel} speedKmh={speedKmh} onSelect={onSelectVariant} />
      </>
    )
  }

  return (
    <div className="space-y-1" data-testid="access-metrics-full">
      <p className="text-sm font-medium text-[--text-primary]">{getAccessLabel(category)}</p>
      <div className="flex items-center gap-4 text-sm text-[--text-secondary]">
        <span className="font-medium text-[--text-primary]">{distance}</span>
        <span className="flex items-center gap-1">
          <TrendingUp className="h-4 w-4 text-primary" aria-hidden="true" />
          {formatAccessElevation(active.elevationGainM)} D+
        </span>
        <span className="flex items-center gap-1">
          <TrendingDown className="h-4 w-4 text-primary" aria-hidden="true" />
          {formatAccessElevation(active.elevationLossM)} D-
        </span>
      </div>
      <VariantSelector variants={variants} selected={sel} speedKmh={speedKmh} onSelect={onSelectVariant} />
    </div>
  )
}

/** Distance compacte pour les cellules de variante : "740 m" en deçà du km, "1,4" au-delà. */
function compactDistance(distanceM: number): string {
  if (Math.round(distanceM) < 1000) return `${Math.round(distanceM)} m`
  return (distanceM / 1000).toFixed(1).replace('.', ',')
}

/** ETA compacte type "~5'" / "~1h05" (vélo, distance/vitesse — cohérent avec la rangée stats). */
function compactEta(distanceM: number, speedKmh?: number): string {
  const speed = speedKmh ?? 0
  if (speed <= 0 || distanceM <= 0) return '—'
  const min = Math.round((distanceM / 1000 / speed) * 60)
  if (min < 1) return "<1'"
  const h = Math.floor(min / 60)
  const mm = min % 60
  return h > 0 ? `~${h}h${String(mm).padStart(2, '0')}` : `~${min}'`
}

/**
 * Sélecteur d'itinéraire d'accès : une cellule cliquable par variante (distance + ETA), la
 * sélectionnée en carte blanche ambre. Masqué s'il n'y a qu'une variante ou si la sélection
 * n'est pas câblée. Synchronisé avec la carte (fantômes cliquables) via le même état `selected`.
 */
function VariantSelector({
  variants,
  selected,
  speedKmh,
  onSelect,
}: {
  variants: AccessVariant[]
  selected: number
  speedKmh?: number
  onSelect?: (index: number) => void
}) {
  if (variants.length <= 1 || !onSelect) return null
  return (
    <div className="px-4 pb-3" data-testid="access-variant-selector">
      <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-[--text-secondary]">
        <Route className="h-3.5 w-3.5" aria-hidden="true" />
        Itinéraires
      </div>
      <div
        role="radiogroup"
        aria-label="Choix de l'itinéraire d'accès"
        className="flex gap-1.5 rounded-xl bg-muted p-1.5"
      >
        {variants.map((v, i) => {
          const isActive = i === selected
          return (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={isActive}
              aria-label={
                `Itinéraire ${i + 1} : ${formatAccessDistance(v.distanceM)}, ${formatAccessEta(v.distanceM / 1000, speedKmh ?? 0)}` +
                (v.usesMainRoad ? ' — passe par une route nationale' : '')
              }
              onClick={() => onSelect?.(i)}
              // Chaque option a un fond + bordure au repos → lisiblement cliquable sans survol
              // (mobile). La sélectionnée ressort en ambre + ombre ; `active:scale` = retour
              // tactile au tap. Bordure sur les deux états → pas de saut de layout à la sélection.
              className={
                'relative flex flex-1 flex-col items-center rounded-lg border px-2 py-2 leading-tight transition active:scale-95 ' +
                (isActive
                  ? 'border-amber-500 bg-background font-semibold text-amber-600 shadow-sm'
                  : 'border-[--border] bg-background/60 text-[--text-primary] shadow-sm hover:border-amber-300 hover:bg-background hover:text-amber-600')
              }
            >
              {/* Indicateur danger : l'itinéraire emprunte une route nationale (highway=trunk). */}
              {v.usesMainRoad && (
                <TriangleAlert
                  className="absolute right-1 top-1 h-3.5 w-3.5 text-red-500"
                  aria-hidden="true"
                />
              )}
              <span className="text-xs">{compactDistance(v.distanceM)} km</span>
              <span className={'text-xs ' + (isActive ? 'text-amber-600/80' : 'text-[--text-secondary]')}>
                {compactEta(v.distanceM, speedKmh)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
