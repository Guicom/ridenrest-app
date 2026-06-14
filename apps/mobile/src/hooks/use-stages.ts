import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AdventureStageResponse } from '@ridenrest/shared';

import {
  createStage,
  deleteStage,
  getStages,
  updateStage,
  type CreateStageInput,
  type UpdateStageInput,
} from '@/lib/api/stages';

// Étapes d'une aventure (CRUD) — port iso du web. Clé canonique
// `['adventures', id, 'stages']`. Chaque mutation refetch la liste (les champs
// calculés — orderIndex/startKm/distance/D±/ETA — changent en cascade côté serveur).
// `onAfterChange` permet de brancher une synchro de date de fin (stubbée sur mobile).

export interface UseStagesOptions {
  onAfterChange?: () => void;
}

export interface UseStagesResult {
  stages: AdventureStageResponse[];
  isPending: boolean;
  createStage: (input: CreateStageInput) => Promise<void>;
  updateStage: (stageId: string, input: UpdateStageInput) => Promise<void>;
  deleteStage: (stageId: string) => Promise<void>;
}

export function useStages(
  adventureId: string,
  options: UseStagesOptions = {},
): UseStagesResult {
  const { onAfterChange } = options;
  const queryClient = useQueryClient();
  const queryKey = ['adventures', adventureId, 'stages'] as const;

  const { data, isPending } = useQuery({
    queryKey,
    queryFn: () => getStages(adventureId),
    enabled: Boolean(adventureId),
  });

  const invalidate = async () => {
    await queryClient.refetchQueries({ queryKey });
    onAfterChange?.();
  };

  const createMutation = useMutation({
    mutationFn: (input: CreateStageInput) => createStage(adventureId, input),
    onSuccess: invalidate,
  });
  const updateMutation = useMutation({
    mutationFn: ({ stageId, input }: { stageId: string; input: UpdateStageInput }) =>
      updateStage(adventureId, stageId, input),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (stageId: string) => deleteStage(adventureId, stageId),
    onSuccess: invalidate,
  });

  return {
    stages: data ?? [],
    isPending,
    createStage: (input) =>
      createMutation.mutateAsync(input).then(() => undefined),
    updateStage: (stageId, input) =>
      updateMutation.mutateAsync({ stageId, input }).then(() => undefined),
    deleteStage: (stageId) =>
      deleteMutation.mutateAsync(stageId).then(() => undefined),
  };
}
