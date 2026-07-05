import { render, screen } from '@testing-library/react-native';
import type { AccessResponse } from '@ridenrest/shared';

import { AccessMetrics } from '@/components/poi-access/access-metrics';
import { useAccess } from '@/hooks/use-access';
import { useNetworkStatus } from '@/hooks/use-network-status';

// MOB-4.6 / T4, T8 — états de la fiche d'accès. On mocke `useAccess` (pas de réseau) et
// `useNetworkStatus` (offline AC6). i18n réel (FR par défaut, comme booking-links).

jest.mock('@/hooks/use-access', () => ({ useAccess: jest.fn() }));
jest.mock('@/hooks/use-network-status', () => ({ useNetworkStatus: jest.fn() }));

const mockUseAccess = useAccess as jest.Mock;
const mockNetwork = useNetworkStatus as jest.Mock;

const ORIGIN = { type: 'nearest-trace' } as const;

const okData: AccessResponse = {
  status: 'ok',
  distanceM: 1500,
  elevationGainM: 40,
  elevationLossM: 10,
  geometry: { type: 'LineString', coordinates: [[6, 45], [6.1, 45.1]] },
  variants: [
    {
      entryPoint: [6, 45],
      distanceM: 1500,
      elevationGainM: 40,
      elevationLossM: 10,
      etaS: 360,
      usesMainRoad: false,
      mainRoadDistanceM: 0,
      geometry: { type: 'LineString', coordinates: [[6, 45], [6.1, 45.1]] },
    },
  ],
  engineVersion: 'brouter-1.7.9',
  computedAt: '2026-06-27T10:00:00.000Z',
  source: 'db-cache',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockNetwork.mockReturnValue({ isOnline: true });
});

function renderMetrics(category: 'hotel' | 'camp_site' = 'hotel') {
  return render(
    <AccessMetrics poiId="poi-1" origin={ORIGIN} category={category} />,
  );
}

describe('AccessMetrics', () => {
  it('loading → skeleton DÉDIÉ (pas de spinner générique)', async () => {
    mockUseAccess.mockReturnValue({ data: undefined, isLoading: true, isError: false, fetchStatus: 'fetching' });
    await renderMetrics();
    expect(screen.getByTestId('access-metrics-skeleton')).toBeOnTheScreen();
    expect(screen.queryByTestId('access-metrics')).toBeNull();
  });

  it('hors-ligne paused (isLoading true, fetchStatus paused) → message indispo, PAS skeleton', async () => {
    mockUseAccess.mockReturnValue({ data: undefined, isLoading: true, isError: false, fetchStatus: 'paused' });
    mockNetwork.mockReturnValue({ isOnline: false });
    await renderMetrics();
    expect(screen.queryByTestId('access-metrics-skeleton')).toBeNull();
    expect(screen.getByTestId('access-unavailable')).toHaveTextContent(
      "Itinéraire d'accès indisponible hors-ligne",
    );
  });

  it('ok → libellé contextualisé + distance + D+ + D-', async () => {
    mockUseAccess.mockReturnValue({ data: okData, isLoading: false, isError: false, fetchStatus: 'idle' });
    await renderMetrics('hotel');
    expect(screen.getByTestId('access-metrics')).toBeOnTheScreen();
    expect(screen.getByText("Itinéraire vers l'hôtel")).toBeOnTheScreen();
    expect(screen.getByText('1,5 km')).toBeOnTheScreen();
    expect(screen.getByText('40 m D+')).toBeOnTheScreen();
    expect(screen.getByText('10 m D-')).toBeOnTheScreen();
  });

  it('ok → libellé selon la catégorie (camping)', async () => {
    mockUseAccess.mockReturnValue({ data: okData, isLoading: false, isError: false, fetchStatus: 'idle' });
    await renderMetrics('camp_site');
    expect(screen.getByText('Itinéraire vers le camping')).toBeOnTheScreen();
  });

  it("fallback → distance vol d'oiseau + badge « ≈ approximatif »", async () => {
    mockUseAccess.mockReturnValue({
      data: {
        status: 'fallback',
        fallbackReason: 'routing_failed',
        fallbackDistanceM: 800,
        source: 'computed-fresh',
      },
      isLoading: false,
      isError: false,
      fetchStatus: 'idle',
    });
    await renderMetrics();
    expect(screen.getByTestId('access-fallback')).toBeOnTheScreen();
    expect(screen.getByText('≈ approximatif')).toBeOnTheScreen();
    expect(screen.getByText('800 m')).toBeOnTheScreen();
  });

  it('error → message muted « indisponible »', async () => {
    mockUseAccess.mockReturnValue({
      data: { status: 'error', message: 'boom' },
      isLoading: false,
      isError: false,
      fetchStatus: 'idle',
    });
    await renderMetrics();
    expect(screen.getByTestId('access-unavailable')).toHaveTextContent(
      "Itinéraire d'accès indisponible",
    );
  });

  it('hors-ligne sans cache → message « indisponible hors-ligne » (non bloquant, AC6)', async () => {
    mockUseAccess.mockReturnValue({ data: undefined, isLoading: false, isError: false, fetchStatus: 'idle' });
    mockNetwork.mockReturnValue({ isOnline: false });
    await renderMetrics();
    expect(screen.getByTestId('access-unavailable')).toHaveTextContent(
      "Itinéraire d'accès indisponible hors-ligne",
    );
  });
});
