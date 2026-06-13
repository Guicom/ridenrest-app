import { QueryClient } from '@tanstack/react-query';

// QueryClient unique (MOB-2.1 / AC3 — socle data). Server state = TanStack Query v5
// (identique web). Query keys cohérentes web : `['session']`, `['adventures']`,
// `['adventures', id]`, `['pois', { segmentId, fromKm, toKm, layer }]`…
//
// `staleTime` 30 s : évite les refetch agressifs au montage ; le refetch au retour
// foreground est piloté par `focusManager` (cf. use-app-state-refetch.ts).
//
// `gcTime` 24 h (MOB-3.5) : DOIT couvrir le `maxAge` du persister (24 h) — sinon les
// queries persistées seraient garbage-collectées immédiatement après l'hydratation
// (avant qu'un observer ne les re-monte), perdant le listing offline N1.
export const CACHE_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 h

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
      gcTime: CACHE_MAX_AGE_MS,
    },
  },
});
