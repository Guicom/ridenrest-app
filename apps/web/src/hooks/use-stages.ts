import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getStages, createStage, updateStage, deleteStage, generateStages } from '@/lib/api-client'
import type {
  AdventureStageResponse,
  CreateStageInput,
  UpdateStageInput,
  GenerateStagesInput,
  GenerateStagesResponse,
} from '@ridenrest/shared'

interface UseStagesOptions {
  onAfterChange?: () => void
}

interface UseStagesResult {
  stages: AdventureStageResponse[]
  isPending: boolean
  createStage: (data: CreateStageInput) => Promise<void>
  updateStage: (stageId: string, data: UpdateStageInput) => Promise<void>
  deleteStage: (stageId: string) => Promise<void>
  generateStages: (input: GenerateStagesInput) => Promise<GenerateStagesResponse>
  isGenerating: boolean
}

export function useStages(adventureId: string, options: UseStagesOptions = {}): UseStagesResult {
  const { onAfterChange } = options
  const queryClient = useQueryClient()
  const queryKey = ['adventures', adventureId, 'stages'] as const

  const { data, isPending } = useQuery({
    queryKey,
    queryFn: () => getStages(adventureId),
    enabled: !!adventureId,
  })

  const invalidate = async () => {
    await queryClient.refetchQueries({ queryKey })
    onAfterChange?.()
  }

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

  // Les étapes générées portent un `departureTime`, donc `onAfterChange` déclenche la synchro
  // de date de fin (17.12) — comportement voulu, pas un effet de bord à neutraliser.
  const generateMutation = useMutation({
    mutationFn: (input: GenerateStagesInput) => generateStages(adventureId, input),
    onSuccess: invalidate,
  })

  return {
    stages: data ?? [],
    isPending,
    createStage: (input) => createMutation.mutateAsync(input).then(() => undefined),
    updateStage: (stageId, input) => updateMutation.mutateAsync({ stageId, input }).then(() => undefined),
    deleteStage: (stageId) => deleteMutation.mutateAsync(stageId).then(() => undefined),
    generateStages: (input) => generateMutation.mutateAsync(input),
    isGenerating: generateMutation.isPending,
  }
}
