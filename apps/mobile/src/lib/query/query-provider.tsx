import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import type { PropsWithChildren } from 'react';

import { CACHE_MAX_AGE_MS, queryClient } from './query-client';

// Provider TanStack Query persisté (MOB-2.1 socle → MOB-3.5 persist N1). Le listener
// de cycle de vie (AppState + netinfo) est câblé séparément via `useAppStateRefetch`
// dans le root `_layout.tsx` — un **seul** point centralisé (archi §Lifecycle).
//
// Persistance (MOB-3.5 / AC1) : la liste aventures N1 survit aux redémarrages pour un
// listing offline natif. Stockée via AsyncStorage (données NON sensibles).
//   - `maxAge` 24 h : au-delà, le cache persisté est ignoré (et `gcTime` le couvre).
//   - `buster` = version app : invalide tout le cache persisté à chaque release.
//   - `shouldDehydrateQuery` : ne persiste QUE `['adventures']` (préfixe). EXCLUT
//     `['session']` et toute query sensible — les SECRETS (JWT/refresh) restent en
//     `expo-secure-store`, JAMAIS AsyncStorage (cf. AGENTS.md §Auth).

const persister = createAsyncStoragePersister({ storage: AsyncStorage });

const APP_VERSION = Constants.expoConfig?.version ?? '0.0.0';

export function QueryProvider({ children }: PropsWithChildren) {
  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        maxAge: CACHE_MAX_AGE_MS,
        buster: APP_VERSION,
        dehydrateOptions: {
          // Whitelist STRICTE : seul le listing aventures N1 est persisté.
          shouldDehydrateQuery: (query) => {
            const key = query.queryKey;
            return Array.isArray(key) && key[0] === 'adventures';
          },
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
