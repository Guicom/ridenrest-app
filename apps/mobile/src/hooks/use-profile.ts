import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { getProfile, updateOverpassEnabled } from '@/lib/api/profile';

// Profil utilisateur (préférences) — port iso du web. Clé `['profile']`, `staleTime`
// 5 min. Fournit `overpassEnabled` à la recherche POI (parité web : sans ce flag, le
// mobile interrogeait toujours `overpassEnabled=false` → 0 résultat hors cache Google).

export function useProfile(enabled = true) {
  return useQuery({
    queryKey: ['profile'],
    queryFn: getProfile,
    staleTime: 5 * 60 * 1000,
    enabled,
  });
}

/** Mutation du flag Overpass (toggle réglages) — invalide `['profile']` (parité web). */
export function useUpdateOverpass() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (overpassEnabled: boolean) =>
      updateOverpassEnabled(overpassEnabled),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });
}
