import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import * as WebBrowser from 'expo-web-browser';

import { StravaConnectionCard } from '@/components/shared/strava-connection-card';
import { authClient } from '@/lib/auth/client';
import { i18n } from '@/lib/i18n';

// Carte de connexion Strava (MOB-2.4 / AC2, AC3). Strava = account-LINKING depuis
// les Paramètres (utilisateur déjà connecté), jamais un sign-in.
//
// On mocke le wrapper `@/lib/auth/client` (jamais `@better-auth/expo` directement,
// cf. AGENTS.md) et on rend la carte dans un vrai `QueryClientProvider` : le test
// exerce donc à la fois la carte ET le hook `useStravaConnection`.
//   - état lu via `listAccounts()` → présence d'un provider `strava`
//   - connect → `oauth2.link({ providerId:'strava' })` (résout aussi sur annulation
//     → vérité re-lue via `listAccounts`)
//   - disconnect → `unlinkAccount({ providerId:'strava' })`

jest.mock('@/lib/auth/client', () => ({
  authClient: {
    listAccounts: jest.fn(),
    oauth2: { link: jest.fn() },
    unlinkAccount: jest.fn(),
    getCookie: jest.fn(() => 'better-auth.oauth_state=STATE123'),
  },
}));

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
}));

const mockListAccounts = authClient.listAccounts as unknown as jest.Mock;
const mockLink = authClient.oauth2.link as unknown as jest.Mock;
const mockUnlink = authClient.unlinkAccount as unknown as jest.Mock;
const mockOpenAuth = WebBrowser.openAuthSessionAsync as unknown as jest.Mock;
const t = (k: string) => i18n.t(k);

const STRAVA_ACCOUNT = { data: [{ providerId: 'strava', accountId: '123' }] };
const NO_ACCOUNT = { data: [] };
const STRAVA_AUTH_URL = 'https://www.strava.com/oauth/authorize?client_id=1';
const LINK_URL_RESPONSE = { data: { url: STRAVA_AUTH_URL, redirect: true } };

async function renderCard(): Promise<void> {
  // QueryClient neuf par test, retry désactivé (les états d'erreur sont immédiats).
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  // RNTL v14 + React 19 : `render` doit être awaité (flush des effets async).
  await render(
    <QueryClientProvider client={queryClient}>
      <StravaConnectionCard />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockListAccounts.mockResolvedValue(NO_ACCOUNT);
  // `oauth2.link` renvoie l'URL d'autorisation (le plugin expo n'ouvre PAS le
  // navigateur pour /oauth2/link → la carte l'ouvre via expo-web-browser).
  mockLink.mockResolvedValue(LINK_URL_RESPONSE);
  mockOpenAuth.mockResolvedValue({ type: 'success', url: 'ridenrest://oauth-callback' });
  mockUnlink.mockResolvedValue(undefined);
});

