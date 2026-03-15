'use client'

import { useRef, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Trash2 } from 'lucide-react'
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
import {
  getAdventure,
  listSegments,
  reorderSegments,
  deleteSegment,
  renameAdventure,
  renameSegment,
  deleteAdventure,
} from '@/lib/api-client'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { GpxUploadForm } from './gpx-upload-form'
import { SortableSegmentCard } from './sortable-segment-card'
import { StravaImportModal } from './strava-import-modal'
import type { AdventureSegmentResponse } from '@ridenrest/shared'

interface Props {
  adventureId: string
  stravaConnected?: boolean
}

export const shouldPoll = (segments: Pick<AdventureSegmentResponse, 'parseStatus'>[]) =>
  segments.some((s) => s.parseStatus === 'pending' || s.parseStatus === 'processing')

export function AdventureDetail({ adventureId, stravaConnected = false }: Props) {
  const queryClient = useQueryClient()
  const router = useRouter()
  const prevSegmentsRef = useRef<AdventureSegmentResponse[] | undefined>(undefined)
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [replacingSegmentId, setReplacingSegmentId] = useState<string | null>(null)
  const [stravaImportOpen, setStravaImportOpen] = useState(false)
  const [isRenamingAdventure, setIsRenamingAdventure] = useState(false)
  const [adventureNameInput, setAdventureNameInput] = useState('')
  const [deleteAdventureDialogOpen, setDeleteAdventureDialogOpen] = useState(false)
  const [deleteConfirmName, setDeleteConfirmName] = useState('')

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

  const renameAdventureMutation = useMutation({
    mutationFn: (name: string) => renameAdventure(adventureId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adventures', adventureId] })
      queryClient.invalidateQueries({ queryKey: ['adventures'] })
      setIsRenamingAdventure(false)
      toast.success('Aventure renommée')
    },
    onError: () => {
      setIsRenamingAdventure(false)
      toast.error('Erreur lors du renommage')
    },
  })

  const deleteAdventureMutation = useMutation({
    mutationFn: () => deleteAdventure(adventureId),
    onSuccess: () => {
      queryClient.removeQueries({ queryKey: ['adventures', adventureId] })
      queryClient.invalidateQueries({ queryKey: ['adventures'] })
      router.push('/adventures')
    },
    onError: () => toast.error("Erreur lors de la suppression de l'aventure"),
  })

  const renameSegmentMutation = useMutation({
    mutationFn: ({ segmentId, name }: { segmentId: string; name: string }) =>
      renameSegment(adventureId, segmentId, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: segmentsQueryKey })
      toast.success('Segment renommé')
    },
    onError: () => toast.error('Erreur lors du renommage du segment'),
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
        <div className="flex items-center gap-2">
          {isRenamingAdventure ? (
            <input
              className="text-2xl font-bold bg-transparent border-b border-primary outline-none w-full"
              value={adventureNameInput}
              onChange={(e) => setAdventureNameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && adventureNameInput.trim()) {
                  renameAdventureMutation.mutate(adventureNameInput.trim())
                }
                if (e.key === 'Escape') setIsRenamingAdventure(false)
              }}
              onBlur={() => {
                if (renameAdventureMutation.isPending) return
                if (adventureNameInput.trim() && adventureNameInput.trim() !== adventure.name) {
                  renameAdventureMutation.mutate(adventureNameInput.trim())
                } else {
                  setIsRenamingAdventure(false)
                }
              }}
              disabled={renameAdventureMutation.isPending}
              autoFocus
            />
          ) : (
            <h1
              className="text-2xl font-bold cursor-pointer hover:text-muted-foreground transition-colors"
              title="Cliquer pour renommer"
              onClick={() => {
                setAdventureNameInput(adventure.name)
                setIsRenamingAdventure(true)
              }}
            >
              {adventure.name}
            </h1>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive"
            onClick={() => { setDeleteConfirmName(''); setDeleteAdventureDialogOpen(true) }}
            title="Supprimer l'aventure"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-muted-foreground text-sm">
          {adventure.totalDistanceKm > 0
            ? `${adventure.totalDistanceKm.toFixed(1)} km total`
            : 'Distance à calculer'}
        </p>
        {segments.some((s) => s.parseStatus === 'done') && (
          <Link href={`/map/${adventureId}`}>
            <Button variant="outline" size="sm">Voir la carte</Button>
          </Link>
        )}
      </div>

      <AlertDialog open={deleteAdventureDialogOpen} onOpenChange={setDeleteAdventureDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer &ldquo;{adventure.name}&rdquo; ?</AlertDialogTitle>
            <AlertDialogDescription>
              Cette action est irréversible. Tous les segments GPX et données associées seront définitivement supprimés.
              Tapez le nom de l&apos;aventure pour confirmer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            value={deleteConfirmName}
            onChange={(e) => setDeleteConfirmName(e.target.value)}
            placeholder={adventure.name}
            className="mt-2"
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteConfirmName('')}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteAdventureMutation.mutate()}
              disabled={deleteConfirmName !== adventure.name || deleteAdventureMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteAdventureMutation.isPending ? 'Suppression...' : 'Supprimer définitivement'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Segments</h2>
          {!showUploadForm && (
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setStravaImportOpen(true)}>
                Importer depuis Strava
              </Button>
              {segments.length > 0 && (
                <Button variant="outline" size="sm" onClick={() => setShowUploadForm(true)}>
                  + Ajouter un segment
                </Button>
              )}
            </div>
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
                    onRename={(name) => renameSegmentMutation.mutate({ segmentId: segment.id, name })}
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

      <StravaImportModal
        adventureId={adventureId}
        open={stravaImportOpen}
        onOpenChange={setStravaImportOpen}
        stravaConnected={stravaConnected}
      />
    </main>
  )
}
