import * as NetInfo from '@react-native-community/netinfo';
import { render, screen, waitFor } from '@testing-library/react-native';

import { StatusBanner } from '@/components/shared/status-banner';
import { i18n } from '@/lib/i18n';

// `useSafeAreaInsets` exige un provider en runtime → mock plat (pattern repo).
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const netinfo = NetInfo as unknown as {
  __setState: (s: { isConnected?: boolean | null; isInternetReachable?: boolean | null }) => void;
  __reset: () => void;
};

const t = (k: string) => i18n.t(k);

beforeEach(() => {
  netinfo.__reset();
});

describe('StatusBanner (MOB-3.5 / AC2-3)', () => {
  it('masqué quand online', async () => {
    netinfo.__setState({ isConnected: true, isInternetReachable: true });
    await render(<StatusBanner />);

    // Laisse le seed NetInfo.fetch s'appliquer, puis vérifie l'absence.
    await waitFor(() => {
      expect(screen.queryByText(t('offline.banner'))).toBeNull();
    });
  });

  it('visible offline avec le message i18n « Mode hors ligne »', async () => {
    netinfo.__setState({ isConnected: false, isInternetReachable: false });
    await render(<StatusBanner />);

    expect(await screen.findByText(t('offline.banner'))).toBeTruthy();
  });

  it('expose un rôle alert (live-region a11y)', async () => {
    netinfo.__setState({ isConnected: false, isInternetReachable: false });
    await render(<StatusBanner />);

    await screen.findByText(t('offline.banner'));
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('forceVisible affiche le bandeau même online', async () => {
    netinfo.__setState({ isConnected: true, isInternetReachable: true });
    await render(<StatusBanner forceVisible message="custom" />);

    expect(screen.getByText('custom')).toBeTruthy();
  });
});
