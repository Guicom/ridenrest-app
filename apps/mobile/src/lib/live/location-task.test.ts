import * as TaskManager from 'expo-task-manager';

import { useLiveStore } from '@/lib/stores/live.store';
// Import à effet de bord : exécute `TaskManager.defineTask(LIVE_LOCATION_TASK, …)`.
import { LIVE_LOCATION_TASK } from './location-task';

// Tâche de localisation background (MOB-5.2 / T1, AC2). `expo-task-manager` est mocké
// globalement (jest.setup) : `defineTask` capture le handler, `__getTask` le restitue. On
// déclenche le handler avec un payload `{ data, error }` simulé et on vérifie l'effet RGPD :
// écriture **store uniquement**, jamais de requête réseau.

const tm = TaskManager as unknown as {
  __getTask: (name: string) => ((p: unknown) => void) | undefined;
};

type LocationPayload = {
  data: { locations?: { coords: { latitude: number; longitude: number } }[] } | null;
  error: unknown;
};

const initialStore = useLiveStore.getState();

function runTask(payload: LocationPayload): void {
  const handler = tm.__getTask(LIVE_LOCATION_TASK);
  if (!handler) throw new Error('LIVE_LOCATION_TASK non enregistrée');
  handler(payload);
}

beforeEach(() => {
  // Live mode actif par défaut : la tâche background ne tourne que pendant une session Live.
  useLiveStore.setState({ ...initialStore, isLiveModeActive: true }, true);
});

describe('location-task (background GPS)', () => {
  it('defineTask enregistre LIVE_LOCATION_TASK au scope module', () => {
    expect(typeof tm.__getTask(LIVE_LOCATION_TASK)).toBe('function');
  });

  it('écrit updateGpsPosition depuis la position la plus récente (locations.at(-1))', () => {
    runTask({
      data: {
        locations: [
          { coords: { latitude: 1, longitude: 2 } },
          { coords: { latitude: 45.1, longitude: 5.2 } },
        ],
      },
      error: null,
    });
    expect(useLiveStore.getState().currentPosition).toEqual({ lat: 45.1, lng: 5.2 });
  });

  it('ignore une erreur OS (NFR-032) — store inchangé, pas de throw', () => {
    expect(() =>
      runTask({ data: null, error: { message: 'permission revoked' } }),
    ).not.toThrow();
    expect(useLiveStore.getState().currentPosition).toBeNull();
  });

  it('payload sans position → no-op (store inchangé)', () => {
    runTask({ data: { locations: [] }, error: null });
    expect(useLiveStore.getState().currentPosition).toBeNull();
  });

  it('coordonnée non finie filtrée (anti-SIGABRT MapLibre Native)', () => {
    runTask({
      data: { locations: [{ coords: { latitude: NaN, longitude: 5 } }] },
      error: null,
    });
    expect(useLiveStore.getState().currentPosition).toBeNull();
  });

  it('isLiveModeActive=false → no-op (race deactivateLiveMode vs stopLocationUpdatesAsync)', () => {
    useLiveStore.getState().deactivateLiveMode();
    runTask({
      data: { locations: [{ coords: { latitude: 10, longitude: 20 } }] },
      error: null,
    });
    expect(useLiveStore.getState().currentPosition).toBeNull();
  });

  it('RGPD : ne POST jamais — aucun fetch réseau déclenché', () => {
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response(null));
    runTask({
      data: { locations: [{ coords: { latitude: 10, longitude: 20 } }] },
      error: null,
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(useLiveStore.getState().currentPosition).toEqual({ lat: 10, lng: 20 });
    fetchSpy.mockRestore();
  });
});