describe('StravaConnectionCard (MOB-2.4 / AC2, AC3)', () => {
  it('affiche un skeleton pendant le chargement de l’état', async () => {
    // `listAccounts` ne résout jamais → la query reste en chargement.
    mockListAccounts.mockReturnValue(new Promise(() => {}));
    await renderCard();

    // Le skeleton est masqué des lecteurs d'écran (décoratif) → inclure les
    // éléments a11y-hidden pour l'assertion.
    expect(
      screen.getByTestId('strava-status-skeleton', {
        includeHiddenElements: true,
      }),
    ).toBeTruthy();
    // Pendant le chargement : ni statut ni bouton d'action (pas d'état mensonger).
    expect(screen.queryByText(t('auth.strava.notConnected'))).toBeNull();
    expect(screen.queryByText(t('auth.strava.connect'))).toBeNull();
  });

  it('état NON connecté : statut + bouton « Connecter Strava »', async () => {
    mockListAccounts.mockResolvedValue(NO_ACCOUNT);
    await renderCard();

    expect(await screen.findByText(t('auth.strava.notConnected'))).toBeTruthy();
    expect(screen.getByText(t('auth.strava.connect'))).toBeTruthy();
  });

  it('état connecté : statut « Compte connecté » + bouton « Déconnecter »', async () => {
    mockListAccounts.mockResolvedValue(STRAVA_ACCOUNT);
    await renderCard();

    expect(await screen.findByText(t('auth.strava.connected'))).toBeTruthy();
    expect(screen.getByText(t('auth.strava.disconnect'))).toBeTruthy();
  });

  it('connect : tap → oauth2.link + ouverture navigateur → UI « connecté » (AC2)', async () => {
    mockListAccounts.mockResolvedValueOnce(NO_ACCOUNT); // query initiale
    mockListAccounts.mockResolvedValue(STRAVA_ACCOUNT); // post-link + refetch
    const user = userEvent.setup();
    await renderCard();

    await user.press(await screen.findByText(t('auth.strava.connect')));

    await waitFor(() => {
      expect(mockLink).toHaveBeenCalledWith({
        providerId: 'strava',
        callbackURL: 'ridenrest://oauth-callback',
      });
    });
    // Le navigateur est ouvert sur le PROXY expo (réinjecte oauth_state côté browser
    // → évite state_mismatch au callback), avec l'URL Strava + le state encodés.
    const [proxyUrl, returnUrl] = mockOpenAuth.mock.calls[0];
    expect(proxyUrl).toContain('/api/auth/expo-authorization-proxy');
    expect(proxyUrl).toContain(
      `authorizationURL=${encodeURIComponent(STRAVA_AUTH_URL)}`,
    );
    expect(proxyUrl).toContain('oauthState=STATE123');
    expect(returnUrl).toBe('ridenrest://oauth-callback');
    expect(await screen.findByText(t('auth.strava.connected'))).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('annulation : navigateur fermé (type !== success) → ErrorBanner + reste « non connecté » (AC3)', async () => {
    mockListAccounts.mockResolvedValue(NO_ACCOUNT);
    mockOpenAuth.mockResolvedValue({ type: 'cancel' });
    const user = userEvent.setup();
    await renderCard();

    await user.press(await screen.findByText(t('auth.strava.connect')));

    expect(
      await screen.findByText(t('auth.strava.errors.cancelled')),
    ).toBeTruthy();
    expect(screen.getByText(t('auth.strava.notConnected'))).toBeTruthy();
    // Aucune liaison partielle : le bouton connect reste disponible.
    expect(screen.getByText(t('auth.strava.connect'))).toBeTruthy();
  });

  it('retour navigateur OK mais aucun compte lié (erreur OAuth) → annulée + reste « non connecté »', async () => {
    // openAuthSession renvoie success, mais le serveur n'a pas lié (erreur Strava)
    // → listAccounts reste vide → traité comme annulation (jamais « connecté »).
    mockListAccounts.mockResolvedValue(NO_ACCOUNT);
    mockOpenAuth.mockResolvedValue({ type: 'success', url: 'ridenrest://oauth-callback?error=access_denied' });
    const user = userEvent.setup();
    await renderCard();

    await user.press(await screen.findByText(t('auth.strava.connect')));

    expect(
      await screen.findByText(t('auth.strava.errors.cancelled')),
    ).toBeTruthy();
    expect(screen.getByText(t('auth.strava.notConnected'))).toBeTruthy();
  });

  it('échec : link ne renvoie aucune URL → ErrorBanner connectFailed (AC3)', async () => {
    mockListAccounts.mockResolvedValue(NO_ACCOUNT);
    mockLink.mockResolvedValue({ data: null }); // pas d'URL d'autorisation
    const user = userEvent.setup();
    await renderCard();

    await user.press(await screen.findByText(t('auth.strava.connect')));

    expect(
      await screen.findByText(t('auth.strava.errors.connectFailed')),
    ).toBeTruthy();
    expect(screen.getByText(t('auth.strava.notConnected'))).toBeTruthy();
  });

  it('échec réseau : link REJETTE → ErrorBanner connectFailed + reste « non connecté » (AC3)', async () => {
    mockListAccounts.mockResolvedValue(NO_ACCOUNT);
    mockLink.mockRejectedValue(new Error('Network request failed'));
    const user = userEvent.setup();
    await renderCard();

    await user.press(await screen.findByText(t('auth.strava.connect')));

    expect(
      await screen.findByText(t('auth.strava.errors.connectFailed')),
    ).toBeTruthy();
    expect(screen.getByText(t('auth.strava.notConnected'))).toBeTruthy();
  });

  it('disconnect : tap → unlinkAccount({ providerId:strava }) puis UI « non connecté » (AC3)', async () => {
    mockListAccounts.mockResolvedValueOnce(STRAVA_ACCOUNT); // query initiale (connecté)
    mockListAccounts.mockResolvedValue(NO_ACCOUNT); // après unlink + refetch
    const user = userEvent.setup();
    await renderCard();

    await user.press(await screen.findByText(t('auth.strava.disconnect')));

    await waitFor(() => {
      expect(mockUnlink).toHaveBeenCalledWith({ providerId: 'strava' });
    });
    expect(await screen.findByText(t('auth.strava.notConnected'))).toBeTruthy();
  });

  it('disconnect : unlinkAccount REJETTE → ErrorBanner + reste « connecté »', async () => {
    mockListAccounts.mockResolvedValue(STRAVA_ACCOUNT);
    mockUnlink.mockRejectedValue(new Error('boom'));
    const user = userEvent.setup();
    await renderCard();

    await user.press(await screen.findByText(t('auth.strava.disconnect')));

    expect(
      await screen.findByText(t('auth.strava.errors.disconnectFailed')),
    ).toBeTruthy();
    expect(screen.getByText(t('auth.strava.connected'))).toBeTruthy();
  });
});
