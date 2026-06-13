import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  render,
  screen,
  userEvent,
  waitFor,
} from '@testing-library/react-native';
import type { AdventureResponse } from '@ridenrest/shared';
import { router } from 'expo-router';

import NewAdventureScreen from '@/app/(app)/adventures/new';
import * as adventuresApi from '@/lib/api/adventures';
import { i18n } from '@/lib/i18n';

// ⚠️ Hors de `src/app/` À DESSEIN (route → require.context, cf. AGENTS.md). On
// mocke la façade `@/lib/api/adventures`, `expo-router`, `safe-area-context`.
// `userEvent` (pas `fireEvent`) pour await les updates async RHF (gotcha MOB-2.2).

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

const mockCreate = adventuresApi.createAdventure as jest.Mock;
const mockReplace = router.replace as unknown as jest.Mock;
const t = (k: string) => i18n.t(k);

const CREATED: AdventureResponse = {
  id: 'adv-9',
  userId: 'user-1',
  name: 'Test',
  totalDistanceKm: 0,
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
      <NewAdventureScreen />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Écran création aventure (MOB-3.1 / AC2, AC7)', () => {
  it('valide le nom vide inline sans appeler le serveur', async () => {
    const user = userEvent.setup();
    await renderScreen();

    await user.press(screen.getByText(t('adventures.new.submit')));

    expect(await screen.findByText(t('adventures.errors.nameRequired'))).toBeTruthy();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('soumet createAdventure puis redirige vers le détail créé', async () => {
    mockCreate.mockResolvedValue(CREATED);
    const user = userEvent.setup();
    await renderScreen();

    await user.type(screen.getByLabelText(t('adventures.new.nameLabel')), 'Test');
    await user.press(screen.getByText(t('adventures.new.submit')));

    await waitFor(() => {
      expect(mockCreate).toHaveBeenCalledWith('Test');
    });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/adventures/adv-9');
    });
  });

  it('passe en chargement et empêche le double-submit', async () => {
    let resolveCreate: (v: AdventureResponse) => void = () => {};
    mockCreate.mockReturnValue(
      new Promise((resolve) => {
        resolveCreate = resolve;
      }),
    );
    const user = userEvent.setup();
    await renderScreen();

    await user.type(screen.getByLabelText(t('adventures.new.nameLabel')), 'Test');
    await user.press(screen.getByText(t('adventures.new.submit')));

    // Le libellé bascule en « Création… » : preuve de l'état chargement.
    expect(await screen.findByText(t('adventures.new.submitting'))).toBeTruthy();
    // Second tap pendant le chargement (bouton désactivé) → aucun appel en plus.
    await user.press(screen.getByText(t('adventures.new.submitting')));
    expect(mockCreate).toHaveBeenCalledTimes(1);

    resolveCreate(CREATED);
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/adventures/adv-9');
    });
  });

  it('affiche un ErrorBanner si la création REJETTE (réseau/serveur)', async () => {
    mockCreate.mockRejectedValue(new Error('Network request failed'));
    const user = userEvent.setup();
    await renderScreen();

    await user.type(screen.getByLabelText(t('adventures.new.nameLabel')), 'Test');
    await user.press(screen.getByText(t('adventures.new.submit')));

    expect(await screen.findByText(t('adventures.errors.createFailed'))).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
