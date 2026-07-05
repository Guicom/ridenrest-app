import * as NetInfo from '@react-native-community/netinfo';
import { focusManager, onlineManager } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { AppState, type AppStateStatus, Text } from 'react-native';

import { queryClient } from './query-client';
import { useAppStateRefetch } from './use-app-state-refetch';

// On mocke le wrapper auth (pas @better-auth/expo directement — cf. AGENTS.md) et
// la purge cache (vérifiée isolément dans cache-manager.test). Pas de `router` ici :
// l'absence d'import/spy de navigation EST l'assertion « pas de re-navigation » (AC3).
// Sonde de rendu (pas `renderHook` — cf. use-adventures.test).

jest.mock('@/lib/auth/client', () => ({
  authClient: { getSession: jest.fn(() => Promise.resolve(null)) },
}));

jest.mock('@/lib/cache/cache-manager', () => ({
  runCachePurge: jest.fn(() => Promise.resolve()),
}));

const netinfo = NetInfo as unknown as {
  __setState: (s: { isConnected?: boolean | null; isInternetReachable?: boolean | null }) => void;
  __emit: (s: { isConnected?: boolean | null; isInternetReachable?: boolean | null }) => void;
  __reset: () => void;
};

function Probe() {
  useAppStateRefetch();
  return <Text>mounted</Text>;
}

describe('useAppStateRefetch — listener enrichi (MOB-3.5 / AC3-4)', () => {
  beforeEach(() => {
    netinfo.__reset();
    jest.clearAllMocks();
  });

  it('seed online au boot via NetInfo.fetch (corrige dette MOB-2.1)', async () => {
    netinfo.__setState({ isConnected: false, isInternetReachable: false });
    await render(<Probe />);

    await screen.findByText('mounted');
    await waitFor(() => expect(onlineManager.isOnline()).toBe(false));
  });

  it('transition offline → online invalide les queries critiques (sans navigation)', async () => {
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    netinfo.__setState({ isConnected: false, isInternetReachable: false });
    await render(<Probe />);

    await screen.findByText('mounted');
    await waitFor(() => expect(onlineManager.isOnline()).toBe(false));

    invalidateSpy.mockClear();

    // Retour réseau → invalidation ciblée sur le préfixe ['adventures'].
    netinfo.__emit({ isConnected: true, isInternetReachable: true });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['adventures'] });
    });

    invalidateSpy.mockRestore();
  });

  it('background → setFocused(false), active → true (pause/reprise polling MOB-5.2 / AC3) — listener unique', async () => {
    const focusSpy = jest.spyOn(focusManager, 'setFocused');
    let handler: ((s: AppStateStatus) => void) | null = null;
    const addSpy = jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementation((_event, cb) => {
        handler = cb as (s: AppStateStatus) => void;
        return { remove: jest.fn() };
      });

    await render(<Probe />);
    await screen.findByText('mounted');

    // Un SEUL listener AppState (règle projet : jamais de second listener).
    expect(addSpy).toHaveBeenCalledTimes(1);
    expect(handler).not.toBeNull();

    // Background → polling/refetch en pause (GPS natif background indépendant, continue).
    act(() => handler!('background'));
    expect(focusSpy).toHaveBeenLastCalledWith(false);

    // Retour foreground → reprise du polling.
    act(() => handler!('active'));
    expect(focusSpy).toHaveBeenLastCalledWith(true);

    addSpy.mockRestore();
    focusSpy.mockRestore();
  });
});
