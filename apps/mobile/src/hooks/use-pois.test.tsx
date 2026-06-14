import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react-native';
import { LAYER_CATEGORIES, type MapLayer, type Poi } from '@ridenrest/shared';
import { createElement, type ReactNode } from 'react';

import * as poisApi from '@/lib/api/pois';
import * as poiCache from '@/lib/cache/poi-cache';
import * as networkStatus from '@/hooks/use-network-status';
import {
  buildPoiQueryKey,
  combinePoiResults,
  groupPoisByLayer,
  usePois,
  type UsePoisResult,
} from '@/hooks/use-pois';

// use-pois (MOB-4.2 / AC2, 4, 5, T4). On exerce le hook réel dans un
// QueryClientProvider (composant-sonde — `renderHook` peu fiable, leçon MOB-3.1),
// en mockant la façade, le cache N3 et l'état réseau.

jest.mock('@/lib/api/pois', () => ({
  findPois: jest.fn(),
  getPoiGoogleDetails: jest.fn(),
  reverseCity: jest.fn(),
}));
jest.mock('@/lib/cache/poi-cache', () => ({
  getCachedPois: jest.fn(),
  setCachedPois: jest.fn(),
}));
jest.mock('@/hooks/use-network-status', () => ({
  useNetworkStatus: jest.fn(),
}));

const mockFindPois = poisApi.findPois as jest.Mock;
const mockGetCached = poiCache.getCachedPois as jest.Mock;
const mockSetCached = poiCache.setCachedPois as jest.Mock;
const mockNetwork = networkStatus.useNetworkStatus as jest.Mock;

function makePoi(id: string, category: Poi['category']): Poi {
  return {
    id,
    externalId: `ext-${id}`,
    source: 'overpass',
    category,
    name: `POI ${id}`,
    lat: 45,
    lng: 6,
    distFromTraceM: 100,
    distAlongRouteKm: 12,
  };
}

async function mountUsePois(
  qc: QueryClient,
  visibleLayers: Set<MapLayer>,
): Promise<{ current: UsePoisResult }> {
  const ref = { current: undefined as unknown as UsePoisResult };
  function Probe() {
    ref.current = usePois({
      adventureId: 'adv-1',
      segments: [{ id: 'seg1' }],
      visibleLayers,
      fromKm: 0,
      toKm: 15,
    });
    return null;
  }
  const wrapper = (children: ReactNode) =>
    createElement(QueryClientProvider, { client: qc }, children);
  await render(wrapper(createElement(Probe)));
  return ref;
}

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSetCached.mockResolvedValue(undefined);
});

describe('combinePoiResults (T4 — agrégation pure)', () => {
  it('aplati + dédoublonne par id', () => {
    const a = makePoi('1', 'hotel');
    const b = makePoi('2', 'restaurant');
    const out = combinePoiResults([
      { data: [a, b], isLoading: false, isError: false, isSuccess: true },
      { data: [b], isLoading: false, isError: false, isSuccess: true },
    ]);
    expect(out.pois).toEqual([a, b]);
    expect(out.isSuccess).toBe(true);
  });

  it('isPending vrai seulement si un fetch réel est en vol (isLoading)', () => {
    expect(
      combinePoiResults([
        { data: undefined, isLoading: true, isError: false, isSuccess: false },
      ]).isPending,
    ).toBe(true);
    expect(
      combinePoiResults([
        { data: undefined, isLoading: false, isError: false, isSuccess: false },
      ]).isPending,
    ).toBe(false);
  });
});

describe('groupPoisByLayer (T4)', () => {
  it('regroupe par calque et exclut les calques non visibles', () => {
    const hotel = makePoi('1', 'hotel');
    const resto = makePoi('2', 'restaurant');
    const grouped = groupPoisByLayer([hotel, resto], new Set(['accommodations']));
    expect(grouped.accommodations).toEqual([hotel]);
    expect(grouped.restaurants).toEqual([]);
  });
});

describe('buildPoiQueryKey (T4 — parité web)', () => {
  it('clé stricte `[pois, { segmentId, fromKm, toKm, layer, overpassEnabled }]`', () => {
    expect(
      buildPoiQueryKey({
        segmentId: 's',
        fromKm: 0,
        toKm: 15,
        layer: 'accommodations',
        overpassEnabled: false,
      }),
    ).toEqual([
      'pois',
      { segmentId: 's', fromKm: 0, toKm: 15, layer: 'accommodations', overpassEnabled: false },
    ]);
  });
});

describe('usePois (intégration)', () => {
  it('dérive `categories` de LAYER_CATEGORIES et écrit le cache au succès', async () => {
    mockNetwork.mockReturnValue({ isOnline: true, isInternetReachable: true });
    const hotel = makePoi('1', 'hotel');
    mockFindPois.mockResolvedValue([hotel]);
    const qc = makeClient();

    const hook = await mountUsePois(qc, new Set(['accommodations']));

    await waitFor(() => expect(hook.current.pois).toEqual([hotel]));

    // `categories` = LAYER_CATEGORIES.accommodations (jamais hardcodé).
    expect(mockFindPois).toHaveBeenCalledWith(
      expect.objectContaining({
        segmentId: 'seg1',
        fromKm: 0,
        toKm: 15,
        categories: [...LAYER_CATEGORIES.accommodations],
        overpassEnabled: false,
      }),
    );
    // Query key stricte enregistrée dans le cache.
    const keys = qc.getQueryCache().getAll().map((q) => q.queryKey);
    expect(keys).toContainEqual([
      'pois',
      { segmentId: 'seg1', fromKm: 0, toKm: 15, layer: 'accommodations', overpassEnabled: false },
    ]);
    // Write-through N3 au succès.
    await waitFor(() => expect(mockSetCached).toHaveBeenCalledWith('adv-1', [hotel]));
  });

  it('hors-ligne sans données live → fallback getCachedPois (AC5)', async () => {
    mockNetwork.mockReturnValue({ isOnline: false, isInternetReachable: false });
    const cached = makePoi('9', 'hotel');
    mockGetCached.mockResolvedValue([cached]);
    const qc = makeClient();

    const hook = await mountUsePois(qc, new Set(['accommodations']));

    await waitFor(() => expect(hook.current.pois).toEqual([cached]));
    // Hors-ligne : la façade réseau n'est jamais appelée (queries `enabled:false`).
    expect(mockFindPois).not.toHaveBeenCalled();
    expect(mockGetCached).toHaveBeenCalledWith('adv-1');
  });
});
