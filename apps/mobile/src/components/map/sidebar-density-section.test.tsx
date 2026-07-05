import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DensityStatusResponse } from '@ridenrest/shared';
import {
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react-native';

import { SidebarDensitySection } from '@/components/map/sidebar-density-section';
import { ApiError } from '@/lib/api/api-client';
import * as densityApi from '@/lib/api/density';
import { i18n } from '@/lib/i18n';
import { useMapStore } from '@/lib/stores/map.store';

// `use-density` importe `ApiError` depuis `api-client`, qui charge `@/lib/auth/client`
// (→ @better-auth/expo, non transformable par Jest). On mocke le wrapper auth (pattern
// `api-client.test.ts`) — `ApiError` reste la vraie classe (utilisée pour simuler le 409).
jest.mock('@/lib/auth/client', () => ({
  authClient: { getCookie: jest.fn(() => null), signOut: jest.fn() },
}));

jest.mock('@/lib/api/density', () => ({
  getDensityStatus: jest.fn(),
  triggerDensityAnalysis: jest.fn(),
}));

const mockStatus = densityApi.getDensityStatus as jest.Mock;
const mockTrigger = densityApi.triggerDensityAnalysis as jest.Mock;
const initial = useMapStore.getState();

function statusResponse(over: Partial<DensityStatusResponse>): DensityStatusResponse {
  return {
    densityStatus: 'idle',
    densityProgress: 0,
    coverageGaps: [],
    densityCategories: [],
    densityStale: false,
    ...over,
  };
}

async function setup(allSegmentsParsed = true, isOnline = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={qc}>
      <SidebarDensitySection
        adventureId="a1"
        allSegmentsParsed={allSegmentsParsed}
        isOnline={isOnline}
      />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  useMapStore.setState({ ...initial, densityColorEnabled: false }, true);
});

describe('SidebarDensitySection', () => {
  // La section est repliée par défaut → on déplie via l'en-tête avant d'asserter.
  async function expand() {
    fireEvent.press(await screen.findByText(i18n.t('map.density.title')));
  }

  it('idle → CTA « Calculer la densité »', async () => {
    mockStatus.mockResolvedValue(statusResponse({ densityStatus: 'idle' }));
    await setup();
    await expand();
    expect(
      await screen.findByText(i18n.t('map.density.calculate')),
    ).toBeOnTheScreen();
  });

  it('success → toggle « Afficher sur la carte » + légende', async () => {
    mockStatus.mockResolvedValue(statusResponse({ densityStatus: 'success' }));
    await setup();
    await expand();
    expect(await screen.findByTestId('density-toggle')).toBeOnTheScreen();
    expect(screen.getByText(i18n.t('map.density.high'))).toBeOnTheScreen();
    expect(screen.getByText(i18n.t('map.density.critical'))).toBeOnTheScreen();
  });

  it('hors-ligne → CTA désactivé + message offline (AC5)', async () => {
    mockStatus.mockResolvedValue(statusResponse({ densityStatus: 'idle' }));
    await setup(true, false);
    await expand();
    expect(
      await screen.findByText(i18n.t('map.density.offline')),
    ).toBeOnTheScreen();
    expect(screen.getByTestId('density-cta-btn')).toBeDisabled();
  });

  it('409 → message « Analyse déjà en cours » non bloquant (AC1)', async () => {
    mockStatus.mockResolvedValue(statusResponse({ densityStatus: 'idle' }));
    mockTrigger.mockRejectedValue(
      new ApiError('Analyse déjà en cours', 409, 'CONFLICT'),
    );
    await setup();
    await expand();
    // Ouvre le dialog catégories, puis lance (tous les types sélectionnés par défaut).
    fireEvent.press(await screen.findByTestId('density-cta-btn'));
    fireEvent.press(await screen.findByTestId('density-launch-btn'));
    expect(
      await screen.findByText(i18n.t('map.density.inProgress')),
    ).toBeOnTheScreen();
  });

  it('échec trigger (hors 409) → message non bloquant', async () => {
    mockStatus.mockResolvedValue(statusResponse({ densityStatus: 'idle' }));
    mockTrigger.mockRejectedValue(new ApiError('Boom', 500, 'INTERNAL'));
    await setup();
    await expand();
    fireEvent.press(await screen.findByTestId('density-cta-btn'));
    fireEvent.press(await screen.findByTestId('density-launch-btn'));
    await waitFor(() =>
      expect(
        screen.getByText(i18n.t('map.density.triggerFailed')),
      ).toBeOnTheScreen(),
    );
  });
});
