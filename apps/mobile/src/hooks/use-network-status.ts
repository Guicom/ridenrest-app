import NetInfo from '@react-native-community/netinfo';
import { useEffect, useState } from 'react';

// Hook de LECTURE UI de la connectivité (MOB-3.5 / AC2-3). Pilote `<StatusBanner>`
// et la désactivation des actions réseau offline. Ne DUPLIQUE pas la logique de
// refetch/purge (qui reste dans le listener centralisé `use-app-state-refetch`).
//
// `isOnline` = connecté ET internet accessible. On considère **offline** dès que
// `isInternetReachable === false`, même si `isConnected` (corrige la dette MOB-2.1 :
// `isInternetReachable` ignoré → faux « online » sur un réseau capté sans internet).
//
// **Seed initial** via `NetInfo.fetch()` au montage : sans lui, le 1er render est
// optimiste (`true`) et un boot hors-ligne afficherait l'app comme online.

export interface NetworkStatus {
  isOnline: boolean;
  isInternetReachable: boolean | null;
}

/** Dérive `isOnline` d'un état NetInfo (offline si internet explicitement injoignable). */
export function deriveIsOnline(
  isConnected: boolean | null,
  isInternetReachable: boolean | null,
): boolean {
  if (isInternetReachable === false) return false;
  return isConnected ?? true;
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: true,
    isInternetReachable: null,
  });

  useEffect(() => {
    let mounted = true;

    function apply(isConnected: boolean | null, reachable: boolean | null) {
      if (!mounted) return;
      setStatus({
        isOnline: deriveIsOnline(isConnected, reachable),
        isInternetReachable: reachable,
      });
    }

    // Seed boot : résout l'état réel avant tout changement (corrige boot offline).
    // `.catch` obligatoire (rejet réseau → red-box RN sinon — leçon MOB-2.1).
    void NetInfo.fetch()
      .then((state) => apply(state.isConnected, state.isInternetReachable))
      .catch(() => {});

    const unsubscribe = NetInfo.addEventListener((state) =>
      apply(state.isConnected, state.isInternetReachable),
    );

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return status;
}
