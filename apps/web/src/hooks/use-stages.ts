import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getStages, createStage, updateStage, deleteStage } from '@/lib/api-client'
import type { AdventureStageResponse, CreateStageInput, UpdateStageInput } from '@ridenrest/shared'

interface UseStagesResult {
  stages: AdventureStageResponse[]
  isPending: boolean
  createStage: (data: CreateStageInput) => Promise<void>
  updateStage: (stageId: string, data: UpdateStageInput) => Promise<void>
  deleteStage: (stageId: string) => Promise<void>
}

export function useStages(adventureId: string): UseStagesResult {
  const queryClient = useQueryClient()
  const queryKey = ['adventures', adventureId, 'stages'] as const

  const { data, isPending } = useQuery({
    queryKey,
    queryFn: () => getStages(adventureId),
    enabled: !!adventureId,
  })

  const invalidate = () => queryClient.invalidateQueries({ queryKey })

  const createMutation = useMutation({
    mutationFn: (input: CreateStageInput) => createStage(adventureId, input),
    onSuccess: invalidate,
  })

  const updateMutation = useMutation({
    mutationFn: ({ stageId, input }: { stageId: string; input: UpdateStageInput }) =>
      updateStage(adventureId, stageId, input),
    onSuccess: invalidate,
  })

  const deleteMutation = useMutation({
    mutationFn: (stageId: string) => deleteStage(adventureId, stageId),
    onSuccess: invalidate,
  })

  return {
    stages: data ?? [],
    isPending,
    createStage: (input) => createMutation.mutateAsync(input).then(() => undefined),
    updateStage: (stageId, input) => updateMutation.mutateAsync({ stageId, input }).then(() => undefined),
    deleteStage: (stageId) => deleteMutation.mutateAsync(stageId).then(() => undefined),
  }
}
