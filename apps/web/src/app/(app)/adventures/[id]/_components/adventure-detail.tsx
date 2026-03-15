'use client'

import { useQuery } from '@tanstack/react-query'
import { getAdventure, listSegments } from '@/lib/api-client'
import { GpxUploadForm } from './gpx-upload-form'
import { SegmentCard } from './segment-card'

interface Props {
  adventureId: string
}

export function AdventureDetail({ adventureId }: Props) {
  const { data: adventure, isPending: adventureLoading } = useQuery({
    queryKey: ['adventures', adventureId],
    queryFn: () => getAdventure(adventureId),
  })

  const { data: segments = [] } = useQuery({
    queryKey: ['adventures', adventureId, 'segments'],
    queryFn: () => listSegments(adventureId),
    // Poll every 3s while any segment is pending or processing
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return false
      return data.some(
        (s) => s.parseStatus === 'pending' || s.parseStatus === 'processing',
      )
        ? 3000
        : false
    },
  })

  if (adventureLoading) {
    return <div className="animate-pulse h-32 bg-muted rounded-lg m-4" />
  }

  if (!adventure) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        Aventure introuvable.
      </div>
    )
  }

  return (
    <main className="container mx-auto max-w-4xl p-4 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{adventure.name}</h1>
        <p className="text-muted-foreground text-sm">
          {adventure.totalDistanceKm > 0
            ? `${adventure.totalDistanceKm.toFixed(1)} km total`
            : 'Distance à calculer'}
        </p>
      </div>

      <section>
        <h2 className="text-lg font-semibold mb-3">Segments</h2>
        {segments.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Aucun segment. Ajoutez un fichier GPX pour démarrer.
          </p>
        ) : (
          <div className="space-y-2">
            {segments.map((segment) => (
              <SegmentCard key={segment.id} segment={segment} />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">Ajouter un segment GPX</h2>
        <GpxUploadForm adventureId={adventureId} />
      </section>
    </main>
  )
}
