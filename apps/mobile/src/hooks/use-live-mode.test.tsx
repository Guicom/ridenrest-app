import type { MapWaypoint } from '@ridenrest/shared';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import * as Location from 'expo-location';
import { Pressable, Text } from 'react-native';

import { useLiveMode } from '@/hooks/use-live-mode';
import { setConsent } from '@/lib/live/consent-storage';
import { useLiveStore } from '@/lib/stores/live.store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Lifecycle du mode Live (MOB-5.1 / T3). Pattern **Probe** (pas `renderHook` — peu fiable
// RNTL v14 + React 19, cf. use-network-status.test). `expo-location` est mocké globalement
// (jest.setup) → on surcharge `requestForegroundPermissionsAsync`/`watchPositionAsync` par
// test. AsyncStorage (consentement) mocké globalement → vidé entre tests.

const mockRequestForeground =
  Location.requestForegroundPermissionsAsync as jest.Mock;
const mockWatchPosition = Location.watchPositionAsync as jest.Mock;
// MOB-5.2 — escalade background « Always » + démarrage/arrêt du suivi par tâche.
const mockRequestBackground =
  Location.requestBackgroundPermissionsAsync as jest.Mock;
const mockStartUpdates = Location.startLocationUpdatesAsync as jest.Mock;
const mockStopUpdates = Location.stopLocationUpdatesAsync as jest.Mock;
const mockHasStarted = Location.hasStartedLocationUpdatesAsync as jest.Mock;

const WAYPOINTS: MapWaypoint[] = [
  { lat: 45, lng: 5, distKm: 0 },
  { lat: 46, lng: 6, distKm: 1 },
] as MapWaypoint[];

function Probe({ waypoints = WAYPOINTS }: { waypoints?: MapWaypoint[] }) {
  const { needsConsent, permissionDenied, isLiveModeActive, grantConsent } =
    useLiveMode(waypoints);
  return (
    <>
      <Text>{needsConsent ? 'needsConsent' : 'noNeedConsent'}</Text>
      <Text>{permissionDenied ? 'denied' : 'notDenied'}</Text>
      <Text>{isLiveModeActive ? 'active' : 'inactive'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="grant" onPress={grantConsent}>
        <Text>grant</Text>
      </Pressable>
    </>
  );
}

const initialStore = useLiveStore.getState();

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  useLiveStore.setState({ ...initialStore }, true);
  // Défauts : permission accordée + watch qui retourne une subscription (cb piloté au test).
  mockRequestForeground.mockResolvedValue({ status: 'granted' });
  mockWatchPosition.mockResolvedValue({ remove: jest.fn() });
  // MOB-5.2 — défauts background : « Always » accordé, suivi non encore démarré.
  mockRequestBackground.mockResolvedValue({ status: 'granted' });
  mockStartUpdates.mockResolvedValue(undefined);
  mockStopUpdates.mockResolvedValue(undefined);
  mockHasStarted.mockResolvedValue(false);
});

