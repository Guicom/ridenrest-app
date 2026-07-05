import * as NetInfo from '@react-native-community/netinfo';
import { render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { deriveIsOnline, useNetworkStatus } from './use-network-status';

// ⚠️ Pas de `renderHook` (RNTL v14 + React 19 : `result.current` peu fiable, cf.
// use-adventures.test). Sonde : un composant qui rend la valeur du hook dans son
// corps → assertions sur le texte rendu.

const netinfo = NetInfo as unknown as {
  __setState: (s: { isConnected?: boolean | null; isInternetReachable?: boolean | null }) => void;
  __emit: (s: { isConnected?: boolean | null; isInternetReachable?: boolean | null }) => void;
  __reset: () => void;
};

function Probe() {
  const { isOnline } = useNetworkStatus();
  return <Text>{isOnline ? 'online' : 'offline'}</Text>;
}

beforeEach(() => {
  netinfo.__reset();
});

describe('deriveIsOnline (MOB-3.5)', () => {
  it('offline si isInternetReachable === false même si isConnected', () => {
    expect(deriveIsOnline(true, false)).toBe(false);
  });

  it('online si connecté et internet joignable', () => {
    expect(deriveIsOnline(true, true)).toBe(true);
  });

  it('isConnected null + reachable null → optimiste true (boot)', () => {
    expect(deriveIsOnline(null, null)).toBe(true);
  });

  it('isConnected false → offline', () => {
    expect(deriveIsOnline(false, null)).toBe(false);
  });
});

describe('useNetworkStatus (MOB-3.5 / AC2-3)', () => {
  it('seed initial via NetInfo.fetch (boot offline reflété)', async () => {
    netinfo.__setState({ isConnected: false, isInternetReachable: false });
    await render(<Probe />);

    expect(await screen.findByText('offline')).toBeTruthy();
  });

  it('transition online → offline → online met à jour isOnline', async () => {
    netinfo.__setState({ isConnected: true, isInternetReachable: true });
    await render(<Probe />);

    await waitFor(() => expect(screen.getByText('online')).toBeTruthy());

    netinfo.__emit({ isConnected: false, isInternetReachable: false });
    await waitFor(() => expect(screen.getByText('offline')).toBeTruthy());

    netinfo.__emit({ isConnected: true, isInternetReachable: true });
    await waitFor(() => expect(screen.getByText('online')).toBeTruthy());
  });
});
