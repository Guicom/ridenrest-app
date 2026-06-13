import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';
import type { AdventureResponse } from '@ridenrest/shared';

import { authClient } from '@/lib/auth/client';
import { runCachePurge } from '@/lib/cache/cache-manager';
import { deriveIsOnline } from '@/hooks/use-network-status';
import { queryClient } from './query-client';

// Listener de cycle de vie **unique** et centralisé (MOB-2.1 / AC3 — archi §Lifecycle),
// enrichi en MOB-3.5. Monté une seule fois au root (`_layout.tsx`). INTERDICTION
// formelle d'ajouter un second listener `AppState` ou un second abonnement NetInfo
// global (la lecture UI passe par `useNetworkStatus`, qui ne duplique pas le refetch).
//
// Au retour foreground :
//   - marque TanStack Query « focused » → refetch des queries `stale`
//   - re-synchronise la session Better Auth (cold-resume / refresh token)
//   - **MOB-3.5** : purge du cache offline (`runCachePurge`) sur la liste N1 persistée
// Au retour réseau (online OU foreground+online) :
//   - **MOB-3.5** : invalide les queries critiques (`['adventures']`, détail, segments)
//     — refetch EN PLACE, sans re-navigation (préserve l'écran courant, AC3)
//
// `queryClient` est importé en singleton (le hook est appelé hors du Provider, au
// niveau du root, en parallèle de `QueryProvider`).

// Query keys critiques rafraîchies au retour réseau (AC3). On invalide la liste N1,
// chaque détail d'aventure et ses segments — sans connaître les ids à l'avance, on
// invalide par **préfixe** `['adventures']` (couvre `['adventures', id]` et
// `['adventures', id, 'segments']`). `['session']` n'est PAS invalidée ici (gérée par
// `authClient.getSession`).
function invalidateCriticalQueries(): void {
  // `.catch` : un refetch peut rejeter si le réseau retombe (red-box RN sinon).
  void queryClient
    .invalidateQueries({ queryKey: ['adventures'] })
    .catch(() => {});
}

// Purge cache offline (AC4) : lit la liste N1 depuis le cache TanStack Query persisté.
function purgeStaleCache(): void {
  const adventures = queryClient.getQueryData<AdventureResponse[]>([
    'adventures',
  ]);
  void runCachePurge(adventures).catch(() => {});
}

export function useAppStateRefetch(): void {
  useEffect(() => {
    function onAppStateChange(status: AppStateStatus) {
      // RN n'a pas `window.focus` → on pilote focusManager depuis AppState.
      if (Platform.OS !== 'web') {
        focusManager.setFocused(status === 'active');
      }
      if (status === 'active') {
        // Re-synchronise la session au retour foreground (refetch silencieux).
        // `.catch` obligatoire : au retour hors-ligne le fetch rejette → sinon
        // rejet non géré (red-box RN). Échec bénin, on ignore.
        void authClient.getSession().catch(() => {});

        // MOB-3.5 — purge du cache offline des aventures éligibles (date-based).
        purgeStaleCache();

        // MOB-3.5 — si on est online au retour foreground, on rafraîchit les
        // queries critiques en place (cold-resume reconnecté). `onlineManager`
        // est la source de vérité courante de la connectivité.
        if (onlineManager.isOnline()) {
          invalidateCriticalQueries();
        }
      }
    }

    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    // Seed boot (MOB-3.5 — corrige la dette MOB-2.1 : online initial non seedé +
    // `isInternetReachable` ignoré). `.catch` car `fetch()` peut rejeter offline.
    void NetInfo.fetch()
      .then((state) =>
        onlineManager.setOnline(
          deriveIsOnline(state.isConnected, state.isInternetReachable),
        ),
      )
      .catch(() => {});

    // Bridge netinfo → onlineManager : refetch/pause automatique selon la
    // connectivité. MOB-3.5 : prend en compte `isInternetReachable` (pas seulement
    // `isConnected`) et invalide les queries critiques à la transition offline→online.
    return onlineManager.setEventListener((setOnline) =>
      NetInfo.addEventListener((state) => {
        const wasOnline = onlineManager.isOnline();
        const nowOnline = deriveIsOnline(
          state.isConnected,
          state.isInternetReachable,
        );
        setOnline(nowOnline);
        // Transition offline → online : refetch en place (AC3 — pas de re-navigation).
        if (!wasOnline && nowOnline) {
          invalidateCriticalQueries();
        }
      }),
    );
  }, []);
}
