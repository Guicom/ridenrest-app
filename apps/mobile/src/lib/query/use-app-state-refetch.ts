import NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { useEffect } from 'react';
import { AppState, type AppStateStatus, Platform } from 'react-native';

import { authClient } from '@/lib/auth/client';

// Listener de cycle de vie **unique** et centralisé (MOB-2.1 / AC3 — archi §Lifecycle).
// Monté une seule fois au root (`_layout.tsx`). Au retour foreground :
//   - marque TanStack Query « focused » → refetch des queries `stale`
//   - re-synchronise la session Better Auth (cold-resume / refresh token)
// L'état online est bridgé depuis `netinfo`. La purge du cache offline arrive en
// MOB-3.5 ; ici on ne câble que les points d'extension (focus + online).
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
      }
    }

    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    // Bridge netinfo → onlineManager : refetch/pause automatique selon la connectivité.
    return onlineManager.setEventListener((setOnline) =>
      NetInfo.addEventListener((state) => {
        setOnline(state.isConnected ?? true);
      }),
    );
  }, []);
}
