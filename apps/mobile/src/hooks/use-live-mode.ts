import { snapToTrace, type KmWaypoint } from '@ridenrest/gpx';
import type { MapWaypoint } from '@ridenrest/shared';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking } from 'react-native';

import { i18n } from '@/lib/i18n';
import { getConsent, setConsent } from '@/lib/live/consent-storage';
import { LIVE_LOCATION_TASK } from '@/lib/live/location-task';
import { useLiveStore } from '@/lib/stores/live.store';

// Lifecycle du mode Live (MOB-5.1 / T3 → MOB-5.2 / T2). Ré-implémentation du web
// `apps/web/src/hooks/use-live-mode.ts` avec **`expo-location`** (PAS
// `navigator.geolocation`).
//
// MOB-5.1 (foreground) :
//   1. Au montage, on lit le flag de consentement persisté (AsyncStorage). Consenti →
//      auto-start sans redemander le dialog (AC4) ; sinon → `needsConsent = true`.
//   2. `grantConsent()` (clic « Activer ») persiste le consentement puis `startWatching()`.
//   3. `startWatching()` demande la permission OS foreground. Refus → `permissionDenied`.
//      Accord → `watchPositionAsync` alimente `currentPosition` + active le mode Live.
//   4. À chaque `currentPosition`, `snapToTrace` projette **client-side** → `currentKmOnRoute`.
//   5. Au démontage, le watcher est arrêté + `deactivateLiveMode()`.
//
// MOB-5.2 (background écran-éteint, AC2/AC4/AC6) :
//   6. Après le foreground OK, **escalade** `requestBackgroundPermissionsAsync()` (iOS
//      « Always »). Accordé → `startLocationUpdatesAsync(LIVE_LOCATION_TASK, …)` (foreground
//      service Android + UIBackgroundModes iOS) : le GPS continue écran éteint, la tâche
//      (location-task.ts) écrit `useLiveStore` — **aucun POST GPS** (RGPD, NFR-012).
//   7. Refus « Always » / « When In Use » seul → **dégradation gracieuse** (AC6) :
//      `backgroundDenied = true`, le Live foreground continue, aucun blocage ni crash.
//   8. Au démontage, on arrête aussi les updates background (`stopLocationUpdatesAsync`,
//      gardé par `isTaskRegisteredAsync` pour l'idempotence) — pas de tâche fantôme.
//
// Leviers batterie (T6 / NFR-MOB-PERF-03, cible ≤ 10 %/h à figer post-beta Espagne) :
//   - `distanceInterval: 50` m (pas de fix tant qu'on n'a pas bougé de 50 m),
//   - `pausesUpdatesAutomatically: true` (iOS coupe le GPS à l'arrêt prolongé),
//   - `activityType: Fitness` (profil de mouvement adapté au vélo),
//   - foreground watch à `Accuracy.High` (≈10 m) vs background `BestForNavigation`,
//   - pause du polling réseau en background (use-app-state-refetch, AC3) — indépendant du GPS.

/** Options de suivi background (levier batterie T6). Foreground service Android requis 14+. */
function backgroundUpdateOptions(): Location.LocationTaskOptions {
  return {
    accuracy: Location.Accuracy.BestForNavigation,
    distanceInterval: 50,
    pausesUpdatesAutomatically: true,
    activityType: Location.ActivityType.Fitness,
    // iOS : pas d'indicateur bleu permanent (l'utilisateur a déjà consenti « Always »).
    showsBackgroundLocationIndicator: false,
    // Android 14+ : notification persistante obligatoire pour un service de localisation.
    foregroundService: {
      notificationTitle: i18n.t('live.bg.notificationTitle'),
      notificationBody: i18n.t('live.bg.notificationBody'),
      notificationColor: '#2D6A4A',
      killServiceOnDestroy: true,
    },
  };
}

export interface UseLiveModeResult {
  /** Consentement non encore donné (flag persisté résolu = absent) → afficher le dialog. */
  needsConsent: boolean;
  /** Permission OS foreground refusée → message + bouton Réglages. */
  permissionDenied: boolean;
  /**
   * Permission background « Always » refusée (ou « When In Use » seul) → background off,
   * foreground continue (dégradation gracieuse AC6). Affiche un avis non bloquant.
   */
  backgroundDenied: boolean;
  /** Watch foreground démarré mais aucun fix GPS encore reçu → indicateur « acquisition… ». */
  isAcquiring: boolean;
  /** Clic « Activer » : persiste le consentement, demande la permission, démarre le watch. */
  grantConsent: () => void;
  /** Ouvre les Réglages système (sortie du cul-de-sac permission, AC2). */
  openSettings: () => void;
  /** Mode Live actif (au moins une position GPS reçue). */
  isLiveModeActive: boolean;
}

