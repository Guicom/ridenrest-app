import {
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import type { AdventureResponse } from '@ridenrest/shared';

import {
  createAdventure,
  deleteAdventure,
  getAdventure,
  listAdventures,
  renameAdventure,
} from '@/lib/api/adventures';

// Hooks data des aventures (MOB-3.1 / AC1-4). Server-state = TanStack Query v5.
//
// Query keys STRICTES (alignées web — query-client.ts) :
//   ['adventures']      → la liste
//   ['adventures', id]  → un item
// JAMAIS ['getAdventure'] ni variante. Ces clés sont le contrat réutilisé/étendu
// par MOB-3.2 (segments/upload) et MOB-3.3 (dates/vitesse/profil) → ne pas changer.

/** Liste des aventures. `isPending`/`isError`/`refetch` pilotent skeleton/error/empty. */
export function useAdventures() {
  return useQuery({
    queryKey: ['adventures'],
    queryFn: listAdventures,
  });
}

/** Détail d'une aventure (écran `[id]`). */
export function useAdventure(id: string) {
  return useQuery({
    queryKey: ['adventures', id],
    queryFn: () => getAdventure(id),
    enabled: Boolean(id),
  });
}

/**
 * Création. Pas d'optimistic update : on a besoin de l'`id` serveur (et des
 * défauts) → on invalide simplement `['adventures']` au succès. L'écran décide
 * de la navigation post-création (ex. `router.replace` vers le détail).
 */
export function useCreateAdventure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createAdventure(name),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['adventures'] });
    },
  });
}

/**
 * Renommage avec optimistic update + rollback (AC3). Le nom change avant la
 * réponse serveur dans la liste ET le détail ; en cas d'erreur, restauration des
 * snapshots précédents. `onSettled` reconcilie avec le serveur.
 */
export function useRenameAdventure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) =>
      renameAdventure(id, name),
    onMutate: async ({ id, name }) => {
      await qc.cancelQueries({ queryKey: ['adventures'] });
      await qc.cancelQueries({ queryKey: ['adventures', id] });
      const prevList = qc.getQueryData<AdventureResponse[]>(['adventures']);
      const prevItem = qc.getQueryData<AdventureResponse>(['adventures', id]);
      qc.setQueryData<AdventureResponse[]>(['adventures'], (old) =>
        old?.map((a) => (a.id === id ? { ...a, name } : a)),
      );
      qc.setQueryData<AdventureResponse>(['adventures', id], (old) =>
        old ? { ...old, name } : old,
      );
      return { prevList, prevItem };
    },
    onError: (_err, { id }, ctx) => {
      if (ctx?.prevList) qc.setQueryData(['adventures'], ctx.prevList);
      if (ctx?.prevItem) qc.setQueryData(['adventures', id], ctx.prevItem);
    },
    onSettled: (_data, _err, { id }) => {
      void qc.invalidateQueries({ queryKey: ['adventures'] });
      void qc.invalidateQueries({ queryKey: ['adventures', id] });
    },
  });
}

/**
 * Suppression avec optimistic remove + rollback (AC4). La carte disparaît
 * immédiatement de la liste ; en cas d'erreur, le snapshot est restauré.
 * `onSettled` invalide la liste et purge le détail supprimé du cache.
 */
export function useDeleteAdventure() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAdventure(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['adventures'] });
      const prevList = qc.getQueryData<AdventureResponse[]>(['adventures']);
      qc.setQueryData<AdventureResponse[]>(['adventures'], (old) =>
        old?.filter((a) => a.id !== id),
      );
      return { prevList };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prevList) qc.setQueryData(['adventures'], ctx.prevList);
    },
    onSettled: (_data, _err, id) => {
      void qc.invalidateQueries({ queryKey: ['adventures'] });
      qc.removeQueries({ queryKey: ['adventures', id] });
    },
  });
}
