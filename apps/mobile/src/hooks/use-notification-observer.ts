import * as Notifications from 'expo-notifications';
import { router, useRootNavigationState } from 'expo-router';
import { useEffect, useRef } from 'react';

import {
  configureAndroidChannel,
  configureForegroundHandler,
  extractAdventureId,
} from '@/lib/notifications/push-config';

// Observateur de notifications (MOB-6.2 / T5). Monté UNE fois dans le root layout :
//   1. configure le handler foreground + le canal Android,
//   2. écoute les taps sur notification (`addNotificationResponseReceivedListener`) →
//      deep-link vers `map/[id]` avec l'`adventureId` du `data`,
//   3. gère le cold-start : si l'app a été lancée en tapant une notif
//      (`getLastNotificationResponseAsync`), navigue une fois au montage.
//
// RGPD : le payload ne contient que `adventureId` (déjà côté serveur) — aucune coordonnée.

function goToAdventureMap(adventureId: string): void {
  router.push({ pathname: '/map/[id]', params: { id: adventureId } });
}

export function useNotificationObserver(): void {
  // Évite une double-navigation cold-start (le listener live peut voir la même réponse).
  const handledColdStartRef = useRef(false);
  // Gate : expo-router n'accepte `router.push` qu'après que le navigateur est monté.
  // `useRootNavigationState` renvoie undefined pendant le boot initial, puis l'état réel.
  const navigationState = useRootNavigationState();
  const navigationReady = !!navigationState?.key;

  // Handler foreground + listener tap → montés une seule fois, indépendants du navigateur.
  useEffect(() => {
    configureForegroundHandler();
    void configureAndroidChannel();

    // App déjà ouverte : tap sur une notif → deep-link (navigateur toujours prêt ici).
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (handledColdStartRef.current) return; // évite double-navigation avec cold-start
      const adventureId = extractAdventureId(response);
      if (adventureId) goToAdventureMap(adventureId);
    });

    return () => { sub.remove(); };
  }, []);

  // Cold-start : l'app a-t-elle été ouverte via un tap sur notification ?
  // On attend que le navigateur expo-router soit monté avant d'appeler router.push.
  useEffect(() => {
    if (!navigationReady || handledColdStartRef.current) return;

    let cancelled = false;
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (cancelled || handledColdStartRef.current) return;
      const adventureId = extractAdventureId(response);
      if (adventureId) {
        handledColdStartRef.current = true;
        goToAdventureMap(adventureId);
      }
    });

    return () => { cancelled = true; };
  }, [navigationReady]);
}
