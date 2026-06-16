import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CoverageGapSummary,
  DensityStatus,
} from '@ridenrest/shared';

import { getDensityStatus, triggerDensityAnalysis } from '@/lib/api/density';

// On lit `status` de façon structurelle (`ApiError` l'expose en champ public) plutôt que
// via `instanceof ApiError` : éviter d'importer `api-client` ici garde le hook hors de la
// stack auth native (sinon tout test chargeant la route doit mocker `@/lib/auth/client`).
function errorStatus(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === 'number' ? status : null;
}

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
  /** 409 — une analyse est déjà en cours (message dédié, JAMAIS une erreur fatale). */
  isTriggerConflict: boolean;
  /** Échec du lancement (hors 409) — message non bloquant + relance possible. */
  isTriggerError: boolean;
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

  // 409 = analyse déjà en cours (parité web : `err.status === 409` → « Analyse déjà en
  // cours ») — on le mappe en message dédié, jamais en erreur bloquante.
  const triggerStatus = errorStatus(mutation.error);

  return {
    coverageGaps: data?.coverageGaps ?? [],
    densityStatus: data?.densityStatus ?? 'idle',
    densityCategories: data?.densityCategories ?? [],
    densityStale: data?.densityStale ?? false,
    densityProgress: data?.densityProgress ?? 0,
    isPending,
    // `.catch` neutralise le rejet : l'appelant (dialog) n'a pas à gérer le throw ;
    // l'état d'erreur reste exposé via les flags ci-dessous (réinitialisés au prochain trigger).
    trigger: (categories) =>
      mutation
        .mutateAsync(categories)
        .then(() => undefined)
        .catch(() => undefined),
    isTriggering: mutation.isPending,
    isTriggerConflict: triggerStatus === 409,
    isTriggerError: mutation.isError && triggerStatus !== 409,
  };
}
