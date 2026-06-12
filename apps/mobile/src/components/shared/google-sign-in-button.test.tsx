import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { GoogleSignInButton } from '@/components/shared/google-sign-in-button';
import { authClient } from '@/lib/auth/client';
import { i18n } from '@/lib/i18n';

// Bouton Google réutilisable (MOB-2.3 / AC1, AC2, AC3). On mocke le wrapper
// `@/lib/auth/client` (jamais `@better-auth/expo` directement, cf. AGENTS.md) et
// `router`. `signIn.social` est awaité ; le SUCCÈS se détecte au cookie persisté
// (`getCookie()`), car `signIn.social` RÉSOUT aussi sur annulation.
//
// `userEvent` (et non `fireEvent`) : RNTL v14 + React 19 exige d'await les updates
// async (setPending / handlePress), sinon un act() déborde sur le test suivant.

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
}));

jest.mock('@/lib/auth/client', () => ({
  authClient: {
    signIn: { social: jest.fn() },
    getCookie: jest.fn(() => ''),
  },
}));

const mockSocial = authClient.signIn.social as unknown as jest.Mock;
const mockGetCookie = authClient.getCookie as unknown as jest.Mock;
const mockReplace = router.replace as unknown as jest.Mock;
const t = (k: string) => i18n.t(k);

beforeEach(() => {
  jest.clearAllMocks();
  mockGetCookie.mockReturnValue('');
});

describe('GoogleSignInButton (MOB-2.3 / AC1, AC2, AC3)', () => {
  it('rend le libellé « Continuer avec Google » et le bouton est actif', async () => {
    await render(<GoogleSignInButton />);

    expect(screen.getByText(t('auth.google.continue'))).toBeTruthy();
    expect(screen.getByText(t('auth.google.continue'))).toBeEnabled();
  });

  it('appelle signIn.social({ provider: google, callbackURL }) au tap (AC1)', async () => {
    mockSocial.mockResolvedValue({ data: { redirect: true }, error: null });
    mockGetCookie.mockReturnValue('ridenrest.session_token=abc');
    const user = userEvent.setup();
    await render(<GoogleSignInButton />);

    await user.press(screen.getByText(t('auth.google.continue')));

    await waitFor(() => {
      expect(mockSocial).toHaveBeenCalledWith({
        provider: 'google',
        callbackURL: 'ridenrest://oauth-callback',
      });
    });
  });

  it('redirige vers adventures quand la session est persistée (cookie présent) (AC2)', async () => {
    mockSocial.mockResolvedValue({ data: { redirect: true }, error: null });
    mockGetCookie.mockReturnValue('ridenrest.session_token=abc');
    const user = userEvent.setup();
    await render(<GoogleSignInButton />);

    await user.press(screen.getByText(t('auth.google.continue')));

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/adventures');
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('annulation : aucune session (cookie vide) → message + AUCUNE redirection + bouton réutilisable (AC3)', async () => {
    // openAuthSessionAsync renvoie cancel/dismiss → signIn.social résout SANS session.
    mockSocial.mockResolvedValue({ data: { redirect: true }, error: null });
    mockGetCookie.mockReturnValue('');
    const user = userEvent.setup();
    await render(<GoogleSignInButton />);

    await user.press(screen.getByText(t('auth.google.continue')));

    expect(
      await screen.findByText(t('auth.errors.oauthCancelled')),
    ).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
    // Bouton ré-activé (pas d'état partiel) : un nouveau tap relance le flow.
    expect(screen.getByText(t('auth.google.continue'))).toBeEnabled();
  });

  it('échec réseau : signIn.social REJETTE → message d’erreur, pas de session (AC3)', async () => {
    mockSocial.mockRejectedValue(new Error('Network request failed'));
    const user = userEvent.setup();
    await render(<GoogleSignInButton />);

    await user.press(screen.getByText(t('auth.google.continue')));

    expect(await screen.findByText(t('auth.errors.oauthFailed'))).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(screen.getByText(t('auth.google.continue'))).toBeEnabled();
  });

  it('empêche le double-tap pendant le flow en cours', async () => {
    let resolveSocial: (v: unknown) => void = () => {};
    mockSocial.mockReturnValue(
      new Promise((resolve) => {
        resolveSocial = resolve;
      }),
    );
    const user = userEvent.setup();
    await render(<GoogleSignInButton />);

    const label = screen.getByText(t('auth.google.continue'));
    await user.press(label);
    // Pendant le flow, le bouton est désactivé (busy) → second tap ignoré.
    await user.press(label);
    expect(mockSocial).toHaveBeenCalledTimes(1);

    mockGetCookie.mockReturnValue('ridenrest.session_token=abc');
    resolveSocial({ data: { redirect: true }, error: null });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/adventures');
    });
  });
});
