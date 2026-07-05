import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent } from '@testing-library/react-native';
import type { AdventureResponse } from '@ridenrest/shared';
import { router } from 'expo-router';

import AdventuresScreen from '@/app/(app)/adventures/index';
import * as adventuresApi from '@/lib/api/adventures';
import { i18n } from '@/lib/i18n';

// ⚠️ Hors de `src/app/` À DESSEIN : importe une route (`require.context` bundlerait
// ce test sinon — cf. AGENTS.md). On mocke la FAÇADE `@/lib/api/adventures` (pas
// `apiFetch`), `expo-router`, `react-native-safe-area-context`. Le hook
// `useAdventures` est exercé pour de vrai via un `QueryClientProvider`. La carte
// est iso web : tap → détail (renommage/suppression vivent sur l'écran détail).
// i18n réel (langue fr en test).

jest.mock('@/lib/api/adventures', () => ({
  listAdventures: jest.fn(),
  createAdventure: jest.fn(),
  renameAdventure: jest.fn(),
  deleteAdventure: jest.fn(),
  getAdventure: jest.fn(),
}));

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const mockList = adventuresApi.listAdventures as jest.Mock;
const mockPush = router.push as unknown as jest.Mock;
const t = (k: string, opts?: Record<string, unknown>) => i18n.t(k, opts);

const ADVENTURE: AdventureResponse = {
  id: 'adv-1',
  userId: 'user-1',
  name: 'Tour du Mont-Blanc',
  totalDistanceKm: 170.4,
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

async function renderScreen(): Promise<void> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  await render(
    <QueryClientProvider client={queryClient}>
      <AdventuresScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Écran liste aventures (MOB-3.1 / AC1, AC5, AC6)', () => {
  it('rend des skeletons pendant le chargement (isPending)', async () => {
    // La query ne résout jamais → reste en chargement.
    mockList.mockReturnValue(new Promise(() => {}));
    await renderScreen();
    // Le Skeleton est masqué des lecteurs d'écran (élément décoratif) → RNTL v14
    // l'exclut par défaut des requêtes : on force `includeHiddenElements`.
    expect(
      screen.getAllByTestId('adventure-skeleton', { includeHiddenElements: true })
        .length,
    ).toBeGreaterThan(0);
  });

  it('rend l’état vide (titre + CTA) quand la liste est vide', async () => {
    mockList.mockResolvedValue([]);
    await renderScreen();
    expect(await screen.findByText(t('adventures.empty.title'))).toBeTruthy();
    expect(screen.getByText(t('adventures.empty.cta'))).toBeTruthy();
  });

  it('tap sur le CTA vide → navigue vers /new', async () => {
    mockList.mockResolvedValue([]);
    const user = userEvent.setup();
    await renderScreen();
    await user.press(await screen.findByText(t('adventures.empty.cta')));
    expect(mockPush).toHaveBeenCalledWith('/(app)/adventures/new');
  });

  it('rend l’ErrorBanner (et PAS l’état vide) quand le fetch échoue', async () => {
    mockList.mockRejectedValue(new Error('boom'));
    await renderScreen();
    expect(await screen.findByText(t('adventures.errors.loadFailed'))).toBeTruthy();
    expect(screen.queryByText(t('adventures.empty.title'))).toBeNull();
  });

  it('rend les cartes (nom + distance) quand la liste est peuplée', async () => {
    mockList.mockResolvedValue([ADVENTURE]);
    await renderScreen();
    expect(await screen.findByText('Tour du Mont-Blanc')).toBeTruthy();
    expect(screen.getByText('170.4 km')).toBeTruthy();
  });

  it('tap sur une carte → navigue vers le détail', async () => {
    mockList.mockResolvedValue([ADVENTURE]);
    const user = userEvent.setup();
    await renderScreen();
    await user.press(
      await screen.findByLabelText(t('adventures.card.openA11y')),
    );
    expect(mockPush).toHaveBeenCalledWith('/(app)/adventures/adv-1');
  });
});
