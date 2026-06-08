import { QueryClient } from '@tanstack/react-query';

// QueryClient unique (MOB-2.1 / AC3 — socle data). Server state = TanStack Query v5
// (identique web). Query keys cohérentes web : `['session']`, `['adventures']`,
// `['adventures', id]`, `['pois', { segmentId, fromKm, toKm, layer }]`…
//
// `staleTime` 30 s : évite les refetch agressifs au montage ; le refetch au retour
// foreground est piloté par `focusManager` (cf. use-app-state-refetch.ts).
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 2,
    },
  },
});
