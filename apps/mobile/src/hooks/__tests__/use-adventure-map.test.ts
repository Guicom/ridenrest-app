import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import { createElement, type ReactNode } from 'react';
import type { AdventureMapResponse } from '@ridenrest/shared';

import {
  isMapParsing,
  mapPollInterval,
  useAdventureMap,
} from '@/hooks/use-adventure-map';
import * as mapApi from '@/lib/api/map';

// Tests du hook carte (MOB-4.1 / T8, AC1). On mocke la FAÇADE `@/lib/api/map` (pas
// `apiFetch`) et on exerce le hook réel dans un QueryClientProvider. Composant-sonde
// (pas `renderHook` : `result.current` peu fiable RNTL v14 + React 19 — parité
// use-segments.test). Helpers de polling testés purement.

jest.mock('@/lib/api/map', () => ({
  getAdventureMapData: jest.fn(),
}));

const mockGetMap = mapApi.getAdventureMapData as jest.Mock;

function makeResponse(
  statuses: AdventureMapResponse['segments'][number]['parseStatus'][],
): AdventureMapResponse {
  return {
    adventureId: 'adv-1',
    adventureName: 'Tour',
    totalDistanceKm: 10,
    totalElevationGainM: null,
    totalElevationLossM: null,
    segments: statuses.map((parseStatus, i) => ({
      id: `s${i}`,
      name: `Segment ${i}`,
      orderIndex: i,
      cumulativeStartKm: 0,
      distanceKm: 10,
      parseStatus,
      source: null,
      waypoints: null,
      boundingBox: null,
    })),
  };
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

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('isMapParsing / mapPollInterval (AC1 — peuplement post-parse)', () => {
  it('polling 3000 ms tant qu’un segment parse, false sinon', () => {
    expect(mapPollInterval(makeResponse(['pending', 'done']))).toBe(3000);
    expect(mapPollInterval(makeResponse(['processing']))).toBe(3000);
    expect(mapPollInterval(makeResponse(['done', 'done']))).toBe(false);
    expect(mapPollInterval(makeResponse(['error']))).toBe(false);
    expect(mapPollInterval(undefined)).toBe(false);
  });

  it('isMapParsing reflète l’état des segments', () => {
    expect(isMapParsing(makeResponse(['done']))).toBe(false);
    expect(isMapParsing(makeResponse(['pending']))).toBe(true);
  });
});

describe('useAdventureMap', () => {
  it('charge les données via la façade (query key stricte)', async () => {
    mockGetMap.mockResolvedValue(makeResponse(['done']));
    const qc = makeClient();
    const hook = await mountHook(() => useAdventureMap('adv-1'), qc);

    await waitFor(() => expect(hook.current.isSuccess).toBe(true));
    expect(mockGetMap).toHaveBeenCalledWith('adv-1');
    expect(qc.getQueryData(['adventures', 'adv-1', 'map'])).toBeDefined();
  });

  it('ne lance AUCUNE requête quand l’id est falsy (durcissement)', async () => {
    const qc = makeClient();
    await mountHook(() => useAdventureMap(''), qc);
    expect(mockGetMap).not.toHaveBeenCalled();
  });
});
