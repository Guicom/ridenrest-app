import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';
import type { Poi } from '@ridenrest/shared';
import { createElement, type ReactNode } from 'react';

import * as poisApi from '@/lib/api/pois';
import * as poiCache from '@/lib/cache/poi-cache';
import * as networkStatus from '@/hooks/use-network-status';
import * as profileHook from '@/hooks/use-profile';
import {
  useLivePoiSearch,
  type UseLivePoiSearchResult,
} from '@/hooks/use-live-poi-search';
import { useLiveStore } from '@/lib/stores/live.store';
import { useMapStore } from '@/lib/stores/map.store';

// use-live-poi-search (MOB-5.3 / AC1, 2, 4, 5, 6, T10). Probe-component (renderHook peu
// fiable, leçon MOB-3.1). Stores Zustand réels (setState), façade/cache/réseau/profil mockés.

jest.mock('@/lib/api/pois', () => ({
  getLivePois: jest.fn(),
}));
jest.mock('@/lib/cache/poi-cache', () => ({
  getCachedPois: jest.fn(),
  setCachedPois: jest.fn(),
}));
jest.mock('@/hooks/use-network-status', () => ({
  useNetworkStatus: jest.fn(),
}));
jest.mock('@/hooks/use-profile', () => ({
  useProfile: jest.fn(),
}));

const mockGetLivePois = poisApi.getLivePois as jest.Mock;
const mockGetCached = poiCache.getCachedPois as jest.Mock;
const mockSetCached = poiCache.setCachedPois as jest.Mock;
const mockNetwork = networkStatus.useNetworkStatus as jest.Mock;
const mockProfile = profileHook.useProfile as jest.Mock;

function makePoi(id: string): Poi {
  return {
    id,
    externalId: `ext-${id}`,
    source: 'google',
    category: 'hotel',
    name: `POI ${id}`,
    lat: 45,
    lng: 6,
    distFromTraceM: 100,
    distAlongRouteKm: 12,
    distFromTargetM: 200,
  };
}

async function mountHook(
  qc: QueryClient,
): Promise<{ current: UseLivePoiSearchResult }> {
  const ref = { current: undefined as unknown as UseLivePoiSearchResult };
  function Probe() {
    ref.current = useLivePoiSearch({ adventureId: 'adv-1', segmentId: 'seg1' });
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
  mockProfile.mockReturnValue({ data: { overpassEnabled: false } });
  mockNetwork.mockReturnValue({ isOnline: true, isInternetReachable: true });
  // Reset des stores aux valeurs Live « actif, calage GPS connu ».
  useLiveStore.setState({
    isLiveModeActive: true,
    currentKmOnRoute: 10,
    targetAheadKm: 30,
    searchRadiusKm: 5,
  });
  useMapStore.setState({
    visibleLayers: new Set(['accommodations']),
    activeAccommodationTypes: new Set(['hotel']),
  });
});

describe('useLivePoiSearch — recherche explicite (AC2)', () => {
  it('enabled:false → aucun fetch automatique au montage', async () => {
    const hook = await mountHook(makeClient());
    expect(mockGetLivePois).not.toHaveBeenCalled();
    expect(hook.current.hasFetched).toBe(false);
    expect(hook.current.pois).toEqual([]);
  });

  it('refetch() → fetch avec categories (hors queryKey) + write-through cache live', async () => {
    mockGetLivePois.mockResolvedValue([makePoi('1')]);
    const qc = makeClient();
    const hook = await mountHook(qc);

    await act(async () => {
      await hook.current.refetch();
    });

    // categories = sous-types actifs (hotel) — passées à l'API mais HORS queryKey.
    expect(mockGetLivePois).toHaveBeenCalledWith(
      expect.objectContaining({
        segmentId: 'seg1',
        targetKm: 40,
        radiusKm: 5,
        overpassEnabled: false,
        categories: ['hotel'],
      }),
    );
    const liveKey = qc
      .getQueryCache()
      .getAll()
      .map((q) => q.queryKey)
      .find((k) => Array.isArray(k) && k[1] === 'live') as
      | [string, string, Record<string, unknown>]
      | undefined;
    expect(liveKey).toBeDefined();
    expect(Object.keys(liveKey![2])).toEqual([
      'segmentId',
      'targetKm',
      'radiusKm',
      'overpassEnabled',
    ]);
    expect(liveKey![2]).not.toHaveProperty('categories');

    await waitFor(() =>
      expect(mockSetCached).toHaveBeenCalledWith('adv-1-live', [makePoi('1')]),
    );
  });
});

describe('useLivePoiSearch — targetKm (AC1)', () => {
  it('arrondit (currentKm + targetAhead) à 0,1 km', async () => {
    useLiveStore.setState({ currentKmOnRoute: 10.06, targetAheadKm: 5 });
    const hook = await mountHook(makeClient());
    expect(hook.current.targetKm).toBe(15.1);
  });

  it('targetKm null sans fix GPS → canSearch false', async () => {
    useLiveStore.setState({ currentKmOnRoute: null });
    const hook = await mountHook(makeClient());
    expect(hook.current.targetKm).toBeNull();
    expect(hook.current.canSearch).toBe(false);
  });

  it('canSearch vrai : Live actif + targetKm + segment', async () => {
    const hook = await mountHook(makeClient());
    expect(hook.current.canSearch).toBe(true);
    await act(async () => {
      useLiveStore.setState({ isLiveModeActive: false });
    });
    expect(hook.current.canSearch).toBe(false);
  });
});

describe('useLivePoiSearch — hasFetched (AC5)', () => {
  it('hasFetched = data !== undefined (zéro résultat reste « fetched »)', async () => {
    mockGetLivePois.mockResolvedValue([]);
    const hook = await mountHook(makeClient());

    expect(hook.current.hasFetched).toBe(false); // jamais cherché ici

    await act(async () => {
      await hook.current.refetch();
    });

    await waitFor(() => expect(hook.current.hasFetched).toBe(true));
    expect(hook.current.pois).toEqual([]); // cherché, zéro résultat — distinct
  });
});

describe('useLivePoiSearch — offline (AC6)', () => {
  it('hors-ligne sans donnée live → fallback getCachedPois (clé live)', async () => {
    mockNetwork.mockReturnValue({ isOnline: false, isInternetReachable: false });
    mockGetCached.mockResolvedValue([makePoi('9')]);

    const hook = await mountHook(makeClient());

    await waitFor(() => expect(hook.current.pois).toEqual([makePoi('9')]));
    expect(mockGetLivePois).not.toHaveBeenCalled();
    expect(mockGetCached).toHaveBeenCalledWith('adv-1-live');
  });
});
