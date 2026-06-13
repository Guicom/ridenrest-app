import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';
import type { AdventureSegmentResponse } from '@ridenrest/shared';
import { createElement, type ReactNode } from 'react';

import {
  useDeleteSegment,
  useRenameSegment,
  useReorderSegments,
} from '@/hooks/use-segments';
import * as segmentsApi from '@/lib/api/segments';

// Tests des mutations segments (MOB-3.3 / T3, AC1-3,5). On exerce les hooks réels
// dans un QueryClientProvider en mockant la façade réseau. Le réordre est OPTIMISTE :
// on vérifie que le cache `['adventures', id, 'segments']` reflète le nouvel ordre
// AVANT la résolution, PUIS le rollback sur erreur (assertions getQueryData).
//
// ⚠️ On n'utilise PAS `renderHook` (RNTL v14 + React 19 : `result.current` peu fiable
// au 2ᵉ render du fichier). Composant-sonde qui capture le hook dans son corps de
// rendu synchrone (parité use-adventures.test.ts).

jest.mock('@/lib/api/segments', () => ({
  listSegments: jest.fn(),
  uploadSegment: jest.fn(),
  reorderSegments: jest.fn(),
  renameSegment: jest.fn(),
  deleteSegment: jest.fn(),
}));

const mockReorder = segmentsApi.reorderSegments as jest.Mock;
const mockRename = segmentsApi.renameSegment as jest.Mock;
const mockDelete = segmentsApi.deleteSegment as jest.Mock;

function makeSegment(
  id: string,
  orderIndex: number,
  name = `Segment ${id}`,
): AdventureSegmentResponse {
  return {
    id,
    adventureId: 'adv-1',
    name,
    orderIndex,
    cumulativeStartKm: orderIndex * 10,
    distanceKm: 10,
    elevationGainM: null,
    elevationLossM: null,
    parseStatus: 'done',
    source: null,
    boundingBox: null,
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T10:00:00.000Z',
  };
}

const SEG_KEY = ['adventures', 'adv-1', 'segments'] as const;

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
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('useReorderSegments (AC1 — optimistic + rollback)', () => {
  it('réordonne le cache de façon optimiste AVANT la réponse serveur', async () => {
    const qc = makeClient();
    qc.setQueryData(SEG_KEY, [
      makeSegment('a', 0),
      makeSegment('b', 1),
      makeSegment('c', 2),
    ]);
    // Promesse contrôlée laissée en attente pour observer l'optimiste.
    let resolveReorder: (v: AdventureSegmentResponse[]) => void = () => {};
    mockReorder.mockReturnValue(
      new Promise((resolve) => {
        resolveReorder = resolve;
      }),
    );

    const hook = await mountHook(() => useReorderSegments('adv-1'), qc);

    await act(async () => {
      hook.current.mutate(['c', 'a', 'b']);
    });

    // Optimiste : l'ordre des ids reflète le nouvel ordre AVANT la résolution.
    const optimistic = qc.getQueryData<AdventureSegmentResponse[]>(SEG_KEY);
    expect(optimistic?.map((s) => s.id)).toEqual(['c', 'a', 'b']);
    // orderIndex local recohérent (0,1,2…).
    expect(optimistic?.map((s) => s.orderIndex)).toEqual([0, 1, 2]);
    expect(mockReorder).toHaveBeenCalledWith('adv-1', ['c', 'a', 'b']);

    await act(async () => {
      resolveReorder([
        makeSegment('c', 0),
        makeSegment('a', 1),
        makeSegment('b', 2),
      ]);
    });
    await waitFor(() => expect(hook.current.isPending).toBe(false));
  });

  it('rollback vers le snapshot initial en cas d’erreur', async () => {
    const qc = makeClient();
    qc.setQueryData(SEG_KEY, [
      makeSegment('a', 0),
      makeSegment('b', 1),
      makeSegment('c', 2),
    ]);
    let rejectReorder: (err: Error) => void = () => {};
    mockReorder.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectReorder = reject;
      }),
    );

    const hook = await mountHook(() => useReorderSegments('adv-1'), qc);

    await act(async () => {
      hook.current.mutate(['c', 'a', 'b']);
    });
    expect(
      qc.getQueryData<AdventureSegmentResponse[]>(SEG_KEY)?.map((s) => s.id),
    ).toEqual(['c', 'a', 'b']);

    await act(async () => rejectReorder(new Error('network')));
    await waitFor(() => expect(hook.current.isError).toBe(true));

    // Rollback : l'ordre initial est restauré.
    expect(
      qc.getQueryData<AdventureSegmentResponse[]>(SEG_KEY)?.map((s) => s.id),
    ).toEqual(['a', 'b', 'c']);
  });
});

describe('useRenameSegment (AC3)', () => {
  it('appelle renameSegment avec { name } et invalide la query segments', async () => {
    const qc = makeClient();
    qc.setQueryData(SEG_KEY, [makeSegment('a', 0, 'Ancien')]);
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');
    mockRename.mockResolvedValue(makeSegment('a', 0, 'Nouveau'));

    const hook = await mountHook(() => useRenameSegment('adv-1'), qc);

    await act(async () => {
      hook.current.mutate({ segmentId: 'a', name: 'Nouveau' });
    });
    await waitFor(() => expect(hook.current.isSuccess).toBe(true));

    expect(mockRename).toHaveBeenCalledWith('adv-1', 'a', 'Nouveau');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: SEG_KEY });
  });
});

describe('useDeleteSegment (AC2)', () => {
  it('invalide la query segments ET la query aventure (distance totale)', async () => {
    const qc = makeClient();
    qc.setQueryData(SEG_KEY, [makeSegment('a', 0)]);
    const invalidateSpy = jest.spyOn(qc, 'invalidateQueries');
    mockDelete.mockResolvedValue({ deleted: true });

    const hook = await mountHook(() => useDeleteSegment('adv-1'), qc);

    await act(async () => {
      hook.current.mutate('a');
    });
    await waitFor(() => expect(hook.current.isSuccess).toBe(true));

    expect(mockDelete).toHaveBeenCalledWith('adv-1', 'a');
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: SEG_KEY });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ['adventures', 'adv-1'],
    });
  });
});
