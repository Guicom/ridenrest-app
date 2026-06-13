import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import type {
  AdventureResponse,
  AdventureSegmentResponse,
} from '@ridenrest/shared';

import AdventureDetailScreen from '@/app/(app)/adventures/[id]';
import * as adventuresApi from '@/lib/api/adventures';
import * as segmentsApi from '@/lib/api/segments';
import { i18n } from '@/lib/i18n';

// ⚠️ Hors de `src/app/` À DESSEIN : importe une route (`require.context` bundlerait
// ce test sinon — cf. AGENTS.md). Couvre AC2 : la suppression d'un segment appelle
// la mutation APRÈS confirmation ; le remplacement = delete PUIS ré-upload (pick()).
// On mocke les façades réseau, expo-router, safe-area, le gpx-uploader (expose
// `pick`) et `react-native-reanimated-dnd` (sans JSX RN → Fragment/children nus,
// gotcha NativeWind). `Alert.alert` est espionné pour déclencher le bouton confirm.

jest.mock('@/lib/api/adventures', () => ({
  listAdventures: jest.fn(),
  createAdventure: jest.fn(),
  renameAdventure: jest.fn(),
  deleteAdventure: jest.fn(),
  getAdventure: jest.fn(),
}));

jest.mock('@/lib/api/segments', () => ({
  listSegments: jest.fn(),
  uploadSegment: jest.fn(),
  reorderSegments: jest.fn(),
  renameSegment: jest.fn(),
  deleteSegment: jest.fn(),
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({ id: 'adv-1' })),
}));

// Import Strava (MOB-3.4) câblé dans l'écran : on neutralise la détection de
// connexion (sinon `@/lib/auth/client` → `@better-auth/expo` ESM non transpilé fait
// échouer le parse du suite). La sheet reste fermée par défaut (bouton non pressé).
jest.mock('@/hooks/use-strava-connection', () => ({
  useStravaConnection: () => ({
    isConnected: false,
    isLoading: false,
    isError: false,
    connect: jest.fn(),
    disconnect: jest.fn(),
    isConnecting: false,
    isDisconnecting: false,
  }),
}));

// `@/lib/api/api-client` (importé par la sheet via `use-strava`) tire `@/lib/auth/
// client` (ESM). On le stube : ce test mocke déjà les façades réseau, l'`apiFetch`
// réel n'est jamais appelé ici.
jest.mock('@/lib/api/api-client', () => ({
  apiFetch: jest.fn(),
  ApiError: class ApiError extends Error {},
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

// gpx-uploader : expose un `pick` espionnable via le handle impératif (forwardRef).
// Pas de JSX RN dans la factory → on retourne `null` et on câble la ref.
jest.mock('@/components/adventure/gpx-uploader', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { forwardRef, useImperativeHandle } = require('react');
  const GpxUploader = forwardRef(function GpxUploader(_props: any, ref: any) {
    useImperativeHandle(ref, () => ({ pick: mockPick }));
    return null;
  });
  return { GpxUploader };
});

// DnD : Fragment/children nus (cf. segment-list.test.tsx — gotcha NativeWind).
jest.mock('react-native-reanimated-dnd', () => {
  const useSortableList = ({ data }: { data: { id: string }[] }) => ({
    positions: { value: {} },
    dropProviderRef: { current: null },
    contentHeight: data.length * 132,
    getItemProps: (item: { id: string }) => ({
      id: item.id,
      positions: { value: {} },
      lowerBound: { value: 0 },
      autoScrollDirection: { value: 'none' },
      itemsCount: data.length,
      itemHeight: 132,
    }),
  });
  const DropProvider = ({ children }: any) => children;
  const SortableItem = ({ children }: any) => children;
  SortableItem.Handle = ({ children }: any) => children;
  return { useSortableList, DropProvider, SortableItem };
});

const mockPick = jest.fn();
const mockGetAdventure = adventuresApi.getAdventure as jest.Mock;
const mockListSegments = segmentsApi.listSegments as jest.Mock;
const mockDeleteSegment = segmentsApi.deleteSegment as jest.Mock;
const t = (k: string, opts?: Record<string, unknown>) => i18n.t(k, opts);

const ADVENTURE: AdventureResponse = {
  id: 'adv-1',
  userId: 'user-1',
  name: 'Tour du Mont-Blanc',
  totalDistanceKm: 120.5,
  totalElevationGainM: null,
  totalElevationLossM: null,
  startDate: null,
  endDate: null,
  status: 'planning',
  densityStatus: 'idle',
  densityProgress: 0,
  avgSpeedKmh: 15,
  routingProfile: 'gravel',
  hasStravaSegment: false,
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-01T10:00:00.000Z',
};

const SEGMENT: AdventureSegmentResponse = {
  id: 'seg-1',
  adventureId: 'adv-1',
  name: 'Étape 1',
  orderIndex: 0,
  cumulativeStartKm: 0,
  distanceKm: 42.3,
  elevationGainM: null,
  elevationLossM: null,
  parseStatus: 'done',
  source: null,
  boundingBox: null,
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-01T10:00:00.000Z',
};

async function renderScreen(): Promise<void> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await render(
    <QueryClientProvider client={queryClient}>
      <AdventureDetailScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockGetAdventure.mockResolvedValue(ADVENTURE);
  mockListSegments.mockResolvedValue([SEGMENT]);
  mockDeleteSegment.mockResolvedValue({ deleted: true });
});

describe('Écran détail aventure — actions segment (MOB-3.3 / AC2)', () => {
  it('affiche la distance totale (stats aventure) et le segment', async () => {
    await renderScreen();
    expect(
      await screen.findByText(
        t('adventures.segments.distanceKm', { value: '120,5' }),
      ),
    ).toBeTruthy();
    expect(screen.getByText('Étape 1')).toBeTruthy();
  });

  it('suppression : appelle deleteSegment APRÈS confirmation', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const user = userEvent.setup();
    await renderScreen();
    await screen.findByText('Étape 1');

    await user.press(screen.getByLabelText(t('adventures.segments.delete')));

    // Récupère le bouton « Supprimer » destructif de la confirmation et l'exécute.
    const [, , buttons] = alertSpy.mock.calls.at(-1)!;
    const confirm = buttons?.find((b) => b.style === 'destructive');
    expect(confirm).toBeTruthy();
    confirm!.onPress?.();

    await waitFor(() =>
      expect(mockDeleteSegment).toHaveBeenCalledWith('adv-1', 'seg-1'),
    );
  });

  it('remplacement : delete confirmé PUIS pick() (ré-upload)', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const user = userEvent.setup();
    await renderScreen();
    await screen.findByText('Étape 1');

    await user.press(screen.getByLabelText(t('adventures.segments.replace')));

    const [, , buttons] = alertSpy.mock.calls.at(-1)!;
    const confirm = buttons?.find((b) => b.style === 'destructive');
    confirm!.onPress?.();

    // delete d'abord ; le pick() suit au succès du delete (onSuccess).
    await waitFor(() =>
      expect(mockDeleteSegment).toHaveBeenCalledWith('adv-1', 'seg-1'),
    );
    await waitFor(() => expect(mockPick).toHaveBeenCalled());
  });
});
