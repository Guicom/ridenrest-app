import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DensityStatusResponse } from '@ridenrest/shared';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { SidebarDensitySection } from '@/components/map/sidebar-density-section';
import * as densityApi from '@/lib/api/density';
import { i18n } from '@/lib/i18n';
import { useMapStore } from '@/lib/stores/map.store';

jest.mock('@/lib/api/density', () => ({
  getDensityStatus: jest.fn(),
  triggerDensityAnalysis: jest.fn(),
}));

const mockStatus = densityApi.getDensityStatus as jest.Mock;
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

async function setup(allSegmentsParsed = true) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await render(
    <QueryClientProvider client={qc}>
      <SidebarDensitySection adventureId="a1" allSegmentsParsed={allSegmentsParsed} />
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
});
