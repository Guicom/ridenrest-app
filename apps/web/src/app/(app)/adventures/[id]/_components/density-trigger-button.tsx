'use client'

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { triggerDensityAnalysis, getDensityStatus } from '@/lib/api-client'
import type { AdventureSegmentResponse } from '@ridenrest/shared'

interface Props {
  adventureId: string
  segments: AdventureSegmentResponse[]
}

export function DensityTriggerButton({ adventureId, segments }: Props) {
  const queryClient = useQueryClient()

  const { data: densityStatus } = useQuery({
    queryKey: ['density', adventureId],
    queryFn: () => getDensityStatus(adventureId),
    refetchInterval: (query) =>
      ['pending', 'processing'].includes(query.state.data?.densityStatus ?? '')
        ? 3000
        : false,
  })

  const triggerMutation = useMutation({
    mutationFn: () => triggerDensityAnalysis(adventureId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['density', adventureId] })
      toast.success('Analyse de densité démarrée')
    },
    onError: (err: Error & { status?: number }) => {
      if (err.status === 409) {
        toast.error('Analyse déjà en cours')
      } else {
        toast.error("Erreur lors du lancement de l'analyse")
      }
    },
  })

  const isAnalyzing = ['pending', 'processing'].includes(densityStatus?.densityStatus ?? '')
  const progress = densityStatus?.densityProgress ?? 0
  const allSegmentsParsed = segments.every((s) => s.parseStatus === 'done') && segments.length > 0

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => triggerMutation.mutate()}
      disabled={isAnalyzing || !allSegmentsParsed || triggerMutation.isPending}
    >
      {isAnalyzing ? `Analyse en cours… ${progress}%` : 'Analyser la densité'}
    </Button>
  )
}
