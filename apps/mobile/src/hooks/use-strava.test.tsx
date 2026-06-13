import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';

import { apiFetch } from '@/lib/api/api-client';
import {
  mapStravaError,
  stravaRoutesKey,
  useImportStravaRoute,
  useStravaRoutes,
} from '@/hooks/use-strava';

// Hooks data Strava (MOB-3.4 / T1). Mock `apiFetch` (aucun réseau réel).
//
// ⚠️ On n'utilise PAS `renderHook` (RNTL v14 + React 19 : `result.current` n'est pas
// fiable au 2ᵉ render d'un fichier). Composant-sonde qui capture le hook dans son
// corps de rendu (pattern use-adventures.test).
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

const { ApiError } = jest.requireMock('@/lib/api/api-client');
const mockApiFetch = apiFetch as unknown as jest.Mock;
const ADVENTURE_ID = 'adv-1';

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

async function mountHook<T>(
  useHook: () => T,
  qc: QueryClient,
): Promise<{ current: T }> {
  const ref = { current: undefined as unknown as T };
  function Probe() {
    ref.current = useHook();
    return null;
  }
  const wrapper = (children: ReactNode) =>
    createElement(QueryClientProvider, { client: qc }, children);
  await render(wrapper(createElement(Probe)));
  return ref;
}

beforeEach(() => jest.clearAllMocks());

describe('stravaRoutesKey', () => {
  it('queryKey stable page-based', () => {
    expect(stravaRoutesKey(2)).toEqual(['strava', 'routes', { page: 2 }]);
  });
});

describe('useStravaRoutes (lazy)', () => {
  it('enabled=false → aucun appel', async () => {
    const qc = makeClient();
    await mountHook(() => useStravaRoutes(1, { enabled: false }), qc);
    expect(mockApiFetch).not.toHaveBeenCalled();
  });

  it('enabled=true → fetch /strava/routes?page=N', async () => {
    mockApiFetch.mockResolvedValue([
      { id: '1', name: 'R', distanceKm: 5, elevationGainM: null },
    ]);
    const qc = makeClient();
    const hook = await mountHook(
      () => useStravaRoutes(3, { enabled: true }),
      qc,
    );
    await waitFor(() => expect(hook.current.isSuccess).toBe(true));
    expect(mockApiFetch).toHaveBeenCalledWith('/strava/routes?page=3');
  });
});

describe('useImportStravaRoute', () => {
  it('POST /import avec { adventureId } ; onSuccess invalide segments mais PAS routes', async () => {
    mockApiFetch.mockResolvedValue({ id: 'seg-1', parseStatus: 'pending' });
    const qc = makeClient();
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');

    const hook = await mountHook(() => useImportStravaRoute(ADVENTURE_ID), qc);
    await act(async () => {
      await hook.current.mutateAsync({ stravaRouteId: 'route-9' });
    });

    expect(mockApiFetch).toHaveBeenCalledWith('/strava/routes/route-9/import', {
      method: 'POST',
      body: JSON.stringify({ adventureId: ADVENTURE_ID }),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['adventures', ADVENTURE_ID, 'segments'],
    });
    // Ne JAMAIS invalider la liste de routes.
    const calls = invalidateSpy.mock.calls.map((c) => JSON.stringify(c[0]));
    expect(calls.some((c) => c.includes('"routes"'))).toBe(false);
  });
});

describe('mapStravaError', () => {
  it('status 0 / NETWORK_ERROR → réseau', () => {
    expect(mapStravaError(new ApiError('x', 0, 'NETWORK_ERROR'))).toBe(
      'strava.errors.network',
    );
  });
  it('404 → notConnected', () => {
    expect(mapStravaError(new ApiError('x', 404))).toBe(
      'strava.errors.notConnected',
    );
  });
  it('429 défaut → rateLimit15', () => {
    expect(mapStravaError(new ApiError('limite 15min', 429))).toBe(
      'strava.errors.rateLimit15',
    );
  });
  it('429 « demain » → rateLimitDaily', () => {
    expect(mapStravaError(new ApiError('réessaie demain', 429))).toBe(
      'strava.errors.rateLimitDaily',
    );
  });
  it('502 → stravaDown', () => {
    expect(mapStravaError(new ApiError('x', 502))).toBe(
      'strava.errors.stravaDown',
    );
  });
  it('inconnu → generic', () => {
    expect(mapStravaError(new Error('boom'))).toBe('strava.errors.generic');
  });
});
