import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  render,
  screen,
  userEvent,
  waitFor,
} from '@testing-library/react-native';
import { router } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { StravaImportSheet } from '@/components/adventure/strava-import-sheet';
import { ApiError, apiFetch } from '@/lib/api/api-client';
import { i18n } from '@/lib/i18n';

// Sheet d'import Strava (MOB-3.4 / T7). On mocke `apiFetch` (jamais de réseau réel)
// et `expo-router`, et on rend dans un vrai QueryClientProvider → exerce la sheet ET
// les hooks `useStravaRoutes`/`useImportStravaRoute`.
//
// `react-native-svg`/AsyncStorage : transpilé/mock global (jest.setup) → la sheet
// (qui rend `<PoweredByStrava>`) fonctionne sans mock JSX.

jest.mock('@/lib/api/api-client', () => {
  class ApiError extends Error {
    status: number;
    code?: string;
    constructor(message: string, status: number, code?: string) {
      super(message);
      this.name = 'ApiError';
      this.status = status;
      this.code = code;
    }
  }
  return { apiFetch: jest.fn(), ApiError };
});

jest.mock('expo-router', () => ({
  router: { push: jest.fn() },
}));

// `PoweredByStrava` (réel, rendu via SvgXml + `accessibilityLabel="Powered by
// Strava"`) lit `useColorScheme` (notre wrapper), dont l'effet d'hydratation appelle
// `setColorScheme` NativeWind → throw en env Jest sans `darkMode: class`. On mocke
// donc le WRAPPER `@/hooks/use-color-scheme` (valeur statique), pas le composant : le
// vrai badge officiel est ainsi exercé. Factory sans JSX/RN (gotcha AGENTS.md).
jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => ({ colorScheme: 'light' }),
}));

const mockApiFetch = apiFetch as unknown as jest.Mock;
const mockRouterPush = router.push as unknown as jest.Mock;
const t = (k: string, o?: Record<string, unknown>) => i18n.t(k, o);

const ADVENTURE_ID = '11111111-1111-4111-8111-111111111111';

function makeRoutes(count: number, offset = 0) {
  return Array.from({ length: count }, (_, i) => ({
    id: `route-${offset + i}`,
    name: `Route ${offset + i}`,
    distanceKm: 10 + i,
    elevationGainM: 100 + i,
  }));
}

async function renderSheet(props: {
  stravaConnected: boolean;
  onClose?: () => void;
  onImportStarted?: () => void;
}) {
  // `useStravaRoutes` force `retry: 1` (override du défaut client) ; on annule le
  // BACKOFF (`retryDelay: 0`) pour que l'unique retry échoue instantanément en test
  // → l'erreur surface dans le timeout de `findBy`.
  // `gcTime: 0` : les tests de chargement utilisent des promesses jamais résolues
  // (`new Promise(() => {})`). Sans ça, chaque QueryClient abandonné garde un timer
  // gc (défaut 5 min) → handle ouvert → jest hang en local, et en CI l'accumulation
  // de timers fait flaky-timeout un test (« Exceeded timeout of 5000 ms »). gcTime 0
  // → la query est libérée dès l'unmount, aucun timer résiduel. (Fix flaky 2026-07-05.)
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, retryDelay: 0, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  const onClose = props.onClose ?? jest.fn();
  // `initialMetrics` fournit des insets déterministes (pas de mesure native en test)
  // → `useSafeAreaInsets()` dans la sheet ne throw pas.
  const initialMetrics = {
    frame: { x: 0, y: 0, width: 390, height: 844 },
    insets: { top: 47, left: 0, right: 0, bottom: 34 },
  };
  // `await render` : RNTL v14 + React 19 → flush des effets async (query/i18n) au
  // montage (gotcha MOB-2.2 / use-adventures.test).
  const utils = await render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <QueryClientProvider client={queryClient}>
        <StravaImportSheet
          adventureId={ADVENTURE_ID}
          open
          onClose={onClose}
          onImportStarted={props.onImportStarted}
          stravaConnected={props.stravaConnected}
        />
      </QueryClientProvider>
    </SafeAreaProvider>,
  );
  return { ...utils, onClose };
}

