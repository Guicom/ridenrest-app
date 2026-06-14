import { useQuery } from '@tanstack/react-query';
import type { AdventureMapResponse } from '@ridenrest/shared';

import { getAdventureMapData } from '@/lib/api/map';

// Hook data carte (MOB-4.1 / AC1, 5). Server-state = TanStack Query v5.
//
// Query key STRICTE `['adventures', adventureId, 'map']` (préfixe partagé avec
// `['adventures', id]` / `['adventures', id, 'segments']` — cohérence d'invalidation).
//
// **Polling conditionnel** identique au pattern segments (`segmentsPollInterval`) :
// 3000 ms tant qu'un segment est `pending`/`processing`, `false` sinon — la carte se
// peuple dès qu'un parse se termine, puis le polling s'arrête. La pause hors-foreground
// est pilotée par `focusManager` (use-app-state-refetch, root MOB-2.1), sans code ici.
//
// **Offline (AC5)** : la dernière réponse (waypoints) est persistée par TanStack Query
// persist N1 → la trace reste affichable hors-ligne (le fond de carte, lui, peut être
// indisponible — comportement dégradé accepté MVP).

const MAP_POLL_INTERVAL_MS = 3000;

/** Vrai si au moins un segment carte est en cours de parsing (`pending`/`processing`). */
export function isMapParsing(data?: AdventureMapResponse): boolean {
  return !!data?.segments?.some(
    (s) => s.parseStatus === 'pending' || s.parseStatus === 'processing',
  );
}

/**
 * Intervalle de polling carte : 3000 ms tant qu'un segment parse, `false` sinon
 * (arrêt auto). Pur, branché sur `refetchInterval`. Parité `segmentsPollInterval`.
 */
export function mapPollInterval(data?: AdventureMapResponse): number | false {
  return isMapParsing(data) ? MAP_POLL_INTERVAL_MS : false;
}

/** Données carte d'une aventure + polling conditionnel (peuplement post-parse). */
export function useAdventureMap(adventureId: string) {
  return useQuery({
    queryKey: ['adventures', adventureId, 'map'],
    queryFn: () => getAdventureMapData(adventureId),
    enabled: Boolean(adventureId),
    refetchInterval: (q) => mapPollInterval(q.state.data),
  });
}
