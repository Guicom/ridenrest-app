'use client'

import { useRef, useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { getAdventure, listSegments } from '@/lib/api-client'
import { GpxUploadForm } from './gpx-upload-form'
import { SegmentCard } from './segment-card'
import type { AdventureSegmentResponse } from '@ridenrest/shared'

interface Props {
  adventureId: string
}

export const shouldPoll = (segments: Pick<AdventureSegmentResponse, 'parseStatus'>[]) =>
  segments.some((s) => s.parseStatus === 'pending' || s.parseStatus === 'processing')

export function AdventureDetail({ adventureId }: Props) {
  const prevSegmentsRef = useRef<AdventureSegmentResponse[] | undefined>(undefined)
  const [showUploadForm, setShowUploadForm] = useState(false)

  const { data: adventure, isPending: adventureLoading } = useQuery({
    queryKey: ['adventures', adventureId],
    queryFn: () => getAdventure(adventureId),
  })

  const { data: segments = [] } = useQuery({
    queryKey: ['adventures', adventureId, 'segments'],
    queryFn: () => listSegments(adventureId),
    staleTime: 0,
    // Poll every 3s while any segment is pending or processing
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return false
      return shouldPoll(data) ? 3000 : false
    },
  })

  // Transition detection — runs after every segments update
  useEffect(() => {
    const prev = prevSegmentsRef.current

    if (prev !== undefined) {
      for (const seg of segments) {
        const prevSeg = prev.find((s) => s.id === seg.id)

        if (!prevSeg) {
          // New segment appeared already done/error (fast BullMQ processing)
          if (seg.parseStatus === 'done') {
            toast.success(`Segment "${seg.name ?? 'Sans nom'}" analysé avec succès !`)
          } else if (seg.parseStatus === 'error') {
            toast.error(`Parsing échoué pour "${seg.name ?? 'Sans nom'}"`, {
              description: 'Vérifiez le format du fichier GPX',
            })
          }
          continue
        }

        const wasPending =
          prevSeg.parseStatus === 'pending' || prevSeg.parseStatus === 'processing'
        if (!wasPending) continue

        if (seg.parseStatus === 'done') {
          toast.success(`Segment "${seg.name ?? 'Sans nom'}" analysé avec succès !`)
        } else if (seg.parseStatus === 'error') {
          toast.error(`Parsing échoué pour "${seg.name ?? 'Sans nom'}"`, {
            description: 'Vérifiez le format du fichier GPX',
          })
        }
      }
    }

    // Only record state once we have real server data (not the [] default)
    if (segments.length > 0) {
      prevSegmentsRef.current = segments
    }
  }, [segments])

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
              <SegmentCard
                key={segment.id}
                segment={segment}
                onRetry={() => setShowUploadForm(true)}
              />
            ))}
          </div>
        )}
      </section>

      {(!segments.length || showUploadForm) && (
        <section>
          <h2 className="text-lg font-semibold mb-3">Ajouter un segment GPX</h2>
          <GpxUploadForm
            adventureId={adventureId}
            onSuccess={() => setShowUploadForm(false)}
          />
        </section>
      )}
    </main>
  )
}
