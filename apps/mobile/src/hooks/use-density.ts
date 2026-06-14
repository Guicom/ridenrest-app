import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CoverageGapSummary,
  DensityStatus,
} from '@ridenrest/shared';

import { getDensityStatus, triggerDensityAnalysis } from '@/lib/api/density';

// Statut de densité + déclenchement de l'analyse — port iso du web. Clé
// `['density', adventureId]`, polling 3 s tant que `pending`/`processing` (arrêt auto).
// Le trigger (POST) invalide la query → le polling reprend.

export interface UseDensityResult {
  coverageGaps: CoverageGapSummary[];
  densityStatus: DensityStatus;
  densityCategories: string[];
  densityStale: boolean;
  densityProgress: number;
  isPending: boolean;
  trigger: (categories: string[]) => Promise<void>;
  isTriggering: boolean;
}

/** Helper pur : intervalle de polling selon le statut (parité `mapPollInterval`). */
export function densityPollInterval(status?: DensityStatus): number | false {
  return status === 'pending' || status === 'processing' ? 3000 : false;
}

export function useDensity(adventureId: string): UseDensityResult {
  const queryClient = useQueryClient();
  const { data, isPending } = useQuery({
    queryKey: ['density', adventureId],
    queryFn: () => getDensityStatus(adventureId),
    enabled: Boolean(adventureId),
    refetchInterval: (q) => densityPollInterval(q.state.data?.densityStatus),
  });

  const mutation = useMutation({
    mutationFn: (categories: string[]) =>
      triggerDensityAnalysis(adventureId, categories),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['density', adventureId] });
    },
  });

  return {
    coverageGaps: data?.coverageGaps ?? [],
    densityStatus: data?.densityStatus ?? 'idle',
    densityCategories: data?.densityCategories ?? [],
    densityStale: data?.densityStale ?? false,
    densityProgress: data?.densityProgress ?? 0,
    isPending,
    trigger: (categories) => mutation.mutateAsync(categories).then(() => undefined),
    isTriggering: mutation.isPending,
  };
}
