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

/**
 * Flag Overpass + fiabilité de la valeur (parité web `useOverpassEnabled`).
 *
 * `profile?.overpassEnabled ?? false` est un piège pour tout ce qui DÉCLENCHE une requête :
 * pendant le chargement du profil le flag vaut `false`, la recherche POI part donc en OFF puis
 * repart en ON à l'arrivée du profil → travail serveur doublé et résultat OFF affiché en
 * premier, d'où l'impression que l'option n'a aucun effet (bug 2026-08-19).
 *
 * `ready` est vrai dès que la valeur est arrêtée, y compris en erreur (repli sur OFF) et en
 * `paused` (hors-ligne sans profil en cache) — ne JAMAIS bloquer la recherche indéfiniment.
 */
export function useOverpassEnabled(): { overpassEnabled: boolean; ready: boolean } {
  const query = useProfile();
  return {
    overpassEnabled: query.data?.overpassEnabled ?? false,
    ready: query.isSuccess || query.isError || query.fetchStatus === 'paused',
  };
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