// Ce fichier est userEvent-heavy (RNTL v14, délais réels) + rend un vrai
// QueryClientProvider. En local chaque test passe en <400 ms, mais sur un runner CI
// partagé (lent) un test a dépassé le défaut Jest de 5 s (« Exceeded timeout of
// 5000 ms ») → flaky-fail bloquant. Marge portée à 15 s (les tests restent rapides
// quand la machine suit). (Fix flaky CI 2026-07-05.)
jest.setTimeout(15000);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('StravaImportSheet (MOB-3.4 / T7)', () => {
  it('non connecté → état « non connecté » + CTA, AUCUN appel /strava/routes (AC4)', async () => {
    await renderSheet({ stravaConnected: false });

    expect(
      await screen.findByText(t('strava.import.notConnected.title')),
    ).toBeTruthy();
    expect(screen.getByText(t('strava.import.notConnected.cta'))).toBeTruthy();
    // Lazy : aucune requête de listing déclenchée tant que non connecté.
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('CTA « Connecter Strava » → navigue vers les paramètres', async () => {
    const onClose = jest.fn();
    const user = userEvent.setup();
    await renderSheet({ stravaConnected: false, onClose });

    await user.press(
      await screen.findByText(t('strava.import.notConnected.cta')),
    );
    expect(onClose).toHaveBeenCalled();
    expect(mockRouterPush).toHaveBeenCalledWith('/(app)/settings');
  });

  it('connecté + loading → appelle /strava/routes?page=1, pas encore de ligne', async () => {
    // La requête ne résout jamais → reste en chargement (skeletons affichés).
    mockApiFetch.mockReturnValue(new Promise(() => {}));
    await renderSheet({ stravaConnected: true });

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/strava/routes?page=1');
    });
    // Pendant le chargement : aucune ligne d'itinéraire ni message vide.
    expect(screen.queryByText(t('strava.import.empty'))).toBeNull();
    expect(screen.queryByText(t('strava.import.importButton'))).toBeNull();
  });

  it('routes chargées → N lignes + bouton Importer + attribution « Powered by Strava »', async () => {
    mockApiFetch.mockResolvedValue(makeRoutes(2));
    await renderSheet({ stravaConnected: true });

    expect(await screen.findByText('Route 0')).toBeTruthy();
    expect(screen.getByText('Route 1')).toBeTruthy();
    expect(screen.getAllByText(t('strava.import.importButton'))).toHaveLength(2);
    // Attribution officielle visible dès que la liste l'est (AC3).
    expect(screen.getByLabelText('Powered by Strava')).toBeTruthy();
  });

  it('liste vide → message « aucun itinéraire »', async () => {
    mockApiFetch.mockResolvedValue([]);
    await renderSheet({ stravaConnected: true });

    expect(await screen.findByText(t('strava.import.empty'))).toBeTruthy();
    // Pas d'attribution si aucune donnée Strava visible (16-32 AC4).
    expect(screen.queryByLabelText('Powered by Strava')).toBeNull();
  });

  it('import OK → POST /import, feedback succès, ferme la sheet (AC2)', async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/strava/routes?page=1') return Promise.resolve(makeRoutes(1));
      return Promise.resolve({ id: 'seg-1', parseStatus: 'pending' });
    });
    const onClose = jest.fn();
    const onImportStarted = jest.fn();
    const user = userEvent.setup();
    await renderSheet({ stravaConnected: true, onClose, onImportStarted });

    await user.press(await screen.findByText(t('strava.import.importButton')));

    await waitFor(() => {
      expect(mockApiFetch).toHaveBeenCalledWith('/strava/routes/route-0/import', {
        method: 'POST',
        body: JSON.stringify({ adventureId: ADVENTURE_ID }),
      });
    });
    await waitFor(() => expect(onImportStarted).toHaveBeenCalled());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('import pending → le bouton Annuler est désactivé et ne reset pas la mutation', async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/strava/routes?page=1') return Promise.resolve(makeRoutes(1));
      return new Promise(() => {});
    });
    const onClose = jest.fn();
    const user = userEvent.setup();
    await renderSheet({ stravaConnected: true, onClose });

    await user.press(await screen.findByText(t('strava.import.importButton')));

    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: t('common.cancel') }).props
          .accessibilityState,
      ).toMatchObject({ disabled: true });
    });
    await user.press(screen.getByText(t('common.cancel')));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('erreur page suivante → garde le bouton Charger plus pour retry la même page', async () => {
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/strava/routes?page=1') return Promise.resolve(makeRoutes(30));
      if (path === '/strava/routes?page=2') {
        return Promise.reject(new ApiError('Erreur Strava API', 502));
      }
      return Promise.resolve([]);
    });
    const user = userEvent.setup();
    await renderSheet({ stravaConnected: true });

    await user.press(await screen.findByText(t('strava.import.loadMore')));
    expect(await screen.findByText(t('strava.errors.stravaDown'))).toBeTruthy();
    expect(screen.getByText(t('strava.import.loadMore'))).toBeTruthy();

    await user.press(screen.getByText(t('strava.import.loadMore')));
    await waitFor(() => {
      const pageTwoCalls = mockApiFetch.mock.calls.filter(
        ([path]) => path === '/strava/routes?page=2',
      );
      expect(pageTwoCalls.length).toBeGreaterThan(1);
    });
  });

  it('erreur 429 → ErrorBanner i18n rate-limit', async () => {
    mockApiFetch.mockRejectedValue(
      new ApiError('Réessaie dans quelques minutes', 429),
    );
    await renderSheet({ stravaConnected: true });

    expect(
      await screen.findByText(t('strava.errors.rateLimit15')),
    ).toBeTruthy();
  });

  it('erreur 429 « demain » → message quota journalier', async () => {
    mockApiFetch.mockRejectedValue(
      new ApiError('Limite atteinte pour aujourd’hui, réessaie demain', 429),
    );
    await renderSheet({ stravaConnected: true });

    expect(
      await screen.findByText(t('strava.errors.rateLimitDaily')),
    ).toBeTruthy();
  });

  it('erreur 404 → bascule sur l’état « non connecté » (pas de banner)', async () => {
    mockApiFetch.mockRejectedValue(new ApiError('Compte Strava non connecté', 404));
    await renderSheet({ stravaConnected: true });

    expect(
      await screen.findByText(t('strava.import.notConnected.title')),
    ).toBeTruthy();
    expect(screen.queryByText(t('strava.errors.notConnected'))).toBeNull();
  });

  it('erreur 502 → ErrorBanner Strava indisponible', async () => {
    mockApiFetch.mockRejectedValue(new ApiError('Erreur Strava API', 502));
    await renderSheet({ stravaConnected: true });

    expect(await screen.findByText(t('strava.errors.stravaDown'))).toBeTruthy();
  });

  it('erreur réseau (status 0) → ErrorBanner réseau', async () => {
    mockApiFetch.mockRejectedValue(
      new ApiError('Network request failed', 0, 'NETWORK_ERROR'),
    );
    await renderSheet({ stravaConnected: true });

    expect(await screen.findByText(t('strava.errors.network'))).toBeTruthy();
  });

  it('anti-double-submit : un import en vol désactive les boutons des autres lignes (AC6)', async () => {
    let resolveImport: ((v: unknown) => void) | undefined;
    mockApiFetch.mockImplementation((path: string) => {
      if (path === '/strava/routes?page=1') return Promise.resolve(makeRoutes(2));
      return new Promise((res) => {
        resolveImport = res;
      });
    });
    const user = userEvent.setup();
    await renderSheet({ stravaConnected: true });

    const buttons = await screen.findAllByText(t('strava.import.importButton'));
    await user.press(buttons[0]);

    // Les deux boutons sont désormais occupés/désactivés (mutation pending).
    await waitFor(() => {
      const all = screen.getAllByRole('button');
      const importButtons = all.filter(
        (b) => b.props.accessibilityState?.disabled,
      );
      expect(importButtons.length).toBeGreaterThanOrEqual(2);
    });

    resolveImport?.({ id: 'seg-1', parseStatus: 'pending' });
  });
});
