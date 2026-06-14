import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react-native';
import { useLocalSearchParams } from 'expo-router';
import type { AdventureMapResponse, AdventureResponse } from '@ridenrest/shared';

import MapScreen from '@/app/(app)/map/[id]';
import * as adventuresApi from '@/lib/api/adventures';
import * as mapApi from '@/lib/api/map';
import { i18n } from '@/lib/i18n';

// ⚠️ Hors de `src/app/` À DESSEIN : importe une route (`require.context` bundlerait
// ce test sinon — cf. AGENTS.md). On mocke les FAÇADES réseau, `expo-router`
// (router + useLocalSearchParams) et safe-area. MapLibre est mocké globalement
// (jest.setup). Couvre AC1 (titre + trace), AC4 (vide / erreur), durcissement id.

jest.mock('@/lib/api/map', () => ({ getAdventureMapData: jest.fn() }));
// Calques POI (MOB-4.2) : on mocke la façade POI pour isoler la route du réseau.
// `findPois` résout [] → aucun pin, mais les toggles/sheet sont montés.
jest.mock('@/lib/api/pois', () => ({
  findPois: jest.fn().mockResolvedValue([]),
  getPoiGoogleDetails: jest.fn().mockResolvedValue(null),
  reverseCity: jest.fn().mockResolvedValue({
    city: null,
    postcode: null,
    state: null,
    country: null,
  }),
}));
jest.mock('@/lib/api/adventures', () => ({
  getAdventure: jest.fn(),
  listAdventures: jest.fn(),
  createAdventure: jest.fn(),
  renameAdventure: jest.fn(),
  deleteAdventure: jest.fn(),
}));
jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(),
}));
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));
// `useColorScheme` (NativeWind) jette en jest (setColorScheme sans darkMode:class)
// → mock statique du wrapper (parité segment-list.test).
jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => ({ colorScheme: 'light' }),
}));

const mockGetMap = mapApi.getAdventureMapData as jest.Mock;
const mockGetAdventure = adventuresApi.getAdventure as jest.Mock;
const mockParams = useLocalSearchParams as jest.Mock;

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
  };
}

async function renderScreen() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  await render(
    <QueryClientProvider client={qc}>
      <MapScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('MapScreen', () => {
  it('id falsy → aucune requête carte, état vide neutre (durcissement)', async () => {
    mockParams.mockReturnValue({});
    await renderScreen();
    expect(await screen.findByText(i18n.t('map.empty'))).toBeOnTheScreen();
    expect(mockGetMap).not.toHaveBeenCalled();
    expect(mockGetAdventure).not.toHaveBeenCalled();
  });

  it('affiche le nom de l’aventure et la trace (AC1)', async () => {
    mockParams.mockReturnValue({ id: 'adv-1' });
    mockGetAdventure.mockResolvedValue(makeAdventure('Tour du Mont'));
    mockGetMap.mockResolvedValue(makeMap(true));

    await renderScreen();

    expect(await screen.findByText('Tour du Mont')).toBeOnTheScreen();
    expect(await screen.findByTestId('trace-line')).toBeOnTheScreen();
    expect(
      screen.getByText('© OpenStreetMap contributors'),
    ).toBeOnTheScreen();
  });

  it('endpoint en erreur → ErrorBanner, fond de carte conservé (AC4)', async () => {
    mockParams.mockReturnValue({ id: 'adv-1' });
    mockGetAdventure.mockResolvedValue(makeAdventure('Tour'));
    mockGetMap.mockRejectedValue(new Error('boom'));

    await renderScreen();

    expect(await screen.findByText(i18n.t('map.loadFailed'))).toBeOnTheScreen();
    // L'attribution (donc la carte de fond) reste affichée.
    expect(screen.getByText('© OpenStreetMap contributors')).toBeOnTheScreen();
  });

  it('aucune trace parsée → état vide explicite (AC4)', async () => {
    mockParams.mockReturnValue({ id: 'adv-1' });
    mockGetAdventure.mockResolvedValue(makeAdventure('Tour'));
    mockGetMap.mockResolvedValue(makeMap(false));

    await renderScreen();

    expect(await screen.findByText(i18n.t('map.empty'))).toBeOnTheScreen();
    expect(screen.getByText(i18n.t('map.emptyCta'))).toBeOnTheScreen();
  });
});
