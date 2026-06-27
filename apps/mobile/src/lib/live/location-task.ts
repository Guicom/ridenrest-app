import type { LocationObject } from 'expo-location';
import * as TaskManager from 'expo-task-manager';

import { isValidLngLat } from '@/lib/map/maplibre-config';
import { useLiveStore } from '@/lib/stores/live.store';

// Tâche de localisation **background** (MOB-5.2 / T1, AC2). Enregistrée au **scope
// module** (jamais dans un composant) et **importée en tête de `app/_layout.tsx`** :
// `expo-task-manager` ré-invoque cette tâche après un cold-start de l'OS (app tuée puis
// relancée par le système pour livrer des positions), donc le handler doit exister
// AVANT toute navigation — sinon « TaskManager: Task not found ».
//
// RGPD (NFR-012 / NFR-LP-001) — CRITIQUE : ce handler écrit **uniquement** dans
// `useLiveStore` (client, en mémoire). Il ne fait **AUCUN** appel réseau / `apiFetch` /
// POST : la position GPS ne quitte JAMAIS le device, même écran éteint, même relance OS.
//
// Robustesse (NFR-032) : on ignore silencieusement les erreurs OS (`error` non nul) et
// les payloads sans position valide — jamais de throw (un throw dans une tâche background
// crashe le process). Le suivi foreground (`watchPositionAsync`, MOB-5.1) reste la source
// temps réel à l'écran ; cette tâche prend le relais quand l'app est en arrière-plan.

/** Nom de la tâche background `expo-task-manager` (référencé par `startLocationUpdatesAsync`). */
export const LIVE_LOCATION_TASK = 'live-location-task';

interface LocationTaskData {
  locations?: LocationObject[];
}

// `defineTask` exige un exécuteur retournant `Promise` (`TaskManagerTaskExecutor`) →
// handler `async`. Aucun `await` réel : on n'écrit que le store (synchrone), jamais de réseau.
TaskManager.defineTask(LIVE_LOCATION_TASK, async ({ data, error }) => {
  // Erreur OS (permission révoquée en cours de route, service interrompu…) → ne rien
  // faire (NFR-032 : jamais de crash silencieux). Le Live foreground reste fonctionnel.
  if (error) return;

  const { locations } = (data ?? {}) as LocationTaskData;
  // `at(-1)` : on ne garde que la position la **plus récente** du lot livré par l'OS
  // (le background batch parfois plusieurs fixes). Les positions intermédiaires ne sont
  // pas historisées (RGPD : aucune trace persistée).
  const latest = locations?.at(-1);
  if (!latest) return;

  const { latitude, longitude } = latest.coords;
  // Garde anti-coordonnée non finie (parité `isValidLngLat`) : protège les
  // `<GeoJSONSource>` natifs en aval (dot GPS) d'un SIGABRT MapLibre Native.
  if (!isValidLngLat(longitude, latitude)) return;

  // Guard : si le mode Live n'est plus actif (race deactivateLiveMode vs stopLocationUpdatesAsync),
  // on ignore silencieusement — le store a déjà été réinitialisé.
  if (!useLiveStore.getState().isLiveModeActive) return;

  // ⚠️ RGPD : écrit le store, ne POST jamais.
  useLiveStore.getState().updateGpsPosition({ lat: latitude, lng: longitude });
});
