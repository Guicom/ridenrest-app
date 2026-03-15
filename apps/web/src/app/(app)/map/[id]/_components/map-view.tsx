'use client'
import { useQuery } from '@tanstack/react-query'
import { getAdventureMapData } from '@/lib/api-client'
import { MapCanvas } from './map-canvas'
import { LayerToggles } from './layer-toggles'
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
      {/* Layer toggles — fixed to bottom of map */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-10">
        <LayerToggles isPending={poisPending} />
      </div>
      {poisError && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-10">
          <StatusBanner message="Recherche POI indisponible — réessayer dans quelques instants." />
        </div>
      )}
    </div>
  )
}
