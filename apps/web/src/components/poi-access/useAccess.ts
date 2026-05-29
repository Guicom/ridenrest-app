import { useQuery } from '@tanstack/react-query'
import { apiClient } from '@/lib/api-client'
import { AccessResponseSchema, type AccessOrigin, type AccessResponse } from '@ridenrest/shared'

/**
 * Hook d'accès aux métriques de routage cyclable vers un POI (Story 2.4).
 *
 * - Wrap TanStack Query, queryKey `['poi-access', poiId, origin]` (objet `origin`
 *   hashé de façon déterministe par TanStack v5 → entrée de cache stable).
 * - Parse la réponse avec `AccessResponseSchema` (source de vérité partagée).
 * - Lazy : aucune requête tant que le hook n'est pas monté (et `enabled` requiert poiId).
 *
 * Doc Sync : l'endpoint réel est préfixé `/api/` (cf. `api-client.ts`), la story
 * planifiée écrivait `/pois/:id/access` sans préfixe.
 */
export interface UseAccessResult {
  data: AccessResponse | undefined
  isLoading: boolean
  error: Error | null
}

export function useAccess(poiId: string, origin: AccessOrigin): UseAccessResult {
  const { data, isLoading, error } = useQuery({
    queryKey: ['poi-access', poiId, origin],
    queryFn: async () => {
      const raw = await apiClient.post<unknown>(`/api/pois/${poiId}/access`, { origin })
      return AccessResponseSchema.parse(raw)
    },
    staleTime: 5 * 60 * 1000,
    gcTime: 15 * 60 * 1000,
    enabled: !!poiId,
  })

  return { data, isLoading, error }
}
