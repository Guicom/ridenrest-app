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
  resolveSegmentRanges,
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
  opts: { enabled?: boolean; fromKm?: number; toKm?: number; overpassEnabled?: boolean } = {},
): Promise<{ current: UsePoisResult }> {
  const ref = { current: undefined as unknown as UsePoisResult };
  function Probe() {
    ref.current = usePois({
      adventureId: 'adv-1',
      segments: [{ id: 'seg1', cumulativeStartKm: 0, distanceKm: 50 }],
      visibleLayers,
      fromKm: opts.fromKm ?? 0,
      toKm: opts.toKm ?? 15,
      enabled: opts.enabled,
      overpassEnabled: opts.overpassEnabled,
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
  const idle = { data: undefined, isLoading: false, isError: false, isSuccess: false, isFetching: false };

  it('les états primaires ignorent la source étendue', () => {
    // Overpass ne doit retenir ni le premier affichage, ni l'auto-zoom, ni faire tourner un
    // indicateur pendant 30 s. `isExtended[i]` redistingue les deux flux mêlés dans `results`
    // (useQueries garantit l'ordre entrée/sortie).
    const out = combinePoiResults(
      [
        { ...idle, isSuccess: true, data: [makePoi('g1', 'hotel')] },
        { ...idle, isLoading: true, isFetching: true },
      ],
      [false, true],
    );

    expect(out.isPending).toBe(false);
    expect(out.isFetching).toBe(false);
    expect(out.isSuccess).toBe(true);
    expect(out.overpassPending).toBe(true);
    expect(out.pois).toHaveLength(1);
  });

  it('un échec de la source étendue n’est pas une erreur de recherche', () => {
    const out = combinePoiResults(
      [
        { ...idle, isSuccess: true, data: [makePoi('g1', 'hotel')] },
        { ...idle, isError: true },
      ],
      [false, true],
    );

    expect(out.isError).toBe(false);
    expect(out.overpassError).toBe(true);
  });

  it('sans indicateur de source, tout est primaire (comportement d’avant le découplage)', () => {
    const out = combinePoiResults([{ ...idle, isLoading: true, isFetching: true }]);

    expect(out.isPending).toBe(true);
    expect(out.overpassPending).toBe(false);
  });

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
  it('clé stricte `[pois, { segmentId, fromKm, toKm, layer, overpassEnabled, source }]`', () => {
    // `source` est une dimension de clé à part entière depuis le découplage : les deux flux
    // d'une même recherche sont deux requêtes indépendantes, chacune avec son cache.
    expect(
      buildPoiQueryKey({
        segmentId: 's',
        fromKm: 0,
        toKm: 15,
        layer: 'accommodations',
        overpassEnabled: false,
        source: 'google',
      }),
    ).toEqual([
      'pois',
      {
        segmentId: 's',
        fromKm: 0,
        toKm: 15,
        layer: 'accommodations',
        overpassEnabled: false,
        source: 'google',
      },
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
      {
        segmentId: 'seg1',
        fromKm: 0,
        toKm: 15,
        layer: 'accommodations',
        overpassEnabled: false,
        source: 'google',
      },
    ]);
    // Write-through N3 au succès.
    await waitFor(() => expect(mockSetCached).toHaveBeenCalledWith('adv-1', [hotel]));
  });

  it('émet DEUX requêtes par calque quand la recherche étendue est active', async () => {
    // Découplage (parité web) : Google répond en ~200 ms, Overpass a été mesuré entre 1 s et
    // 31 s. Les attendre ensemble ferait payer à chacun le pire des deux.
    mockNetwork.mockReturnValue({ isOnline: true, isInternetReachable: true });
    mockFindPois.mockResolvedValue([]);
    const qc = makeClient();

    await mountUsePois(qc, new Set(['accommodations']), { overpassEnabled: true });

    await waitFor(() => expect(mockFindPois).toHaveBeenCalledTimes(2));
    const sources = mockFindPois.mock.calls.map((c) => (c[0] as { source?: string }).source);
    expect(new Set(sources)).toEqual(new Set(['google', 'overpass']));
  });

  it('n’émet qu’une requête Google quand la recherche étendue est coupée', async () => {
    mockNetwork.mockReturnValue({ isOnline: true, isInternetReachable: true });
    mockFindPois.mockResolvedValue([]);
    const qc = makeClient();

    await mountUsePois(qc, new Set(['accommodations']), { overpassEnabled: false });

    await waitFor(() => expect(mockFindPois).toHaveBeenCalledTimes(1));
    expect((mockFindPois.mock.calls[0][0] as { source?: string }).source).toBe('google');
  });

  it('affiche les POI des deux sources, fusionnés', async () => {
    mockNetwork.mockReturnValue({ isOnline: true, isInternetReachable: true });
    const fromGoogle = makePoi('g1', 'hotel');
    const fromOverpass = makePoi('o1', 'hotel');
    mockFindPois.mockImplementation((p: { source?: string }) =>
      Promise.resolve(p.source === 'overpass' ? [fromOverpass] : [fromGoogle]),
    );
    const qc = makeClient();

    const hook = await mountUsePois(qc, new Set(['accommodations']), { overpassEnabled: true });

    await waitFor(() => expect(hook.current.pois).toHaveLength(2));
  });

  it('un échec de la recherche étendue ne met PAS la recherche en erreur', async () => {
    // Un échec Overpass donne des résultats *partiels*, pas une recherche ratée.
    mockNetwork.mockReturnValue({ isOnline: true, isInternetReachable: true });
    const hotel = makePoi('g1', 'hotel');
    mockFindPois.mockImplementation((p: { source?: string }) =>
      p.source === 'overpass'
        ? Promise.reject(new Error('Overpass 504'))
        : Promise.resolve([hotel]),
    );
    const qc = makeClient();

    const hook = await mountUsePois(qc, new Set(['accommodations']), { overpassEnabled: true });

    await waitFor(() => expect(hook.current.overpassError).toBe(true));
    expect(hook.current.isError).toBe(false);
    expect(hook.current.pois).toEqual([hotel]);
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

describe('resolveSegmentRanges (T3 — résolution multi-segments AC5)', () => {
  const segments = [
    { id: 'a', cumulativeStartKm: 0, distanceKm: 20 },
    { id: 'b', cumulativeStartKm: 20, distanceKm: 30 },
    { id: 'c', cumulativeStartKm: 50, distanceKm: 10 },
  ];

  it('plage contenue dans un seul segment → km locaux', () => {
    expect(resolveSegmentRanges(segments, 5, 15)).toEqual([
      { segmentId: 'a', fromKm: 5, toKm: 15 },
    ]);
  });

  it('plage à cheval sur deux segments → un range local par segment', () => {
    expect(resolveSegmentRanges(segments, 10, 35)).toEqual([
      { segmentId: 'a', fromKm: 10, toKm: 20 },
      { segmentId: 'b', fromKm: 0, toKm: 15 },
    ]);
  });

  it('ignore les segments hors plage', () => {
    expect(resolveSegmentRanges(segments, 52, 58)).toEqual([
      { segmentId: 'c', fromKm: 2, toKm: 8 },
    ]);
  });
});

describe('usePois — gate searchCommitted (T3, AC1)', () => {
  it('enabled=false → aucune requête réseau (recherche non committée)', async () => {
    mockNetwork.mockReturnValue({ isOnline: true, isInternetReachable: true });
    mockFindPois.mockResolvedValue([makePoi('1', 'hotel')]);
    const qc = makeClient();

    const hook = await mountUsePois(qc, new Set(['accommodations']), {
      enabled: false,
    });

    expect(mockFindPois).not.toHaveBeenCalled();
    expect(hook.current.pois).toEqual([]);
    expect(hook.current.isEmpty).toBe(false);
  });

  it('enabled=true → requête lancée + pins', async () => {
    mockNetwork.mockReturnValue({ isOnline: true, isInternetReachable: true });
    const hotel = makePoi('1', 'hotel');
    mockFindPois.mockResolvedValue([hotel]);
    const qc = makeClient();

    const hook = await mountUsePois(qc, new Set(['accommodations']), {
      enabled: true,
    });

    await waitFor(() => expect(hook.current.pois).toEqual([hotel]));
    expect(mockFindPois).toHaveBeenCalled();
    expect(hook.current.isEmpty).toBe(false);
  });

  it('committé + 0 résultat → isEmpty vrai (AC3)', async () => {
    mockNetwork.mockReturnValue({ isOnline: true, isInternetReachable: true });
    mockFindPois.mockResolvedValue([]);
    const qc = makeClient();

    const hook = await mountUsePois(qc, new Set(['accommodations']), {
      enabled: true,
    });

    await waitFor(() => expect(hook.current.isSuccess).toBe(true));
    expect(hook.current.pois).toEqual([]);
    expect(hook.current.isEmpty).toBe(true);
  });
});
