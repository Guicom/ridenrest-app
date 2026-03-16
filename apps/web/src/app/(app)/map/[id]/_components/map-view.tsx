'use client'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getAdventureMapData } from '@/lib/api-client'
import { MapCanvas } from './map-canvas'
import { LayerToggles } from './layer-toggles'
import { SearchRangeSlider } from './search-range-slider'
import { StatusBanner } from '@/components/shared/status-banner'
import { Skeleton } from '@/components/ui/skeleton'
import { usePois } from '@/hooks/use-pois'
import type { AdventureMapResponse } from '@/lib/api-client'

interface MapViewProps {
  adventureId: string
}

export function MapView({ adventureId }: MapViewProps) {
  const { data, isPending, error } = useQuery<AdventureMapResponse>({
    queryKey: ['adventures', adventureId, 'map'],
    queryFn: () => getAdventureMapData(adventureId),
    staleTime: 0,
    // Poll every 3s while any segment is still processing — stops once all are done or errored
    refetchInterval: (query) => {
      const segments = query.state.data?.segments
      if (!segments) return false
      return segments.some((s) => s.parseStatus === 'pending' || s.parseStatus === 'processing')
        ? 3000
        : false
    },
  })

  // usePois must be called unconditionally (Rules of Hooks) — pass empty array before data loads
  const readySegments = data?.segments.filter((s) => s.parseStatus === 'done') ?? []
  const { poisByLayer, isPending: poisPending, hasError: poisError } = usePois(readySegments)

  const queryClient = useQueryClient()

  // Retry handler — invalidates all POI queries for the current adventure segments
  const handlePoiRetry = () => {
    readySegments.forEach((s) => {
      queryClient.invalidateQueries({ queryKey: ['pois', { segmentId: s.id }], exact: false })
    })
  }

  if (isPending) return <Skeleton className="h-full w-full" />

  if (error) {
    return (
      <StatusBanner message="Impossible de charger la carte — vérifie ta connexion." />
    )
  }

  const pendingCount = data.segments.filter(
    (s) => s.parseStatus === 'pending' || s.parseStatus === 'processing',
  ).length

  const errorCount = data.segments.filter((s) => s.parseStatus === 'error').length

  return (
    <div className="relative h-full w-full">
      {pendingCount > 0 && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10">
          <StatusBanner
            message={`${pendingCount} segment(s) en cours de traitement — ils apparaîtront automatiquement une fois prêts.`}
          />
        </div>
      )}
      {errorCount > 0 && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10" style={{ marginTop: pendingCount > 0 ? '3rem' : 0 }}>
          <StatusBanner
            message={`${errorCount} segment(s) n'ont pas pu être analysés — vérifiez le format GPX.`}
          />
        </div>
      )}
      <MapCanvas
        segments={readySegments}
        adventureName={data.adventureName}
        poisByLayer={poisByLayer}
      />

      {/* Layer toggles — bottom center */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
        <LayerToggles isPending={poisPending} />
      </div>

      {/* Search range slider — top right */}
      <div className="absolute top-4 right-4 z-10">
        <SearchRangeSlider totalDistanceKm={data.totalDistanceKm} />
      </div>

      {poisError && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-1">
          <StatusBanner message="Recherche indisponible — réessayer dans quelques instants." />
          <button
            onClick={handlePoiRetry}
            className="text-xs text-zinc-500 underline hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            Réessayer
          </button>
        </div>
      )}
    </div>
  )
}
