'use client'

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { LayoutGrid } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { triggerDensityAnalysis, getDensityStatus } from '@/lib/api-client'
import { DensityCategoryDialog } from './density-category-dialog'
import type { AdventureSegmentResponse } from '@ridenrest/shared'

interface Props {
  adventureId: string
  segments: AdventureSegmentResponse[]
}

export function DensityTriggerButton({ adventureId, segments }: Props) {
  const queryClient = useQueryClient()
  const [dialogOpen, setDialogOpen] = useState(false)

  const { data: densityStatus } = useQuery({
    queryKey: ['density', adventureId],
    queryFn: () => getDensityStatus(adventureId),
    refetchInterval: (query) =>
      ['pending', 'processing'].includes(query.state.data?.densityStatus ?? '')
        ? 3000
        : false,
  })

  const triggerMutation = useMutation({
    mutationFn: (categories: string[]) => triggerDensityAnalysis(adventureId, categories),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['density', adventureId] })
      toast.success('Analyse de densité démarrée')
      setDialogOpen(false)
    },
    onError: (err: Error & { status?: number }) => {
      if (err.status === 409) {
        toast.error('Analyse déjà en cours')
      } else {
        toast.error("Erreur lors du lancement de l'analyse")
      }
    },
  })

  const handleConfirm = (categories: string[]) => {
    triggerMutation.mutate(categories)
  }

  const isAnalyzing = ['pending', 'processing'].includes(densityStatus?.densityStatus ?? '')
  const isDone = densityStatus?.densityStatus === 'success'
  const progress = densityStatus?.densityProgress ?? 0
  const allSegmentsParsed = segments.every((s) => s.parseStatus === 'done') && segments.length > 0

  return (
    <>
      <Button
        variant="ghost"
        size="lg"
        className="rounded-full gap-2 px-6 py-6 bg-primary/10 text-primary hover:bg-primary/20 hover:text-primary"
        onClick={() => setDialogOpen(true)}
        disabled={isAnalyzing || !allSegmentsParsed}
      >
        <LayoutGrid className="h-4 w-4" />
        {isAnalyzing
          ? `Analyse en cours… ${progress}%`
          : isDone
            ? 'Densité calculée'
            : 'Calculer la densité'}
      </Button>
      <DensityCategoryDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onConfirm={handleConfirm}
        isLoading={triggerMutation.isPending}
      />
    </>
  )
}