export function useLiveMode(waypoints: readonly MapWaypoint[]): UseLiveModeResult {
  // Flag persisté résolu (async) : tant qu'il ne l'est pas, on n'affiche PAS le dialog
  // pour éviter un flash chez le returning user (auto-start AC4).
  const [consentChecked, setConsentChecked] = useState(false);
  const [hasConsented, setHasConsented] = useState(false);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const [backgroundDenied, setBackgroundDenied] = useState(false);
  // Vrai dès que le watch foreground est établi → pilote l'indicateur « acquisition… »
  // (avec `currentPosition === null`), AC1/T6.
  const [watching, setWatching] = useState(false);

  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  // Garde **synchrone** anti-double-start : `watchPositionAsync` est async, donc
  // `subscriptionRef` n'est posé qu'après l'await → deux appels rapprochés passeraient
  // sinon tous deux le guard (deux watchers → fuite).
  const startingRef = useRef(false);
  // Démontage pendant l'await de `startWatching` : on jette la subscription qui arrive
  // trop tard (sinon watcher fantôme après navigation retour, AC5).
  const cancelledRef = useRef(false);

  // Escalade « Always » + démarrage du suivi background (AC2). Idempotent. Toute erreur /
  // refus → dégradation gracieuse (AC6) : background off, foreground intact, jamais de throw.
  const startBackgroundUpdates = useCallback(async () => {
    try {
      const { status } = await Location.requestBackgroundPermissionsAsync();
      if (status !== 'granted') {
        setBackgroundDenied(true);
        return;
      }
      setBackgroundDenied(false);
      // Idempotence : ne pas relancer un suivi déjà actif (re-montage rapide).
      const alreadyStarted =
        await Location.hasStartedLocationUpdatesAsync(LIVE_LOCATION_TASK);
      if (alreadyStarted) return;
      await Location.startLocationUpdatesAsync(
        LIVE_LOCATION_TASK,
        backgroundUpdateOptions(),
      );
    } catch {
      // Erreur OS (Always indisponible, service refusé…) → background off, pas de blocage.
      setBackgroundDenied(true);
    }
  }, []);

  const startWatching = useCallback(async () => {
    if (subscriptionRef.current || startingRef.current) return;
    startingRef.current = true;
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setPermissionDenied(true);
        return;
      }
      setPermissionDenied(false);
      const subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 5000,
          distanceInterval: 25,
        },
        (location) => {
          useLiveStore.getState().updateGpsPosition({
            lat: location.coords.latitude,
            lng: location.coords.longitude,
          });
          useLiveStore.getState().activateLiveMode();
        },
      );
      // Écran démonté pendant l'await → ne pas garder le watcher.
      if (cancelledRef.current) {
        subscription.remove();
        return;
      }
      subscriptionRef.current = subscription;
      setWatching(true);
      // Escalade background (AC2) — non bloquante : le foreground est déjà actif. On
      // n'attend pas son résultat pour rendre l'écran réactif (le `void` est volontaire).
      if (!cancelledRef.current) void startBackgroundUpdates();
    } catch {
      // Erreur OS inattendue (ex. platform error, memory pressure) → afficher le panel
      // "permission refusée" comme fallback ; l'utilisateur peut ouvrir les Réglages.
      setPermissionDenied(true);
    } finally {
      startingRef.current = false;
    }
  }, [startBackgroundUpdates]);

  const grantConsent = useCallback(() => {
    void setConsent(true);
    setHasConsented(true);
    useLiveStore.getState().setGeolocationConsent(true);
    void startWatching();
  }, [startWatching]);

  const openSettings = useCallback(() => {
    void Linking.openSettings();
  }, []);

  // Lecture du flag persisté au montage → auto-start si consenti (AC4).
  useEffect(() => {
    let active = true;
    void getConsent().then((consented) => {
      if (!active) return;
      setConsentChecked(true);
      if (consented) {
        setHasConsented(true);
        void startWatching();
      }
    });
    return () => {
      active = false;
    };
  }, [startWatching]);

  // Projection client-side de la position sur la trace (RGPD). Conversion
  // `MapWaypoint.distKm → KmWaypoint.km` (le champ s'appelle `km`, pas `distKm`).
  const kmWaypoints = useMemo<KmWaypoint[]>(
    () => waypoints.map((wp) => ({ lat: wp.lat, lng: wp.lng, km: wp.distKm })),
    [waypoints],
  );
  const currentPosition = useLiveStore((s) => s.currentPosition);
  useEffect(() => {
    if (!currentPosition || kmWaypoints.length === 0) return;
    const result = snapToTrace(currentPosition, kmWaypoints);
    if (result) useLiveStore.getState().setCurrentKm(result.kmAlongRoute);
  }, [currentPosition, kmWaypoints]);

  // Cleanup au démontage (AC5) : stop watcher foreground + stop suivi background +
  // reset position/km. Pas de suivi fantôme (foreground OU background).
  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
      // Arrêt des updates background (idempotent, gardé) — `.catch` car l'API peut rejeter
      // si la tâche n'a jamais démarré ; jamais de throw au démontage.
      void (async () => {
        try {
          if (await Location.hasStartedLocationUpdatesAsync(LIVE_LOCATION_TASK)) {
            await Location.stopLocationUpdatesAsync(LIVE_LOCATION_TASK);
          }
        } catch {
          // Ignore — pas de tâche à arrêter / erreur OS bénigne au démontage.
        }
      })();
      useLiveStore.getState().deactivateLiveMode();
    };
  }, []);

  const isLiveModeActive = useLiveStore((s) => s.isLiveModeActive);

  return {
    needsConsent: consentChecked && !hasConsented,
    permissionDenied,
    backgroundDenied,
    // Watch démarré mais pas encore de 1er fix → « acquisition… » (≤ 2 s perçu, AC1/T6).
    isAcquiring: watching && currentPosition === null,
    grantConsent,
    openSettings,
    isLiveModeActive,
  };
}
