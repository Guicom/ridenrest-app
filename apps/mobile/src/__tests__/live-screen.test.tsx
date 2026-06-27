import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AdventureMapResponse, AdventureResponse } from '@ridenrest/shared';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import * as Location from 'expo-location';

import LiveScreen from '@/app/(app)/live/[id]';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setConsent } from '@/lib/live/consent-storage';
import * as adventuresApi from '@/lib/api/adventures';
import * as mapApi from '@/lib/api/map';
import { i18n } from '@/lib/i18n';
import { useLiveStore } from '@/lib/stores/live.store';

// ⚠️ Hors de `src/app/` À DESSEIN (importe une route — cf. AGENTS.md). On mocke les façades
// réseau (carte/aventure), `expo-router` + safe-area + use-color-scheme. `expo-location` et
// AsyncStorage sont mockés globalement (jest.setup). MapLibre mocké globalement.
// Couvre AC1 (consentement affiché, non-dismissible), AC2 (Activer → permission), refus.

jest.mock('@/lib/api/map', () => ({ getAdventureMapData: jest.fn() }));
jest.mock('@/lib/api/adventures', () => ({
  getAdventure: jest.fn(),
  listAdventures: jest.fn(),
  createAdventure: jest.fn(),
  renameAdventure: jest.fn(),
  deleteAdventure: jest.fn(),
  updateAdventureAvgSpeedKmh: jest.fn(),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => ({ colorScheme: 'light' }),
}));

const mockGetMap = mapApi.getAdventureMapData as jest.Mock;
const mockGetAdventure = adventuresApi.getAdventure as jest.Mock;
const mockParams = useLocalSearchParams as jest.Mock;
const mockRequestForeground =
  Location.requestForegroundPermissionsAsync as jest.Mock;
const mockWatchPosition = Location.watchPositionAsync as jest.Mock;

function makeAdventure(name: string): AdventureResponse {
  return { id: 'adv-1', name, totalDistanceKm: 10 } as AdventureResponse;
}

function makeMap(withTrace: boolean): AdventureMapResponse {
  return {
    adventureId: 'adv-1',
    adventureName: 'Tour',
    totalDistanceKm: 10,
    totalElevationGainM: null,
    totalElevationLossM: null,
    segments: [
      {
        id: 's0',
        name: 'Segment',
        orderIndex: 0,
        cumulativeStartKm: 0,
        distanceKm: 10,
        parseStatus: 'done',
        source: null,
        waypoints: withTrace
          ? [
              { lat: 45, lng: 5, distKm: 0 },
              { lat: 46, lng: 6, distKm: 1 },
            ]
          : null,
        boundingBox: null,
      },
    ],
  } as AdventureMapResponse;
}

async function renderScreen() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={qc}>
      <LiveScreen />
    </QueryClientProvider>,
  );
}

const initialStore = useLiveStore.getState();

beforeEach(async () => {
  jest.clearAllMocks();
  await AsyncStorage.clear();
  useLiveStore.setState({ ...initialStore }, true);
  mockRequestForeground.mockResolvedValue({ status: 'granted' });
  mockWatchPosition.mockResolvedValue({ remove: jest.fn() });
});

describe('LiveScreen', () => {
  it('id falsy → état vide neutre, aucune requête (durcissement)', async () => {
    mockParams.mockReturnValue({});
    await renderScreen();
    expect(await screen.findByText(i18n.t('map.empty'))).toBeOnTheScreen();
    expect(mockGetMap).not.toHaveBeenCalled();
  });

  it('utilisateur non consentant → dialog de consentement (AC1)', async () => {
    mockParams.mockReturnValue({ id: 'adv-1' });
    mockGetAdventure.mockResolvedValue(makeAdventure('Tour du Mont'));
    mockGetMap.mockResolvedValue(makeMap(true));

    await renderScreen();

    // L'overlay de consentement porte `accessibilityViewIsModal` → il masque ses frères
    // (header/trace) aux requêtes a11y, comme VoiceOver/Maestro. On asserte donc le dialog.
    expect(
      await screen.findByText(i18n.t('live.consent.title')),
    ).toBeOnTheScreen();
    expect(
      screen.getByRole('button', { name: i18n.t('live.consent.accept') }),
    ).toBeOnTheScreen();
  });

  it('returning user (consentement persisté) → pas de dialog, carte + trace (AC3/AC4)', async () => {
    await setConsent(true);
    mockParams.mockReturnValue({ id: 'adv-1' });
    mockGetAdventure.mockResolvedValue(makeAdventure('Tour du Mont'));
    mockGetMap.mockResolvedValue(makeMap(true));

    await renderScreen();

    // Pas de dialog (auto-start) → header + trace interrogeables.
    expect(await screen.findByText('Tour du Mont')).toBeOnTheScreen();
    expect(await screen.findByTestId('trace-line')).toBeOnTheScreen();
    expect(screen.queryByText(i18n.t('live.consent.title'))).toBeNull();
    await waitFor(() => expect(mockRequestForeground).toHaveBeenCalled());
  });

  it('« Activer » → permission OS demandée + dialog fermé (AC2)', async () => {
    mockParams.mockReturnValue({ id: 'adv-1' });
    mockGetAdventure.mockResolvedValue(makeAdventure('Tour'));
    mockGetMap.mockResolvedValue(makeMap(true));

    await renderScreen();
    await screen.findByText(i18n.t('live.consent.title'));

    fireEvent.press(
      screen.getByRole('button', { name: i18n.t('live.consent.accept') }),
    );

    await waitFor(() => expect(mockRequestForeground).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByText(i18n.t('live.consent.title'))).toBeNull(),
    );
  });

  it('« Refuser » → message AC1, pas de permission demandée', async () => {
    mockParams.mockReturnValue({ id: 'adv-1' });
    mockGetAdventure.mockResolvedValue(makeAdventure('Tour'));
    mockGetMap.mockResolvedValue(makeMap(true));

    await renderScreen();
    await screen.findByText(i18n.t('live.consent.title'));

    fireEvent.press(
      screen.getByRole('button', { name: i18n.t('live.consent.refuse') }),
    );

    expect(
      await screen.findByText(i18n.t('live.refusedNotice')),
    ).toBeOnTheScreen();
    expect(mockRequestForeground).not.toHaveBeenCalled();
  });
});
