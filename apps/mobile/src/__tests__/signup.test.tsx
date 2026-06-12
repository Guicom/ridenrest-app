import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import SignUpScreen from '@/app/(auth)/signup';
import { authClient } from '@/lib/auth/client';
import { i18n } from '@/lib/i18n';

// ⚠️ Hors de `src/app/` À DESSEIN : le `require.context` d'Expo Router bundlerait
// ce test sinon (cf. AGENTS.md). On mocke le wrapper `@/lib/auth/client` et `router`
// (pas de réseau réel, pas de natif secure-store). i18n est réel (langue = fr en test).
//
// `userEvent` (et non `fireEvent`) : RNTL v14 + React 19 exige d'await les updates
// async (handleSubmit RHF / `isSubmitting`), sinon un act() déborde sur le test suivant.

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
}));

jest.mock('@/lib/auth/client', () => ({
  authClient: { signUp: { email: jest.fn() } },
}));

const mockSignUp = authClient.signUp.email as unknown as jest.Mock;
const mockReplace = router.replace as unknown as jest.Mock;
const t = (k: string) => i18n.t(k);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Écran inscription (MOB-2.2 / AC1, AC4)', () => {
  it('rend le titre et les champs email / mot de passe', async () => {
    await render(<SignUpScreen />);

    expect(screen.getByText(t('auth.signup.title'))).toBeTruthy();
    expect(screen.getByLabelText(t('auth.common.emailLabel'))).toBeTruthy();
    expect(screen.getByLabelText(t('auth.common.passwordLabel'))).toBeTruthy();
  });

  it('affiche les erreurs de validation inline (email invalide, mdp < 8) sans appeler le serveur', async () => {
    const user = userEvent.setup();
    await render(<SignUpScreen />);

    await user.type(screen.getByLabelText(t('auth.common.emailLabel')), 'pasunemail');
    await user.type(screen.getByLabelText(t('auth.common.passwordLabel')), 'court');
    await user.press(screen.getByText(t('auth.signup.submit')));

    expect(await screen.findByText(t('auth.errors.emailInvalid'))).toBeTruthy();
    expect(screen.getByText(t('auth.errors.passwordTooShort'))).toBeTruthy();
    expect(mockSignUp).not.toHaveBeenCalled();
  });

  it('soumet signUp.email (name dérivé de l’email) puis redirige vers adventures', async () => {
    mockSignUp.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    const user = userEvent.setup();
    await render(<SignUpScreen />);

    await user.type(
      screen.getByLabelText(t('auth.common.emailLabel')),
      'rider@example.com',
    );
    await user.type(screen.getByLabelText(t('auth.common.passwordLabel')), 'motdepasse1');
    await user.press(screen.getByText(t('auth.signup.submit')));

    await waitFor(() => {
      expect(mockSignUp).toHaveBeenCalledWith({
        name: 'rider',
        email: 'rider@example.com',
        password: 'motdepasse1',
      });
    });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/adventures');
    });
  });

  it('mappe USER_ALREADY_EXISTS vers un message i18n et ne redirige pas', async () => {
    mockSignUp.mockResolvedValue({ data: null, error: { code: 'USER_ALREADY_EXISTS' } });
    const user = userEvent.setup();
    await render(<SignUpScreen />);

    await user.type(
      screen.getByLabelText(t('auth.common.emailLabel')),
      'rider@example.com',
    );
    await user.type(screen.getByLabelText(t('auth.common.passwordLabel')), 'motdepasse1');
    await user.press(screen.getByText(t('auth.signup.submit')));

    expect(await screen.findByText(t('auth.errors.emailTaken'))).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('affiche un message réseau si l’appel REJETTE (offline/timeout)', async () => {
    mockSignUp.mockRejectedValue(new Error('Network request failed'));
    const user = userEvent.setup();
    await render(<SignUpScreen />);

    await user.type(
      screen.getByLabelText(t('auth.common.emailLabel')),
      'rider@example.com',
    );
    await user.type(screen.getByLabelText(t('auth.common.passwordLabel')), 'motdepasse1');
    await user.press(screen.getByText(t('auth.signup.submit')));

    expect(await screen.findByText(t('auth.errors.network'))).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('passe le bouton en état chargement et empêche le double-submit', async () => {
    let resolveSignUp: (v: unknown) => void = () => {};
    mockSignUp.mockReturnValue(
      new Promise((resolve) => {
        resolveSignUp = resolve;
      }),
    );
    const user = userEvent.setup();
    await render(<SignUpScreen />);

    await user.type(
      screen.getByLabelText(t('auth.common.emailLabel')),
      'rider@example.com',
    );
    await user.type(screen.getByLabelText(t('auth.common.passwordLabel')), 'motdepasse1');
    await user.press(screen.getByText(t('auth.signup.submit')));

    // Le libellé bascule en « Création… » : preuve de l'état chargement.
    expect(await screen.findByText(t('auth.signup.submitting'))).toBeTruthy();
    // Second tap pendant le chargement (bouton désactivé) → aucun appel supplémentaire.
    await user.press(screen.getByText(t('auth.signup.submitting')));
    expect(mockSignUp).toHaveBeenCalledTimes(1);

    // Résout puis draine la suite (redirection + isSubmitting→false) pour clore l'act.
    resolveSignUp({ data: { user: { id: 'u1' } }, error: null });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/adventures');
    });
  });
});
