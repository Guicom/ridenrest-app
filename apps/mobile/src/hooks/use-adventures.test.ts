import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react-native';
import type { AdventureResponse } from '@ridenrest/shared';
import { createElement, type ReactNode } from 'react';

import { useDeleteAdventure, useRenameAdventure } from '@/hooks/use-adventures';
import * as adventuresApi from '@/lib/api/adventures';

// Tests des mutations optimistes (MOB-3.1 / AC3, AC4). On exerce le hook réel dans
// un QueryClientProvider, en mockant la façade : on vérifie l'update optimiste
// (cache mis à jour AVANT la réponse) PUIS le rollback sur erreur.
//
// ⚠️ On n'utilise PAS `renderHook` (RNTL v14 pose `result.current` dans un
// `useEffect` qui ne commit pas de façon fiable pour le 2ᵉ render d'un même fichier
// sous React 19). À la place, un composant-sonde capture le hook DANS son corps de
// rendu (synchrone) → la valeur est dispo dès `await render`. La mutationFn est une
// promesse CONTRÔLÉE laissée en attente pour observer l'optimiste, puis rejetée.

jest.mock('@/lib/api/adventures', () => ({
  listAdventures: jest.fn(),
  createAdventure: jest.fn(),
  renameAdventure: jest.fn(),
  deleteAdventure: jest.fn(),
  getAdventure: jest.fn(),
}));

const mockRename = adventuresApi.renameAdventure as jest.Mock;
const mockDelete = adventuresApi.deleteAdventure as jest.Mock;

function makeAdventure(id: string, name: string): AdventureResponse {
  return {
    id,
    userId: 'user-1',
    name,
    totalDistanceKm: 0,
    totalElevationGainM: null,
    totalElevationLossM: null,
    startDate: null,
    endDate: null,
    status: 'planning',
    densityStatus: 'idle',
    densityProgress: 0,
    avgSpeedKmh: 15,
    routingProfile: 'gravel',
    hasStravaSegment: false,
    createdAt: '2026-06-01T10:00:00.000Z',
    updatedAt: '2026-06-01T10:00:00.000Z',
  };
}

// Monte le hook via un composant-sonde et renvoie une réf vivante vers sa valeur.
async function mountHook<T>(useHook: () => T, qc: QueryClient): Promise<{ current: T }> {
  const ref = { current: undefined as unknown as T };
  function Probe() {
    ref.current = useHook(); // capturé dans le corps de rendu (synchrone)
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

describe('useRenameAdventure (AC3 — optimistic + rollback)', () => {
  it('met à jour le nom de façon optimiste puis rollback en cas d’erreur', async () => {
    const qc = makeClient();
    qc.setQueryData(['adventures'], [makeAdventure('adv-1', 'Ancien')]);
    let rejectRename: (err: Error) => void = () => {};
    mockRename.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectRename = reject;
      }),
    );

    const hook = await mountHook(() => useRenameAdventure(), qc);

    await act(async () => {
      hook.current.mutate({ id: 'adv-1', name: 'Nouveau' });
    });

    // Optimiste : le cache reflète le nouveau nom AVANT la réponse serveur.
    expect(qc.getQueryData<AdventureResponse[]>(['adventures'])?.[0].name).toBe(
      'Nouveau',
    );

    // Erreur serveur → rollback vers le nom précédent.
    await act(async () => rejectRename(new Error('boom')));
    await waitFor(() => expect(hook.current.isError).toBe(true));
    expect(qc.getQueryData<AdventureResponse[]>(['adventures'])?.[0].name).toBe(
      'Ancien',
    );
  });
});

describe('useDeleteAdventure (AC4 — optimistic remove + rollback)', () => {
  it('retire la carte de façon optimiste puis la restaure en cas d’erreur', async () => {
    const qc = makeClient();
    qc.setQueryData(
      ['adventures'],
      [makeAdventure('adv-1', 'A'), makeAdventure('adv-2', 'B')],
    );
    let rejectDelete: (err: Error) => void = () => {};
    mockDelete.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectDelete = reject;
      }),
    );

    const hook = await mountHook(() => useDeleteAdventure(), qc);

    await act(async () => {
      hook.current.mutate('adv-1');
    });

    // Optimiste : la carte disparaît immédiatement.
    expect(qc.getQueryData<AdventureResponse[]>(['adventures'])).toHaveLength(1);

    // Erreur serveur → la carte réapparaît (rollback du snapshot complet).
    await act(async () => rejectDelete(new Error('boom')));
    await waitFor(() => expect(hook.current.isError).toBe(true));
    expect(qc.getQueryData<AdventureResponse[]>(['adventures'])).toHaveLength(2);
  });
});
