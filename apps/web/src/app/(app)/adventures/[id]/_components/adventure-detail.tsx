'use client'

import { useRef, useEffect, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { getAdventure, listSegments, reorderSegments, deleteSegment } from '@/lib/api-client'
import { Button } from '@/components/ui/button'
import { GpxUploadForm } from './gpx-upload-form'
import { SortableSegmentCard } from './sortable-segment-card'
import type { AdventureSegmentResponse } from '@ridenrest/shared'

interface Props {
  adventureId: string
}

export const shouldPoll = (segments: Pick<AdventureSegmentResponse, 'parseStatus'>[]) =>
  segments.some((s) => s.parseStatus === 'pending' || s.parseStatus === 'processing')

export function AdventureDetail({ adventureId }: Props) {
  const queryClient = useQueryClient()
  const prevSegmentsRef = useRef<AdventureSegmentResponse[] | undefined>(undefined)
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [replacingSegmentId, setReplacingSegmentId] = useState<string | null>(null)

  const segmentsQueryKey = ['adventures', adventureId, 'segments'] as const

  const { data: adventure, isPending: adventureLoading } = useQuery({
    queryKey: ['adventures', adventureId],
    queryFn: () => getAdventure(adventureId),
  })

  const { data: segments = [] } = useQuery({
    queryKey: segmentsQueryKey,
    queryFn: () => listSegments(adventureId),
    staleTime: 0,
    // Poll every 3s while any segment is pending or processing
    refetchInterval: (query) => {
      const data = query.state.data
      if (!data) return false
      return shouldPoll(data) ? 3000 : false
    },
  })

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const reorderMutation = useMutation({
    mutationFn: ({ orderedIds }: { orderedIds: string[] }) =>
      reorderSegments(adventureId, orderedIds),

    onMutate: async ({ orderedIds }) => {
      await queryClient.cancelQueries({ queryKey: segmentsQueryKey })
      const previousSegments = queryClient.getQueryData<AdventureSegmentResponse[]>(segmentsQueryKey)

      if (previousSegments) {
        const reordered = orderedIds
          .map((id) => previousSegments.find((s) => s.id === id))
          .filter(Boolean) as AdventureSegmentResponse[]
        queryClient.setQueryData(segmentsQueryKey, reordered)
      }

      return { previousSegments }
    },

    onError: (_err, _vars, context) => {
      if (context?.previousSegments) {
        queryClient.setQueryData(segmentsQueryKey, context.previousSegments)
      }
      toast.error('Erreur lors du réordonnancement')
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: segmentsQueryKey })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (segmentId: string) => deleteSegment(adventureId, segmentId),
    onSuccess: (_data, segmentId) => {
      queryClient.invalidateQueries({ queryKey: segmentsQueryKey })
      queryClient.invalidateQueries({ queryKey: ['adventures', adventureId] })
      toast.success('Segment supprimé')
      if (replacingSegmentId === segmentId) {
        setShowUploadForm(true)
        setReplacingSegmentId(null)
      }
    },
    onError: () => toast.error('Erreur lors de la suppression'),
  })

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = segments.findIndex((s) => s.id === active.id)
    const newIndex = segments.findIndex((s) => s.id === over.id)
    const reordered = arrayMove(segments, oldIndex, newIndex)
    const orderedIds = reordered.map((s) => s.id)

    reorderMutation.mutate({ orderedIds })
  }

  function handleDelete(segmentId: string) {
    setReplacingSegmentId(null)
    deleteMutation.mutate(segmentId)
  }

  function handleReplace(segmentId: string) {
    setReplacingSegmentId(segmentId)
    deleteMutation.mutate(segmentId)
  }

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
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Segments</h2>
          {segments.length > 0 && !showUploadForm && (
            <Button variant="outline" size="sm" onClick={() => setShowUploadForm(true)}>
              + Ajouter un segment
            </Button>
          )}
        </div>
        {segments.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            Aucun segment. Ajoutez un fichier GPX pour démarrer.
          </p>
        ) : (
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={segments.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <div className="space-y-2">
                {segments.map((segment) => (
                  <SortableSegmentCard
                    key={segment.id}
                    segment={segment}
                    onDelete={() => handleDelete(segment.id)}
                    onReplace={() => handleReplace(segment.id)}
                    isDeleting={deleteMutation.isPending && deleteMutation.variables === segment.id}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
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
