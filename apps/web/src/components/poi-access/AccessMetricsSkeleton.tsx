import { Skeleton } from '@/components/ui/skeleton'

/**
 * Skeleton dédié au chargement des métriques d'accès (cf. project-context §Loading
 * States — toujours un `<Skeleton />`, jamais un spinner générique).
 *
 * Reflète le rendu final de `AccessMetrics` selon la variante :
 * - `full` : title (h-6) + ligne distance + D+ + D- (h-4 chacune)
 * - `compact` : une seule ligne distance (h-4) — évite le flash de layout dans le popup
 * - `stats` : rangée 4 colonnes (distance / D+ / D- / temps) — icône au-dessus de la valeur
 */
export function AccessMetricsSkeleton({
  variant = 'full',
}: {
  variant?: 'full' | 'compact' | 'stats'
}) {
  if (variant === 'compact') {
    return <Skeleton className="h-4 w-16" data-testid="access-metrics-skeleton" />
  }

  if (variant === 'stats') {
    return (
      <div className="px-4 py-3 grid grid-cols-4 gap-2" data-testid="access-metrics-skeleton">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-1">
            <Skeleton className="h-4 w-4" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="space-y-2" data-testid="access-metrics-skeleton">
      <Skeleton className="h-6 w-40" />
      <div className="flex items-center gap-4">
        <Skeleton className="h-4 w-16" />
        <Skeleton className="h-4 w-14" />
        <Skeleton className="h-4 w-14" />
      </div>
    </div>
  )
}
