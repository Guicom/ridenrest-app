import { snapToTrace, type KmWaypoint } from '@ridenrest/gpx';
import type { MapWaypoint } from '@ridenrest/shared';
import * as Location from 'expo-location';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking } from 'react-native';

import { getConsent, setConsent } from '@/lib/live/consent-storage';
import { useLiveStore } from '@/lib/stores/live.store';

// Lifecycle du mode Live (MOB-5.1 / T3) — ré-implémentation du web
// `apps/web/src/hooks/use-live-mode.ts` avec **`expo-location`** (PAS
// `navigator.geolocation`). Foreground uniquement (le background écran-éteint = MOB-5.2).
//
// Flow (AC1→5) :
//   1. Au montage, on lit le flag de consentement persisté (AsyncStorage). Consenti →
//      auto-start sans redemander le dialog (AC4) ; sinon → `needsConsent = true` pour
//      afficher `<GeolocationConsent />`.
//   2. `grantConsent()` (clic « Activer ») persiste le consentement puis `startWatching()`.
//   3. `startWatching()` demande la permission OS foreground (AC2). Refus → `permissionDenied`
//      (l'écran propose les Réglages, jamais de cul-de-sac). Accord → `watchPositionAsync`
//      alimente `currentPosition` + active le mode Live (AC3).
//   4. À chaque `currentPosition`, `snapToTrace` projette **client-side** la position sur la
//      trace → `currentKmOnRoute` (RGPD : la position ne quitte JAMAIS le device, NFR-LP-001).
//   5. Au démontage, le watcher est arrêté (`subscription.remove()`) + `deactivateLiveMode()`
//      nulle position/km (pas de suivi fantôme, AC5).

export interface UseLiveModeResult {
  /** Consentement non encore donné (flag persisté résolu = absent) → afficher le dialog. */
  needsConsent: boolean;
  /** Permission OS foreground refusée → message + bouton Réglages. */
  permissionDenied: boolean;
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

  const subscriptionRef = useRef<Location.LocationSubscription | null>(null);
  // Garde **synchrone** anti-double-start : `watchPositionAsync` est async, donc
  // `subscriptionRef` n'est posé qu'après l'await → deux appels rapprochés passeraient
  // sinon tous deux le guard (deux watchers → fuite).
  const startingRef = useRef(false);
  // Démontage pendant l'await de `startWatching` : on jette la subscription qui arrive
  // trop tard (sinon watcher fantôme après navigation retour, AC5).
  const cancelledRef = useRef(false);

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
    } catch {
      // Erreur OS inattendue (ex. platform error, memory pressure) → afficher le panel
      // "permission refusée" comme fallback ; l'utilisateur peut ouvrir les Réglages.
      setPermissionDenied(true);
    } finally {
      startingRef.current = false;
    }
  }, []);

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

  // Cleanup au démontage (AC5) : stop watcher + reset position/km. Pas de suivi fantôme.
  useEffect(() => {
    cancelledRef.current = false;
    return () => {
      cancelledRef.current = true;
      if (subscriptionRef.current) {
        subscriptionRef.current.remove();
        subscriptionRef.current = null;
      }
      useLiveStore.getState().deactivateLiveMode();
    };
  }, []);

  const isLiveModeActive = useLiveStore((s) => s.isLiveModeActive);

  return {
    needsConsent: consentChecked && !hasConsented,
    permissionDenied,
    grantConsent,
    openSettings,
    isLiveModeActive,
  };
}
