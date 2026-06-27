import { useQuery } from '@tanstack/react-query';
import type { FetchStatus } from '@tanstack/react-query';
import type { AccessOrigin, AccessResponse } from '@ridenrest/shared';

import { computeAccess } from '@/lib/api/poi-access';

// Hook d'accès aux métriques de routage cyclable vers un POI (MOB-4.6 / T2, AC1-2 —
// parité web `useAccess`). Wrap TanStack Query, clé `['poi-access', poiId, origin]`
// (objet `origin` hashé de façon déterministe par TanStack v5 → entrée de cache stable).
//
// **Lazy** : la query n'est exploitée que lorsque la fiche POI (popup) est montée sur
// un hébergement (le composant `AccessMetrics` n'est rendu que dans ce cas). `enabled`
// requiert en plus un `poiId`.
//
// Le routage est déterministe pour (poi, origin) → la donnée n'est jamais réellement
// périmée : un `ok`/`fallback` déjà en cache reste affichable même si un refetch
// d'arrière-plan échoue (TanStack conserve `data`). C'est le composant qui décide de
// ne basculer sur l'erreur que faute de donnée exploitable.

export interface UseAccessResult {
  data: AccessResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  fetchStatus: FetchStatus;
}

export function useAccess(poiId: string, origin: AccessOrigin): UseAccessResult {
  const { data, isLoading, isError, fetchStatus } = useQuery({
    queryKey: ['poi-access', poiId, origin],
    queryFn: () => computeAccess(poiId, origin),
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    enabled: !!poiId,
  });

  return { data, isLoading, isError, fetchStatus };
}