describe('useLiveMode', () => {
  it('sans consentement persisté → needsConsent, aucune permission/watch (AC1)', async () => {
    await render(<Probe />);
    expect(await screen.findByText('needsConsent')).toBeTruthy();
    expect(mockRequestForeground).not.toHaveBeenCalled();
    expect(mockWatchPosition).not.toHaveBeenCalled();
    expect(useLiveStore.getState().isLiveModeActive).toBe(false);
  });

  it('grantConsent → permission demandée + watch démarré (AC2/AC3)', async () => {
    await render(<Probe />);
    await screen.findByText('needsConsent');

    fireEvent.press(screen.getByLabelText('grant'));

    await waitFor(() => expect(mockRequestForeground).toHaveBeenCalled());
    await waitFor(() => expect(mockWatchPosition).toHaveBeenCalled());
    expect(useLiveStore.getState().geolocationConsented).toBe(true);
  });

  it('permission refusée → permissionDenied, pas de watch (AC2)', async () => {
    mockRequestForeground.mockResolvedValue({ status: 'denied' });
    await render(<Probe />);
    await screen.findByText('needsConsent');

    fireEvent.press(screen.getByLabelText('grant'));

    expect(await screen.findByText('denied')).toBeTruthy();
    expect(mockWatchPosition).not.toHaveBeenCalled();
    expect(useLiveStore.getState().isLiveModeActive).toBe(false);
  });

  it('position reçue → updateGpsPosition + activation + projection snapToTrace→km (AC3)', async () => {
    let capturedCb: ((loc: { coords: { latitude: number; longitude: number } }) => void) | null =
      null;
    mockWatchPosition.mockImplementation(async (_opts, cb) => {
      capturedCb = cb;
      return { remove: jest.fn() };
    });

    await render(<Probe />);
    await screen.findByText('needsConsent');
    fireEvent.press(screen.getByLabelText('grant'));
    await waitFor(() => expect(capturedCb).not.toBeNull());

    // Position proche du waypoint (46,6) → km attendu = 1.
    await act(async () => {
      capturedCb!({ coords: { latitude: 45.9, longitude: 5.9 } });
    });

    expect(await screen.findByText('active')).toBeTruthy();
    const s = useLiveStore.getState();
    expect(s.currentPosition).toEqual({ lat: 45.9, lng: 5.9 });
    expect(s.currentKmOnRoute).toBe(1);
  });

  it('consentement déjà persisté → auto-start sans dialog (AC4)', async () => {
    await setConsent(true);
    await render(<Probe />);

    // Le dialog n'est jamais demandé (auto-start) ; la permission/watch partent seuls.
    await waitFor(() => expect(mockRequestForeground).toHaveBeenCalled());
    await waitFor(() => expect(mockWatchPosition).toHaveBeenCalled());
    expect(screen.queryByText('needsConsent')).toBeNull();
    expect(screen.getByText('noNeedConsent')).toBeTruthy();
  });

  it('unmount → subscription.remove + deactivateLiveMode (AC5)', async () => {
    const removeMock = jest.fn();
    let capturedCb: ((loc: { coords: { latitude: number; longitude: number } }) => void) | null =
      null;
    mockWatchPosition.mockImplementation(async (_opts, cb) => {
      capturedCb = cb;
      return { remove: removeMock };
    });

    const view = await render(<Probe />);
    await screen.findByText('needsConsent');
    fireEvent.press(screen.getByLabelText('grant'));
    await waitFor(() => expect(capturedCb).not.toBeNull());

    // Émet une position : ce `act` async flush aussi l'affectation de `subscriptionRef`
    // (faite après l'`await watchPositionAsync`), garantissant un watch établi.
    await act(async () => {
      capturedCb!({ coords: { latitude: 45, longitude: 5 } });
    });
    expect(await screen.findByText('active')).toBeTruthy();

    await act(async () => {
      view.unmount();
    });

    expect(removeMock).toHaveBeenCalled();
    const s = useLiveStore.getState();
    expect(s.isLiveModeActive).toBe(false);
    expect(s.currentPosition).toBeNull();
    expect(s.currentKmOnRoute).toBeNull();
  });

  it('erreur OS inattendue (requestForegroundPermissionsAsync throw) → permissionDenied, pas de watch', async () => {
    mockRequestForeground.mockRejectedValue(new Error('Platform error'));
    await render(<Probe />);
    await screen.findByText('needsConsent');

    fireEvent.press(screen.getByLabelText('grant'));

    expect(await screen.findByText('denied')).toBeTruthy();
    expect(mockWatchPosition).not.toHaveBeenCalled();
    expect(useLiveStore.getState().isLiveModeActive).toBe(false);
  });

  describe('escalade background (MOB-5.2)', () => {
    it('« Always » accordé → startLocationUpdatesAsync (suivi écran-éteint, AC2)', async () => {
      await render(<Probe />);
      await screen.findByText('needsConsent');
      fireEvent.press(screen.getByLabelText('grant'));

      await waitFor(() => expect(mockRequestBackground).toHaveBeenCalled());
      await waitFor(() =>
        expect(mockStartUpdates).toHaveBeenCalledWith(
          'live-location-task',
          expect.objectContaining({ foregroundService: expect.any(Object) }),
        ),
      );
    });

    it('« Always » refusé → pas de start background, foreground intact (dégradation AC6)', async () => {
      mockRequestBackground.mockResolvedValue({ status: 'denied' });
      let capturedCb:
        | ((loc: { coords: { latitude: number; longitude: number } }) => void)
        | null = null;
      mockWatchPosition.mockImplementation(async (_opts, cb) => {
        capturedCb = cb;
        return { remove: jest.fn() };
      });

      await render(<Probe />);
      await screen.findByText('needsConsent');
      fireEvent.press(screen.getByLabelText('grant'));

      await waitFor(() => expect(mockRequestBackground).toHaveBeenCalled());
      // Le foreground reste pleinement fonctionnel : une position l'active toujours.
      await waitFor(() => expect(capturedCb).not.toBeNull());
      await act(async () => {
        capturedCb!({ coords: { latitude: 45, longitude: 5 } });
      });
      expect(await screen.findByText('active')).toBeTruthy();
      expect(mockStartUpdates).not.toHaveBeenCalled();
    });

    it('suivi déjà démarré → pas de double start (idempotence)', async () => {
      mockHasStarted.mockResolvedValue(true);
      await render(<Probe />);
      await screen.findByText('needsConsent');
      fireEvent.press(screen.getByLabelText('grant'));

      await waitFor(() => expect(mockHasStarted).toHaveBeenCalled());
      expect(mockStartUpdates).not.toHaveBeenCalled();
    });

    it('unmount → stopLocationUpdatesAsync si suivi actif (pas de tâche fantôme, AC5)', async () => {
      mockHasStarted.mockResolvedValue(true);
      const view = await render(<Probe />);
      await screen.findByText('needsConsent');
      fireEvent.press(screen.getByLabelText('grant'));
      await waitFor(() => expect(mockRequestBackground).toHaveBeenCalled());

      await act(async () => {
        view.unmount();
      });

      await waitFor(() =>
        expect(mockStopUpdates).toHaveBeenCalledWith('live-location-task'),
      );
    });
  });
});
