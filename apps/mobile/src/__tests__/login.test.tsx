import { render, screen, userEvent, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import LoginScreen from '@/app/(auth)/login';
import { authClient } from '@/lib/auth/client';
import { i18n } from '@/lib/i18n';

// Hors de `src/app/` à dessein (require.context Expo Router). Mock auth + router.
//
// ⚠️ On utilise `userEvent` (et non `fireEvent`) : avec RNTL v14 + React 19, les
// interactions qui déclenchent des mises à jour async (handleSubmit RHF →
// `isSubmitting`, validation Zod async) DOIVENT être awaitées, sinon un `act()`
// reste ouvert et « déborde » sur le test suivant (renders non commités).

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
}));

jest.mock('@/lib/auth/client', () => ({
  authClient: { signIn: { email: jest.fn() } },
}));

const mockSignIn = authClient.signIn.email as unknown as jest.Mock;
const mockReplace = router.replace as unknown as jest.Mock;
const mockPush = router.push as unknown as jest.Mock;
const t = (k: string) => i18n.t(k);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Écran connexion (MOB-2.2 / AC2, AC4)', () => {
  it('rend le titre, les champs et le slot OAuth Google désactivé', async () => {
    await render(<LoginScreen />);

    expect(screen.getByText(t('auth.login.title'))).toBeTruthy();
    expect(screen.getByLabelText(t('auth.common.emailLabel'))).toBeTruthy();
    expect(screen.getByLabelText(t('auth.common.passwordLabel'))).toBeTruthy();
    // Slot OAuth réservé (MOB-2.3) : présent mais désactivé.
    expect(screen.getByText(t('auth.login.googleCta'))).toBeDisabled();
  });

  it('affiche une erreur de validation inline pour un email invalide', async () => {
    const user = userEvent.setup();
    await render(<LoginScreen />);

    await user.type(screen.getByLabelText(t('auth.common.emailLabel')), 'nope');
    await user.type(screen.getByLabelText(t('auth.common.passwordLabel')), 'x');
    await user.press(screen.getByText(t('auth.login.submit')));

    expect(await screen.findByText(t('auth.errors.emailInvalid'))).toBeTruthy();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('soumet signIn.email puis redirige vers adventures', async () => {
    mockSignIn.mockResolvedValue({ data: { user: { id: 'u1' } }, error: null });
    const user = userEvent.setup();
    await render(<LoginScreen />);

    await user.type(
      screen.getByLabelText(t('auth.common.emailLabel')),
      'rider@example.com',
    );
    await user.type(screen.getByLabelText(t('auth.common.passwordLabel')), 'secret123');
    await user.press(screen.getByText(t('auth.login.submit')));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledWith({
        email: 'rider@example.com',
        password: 'secret123',
      });
    });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/adventures');
    });
  });

  it('affiche un message GÉNÉRIQUE sur identifiants invalides (anti-énumération)', async () => {
    mockSignIn.mockResolvedValue({
      data: null,
      error: { code: 'INVALID_EMAIL_OR_PASSWORD' },
    });
    const user = userEvent.setup();
    await render(<LoginScreen />);

    await user.type(
      screen.getByLabelText(t('auth.common.emailLabel')),
      'rider@example.com',
    );
    await user.type(screen.getByLabelText(t('auth.common.passwordLabel')), 'wrongpass');
    await user.press(screen.getByText(t('auth.login.submit')));

    expect(await screen.findByText(t('auth.errors.invalidCredentials'))).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('affiche un message DÉDIÉ sur rate-limit 429 (et non « identifiants invalides »)', async () => {
    mockSignIn.mockResolvedValue({ data: null, error: { status: 429 } });
    const user = userEvent.setup();
    await render(<LoginScreen />);

    await user.type(
      screen.getByLabelText(t('auth.common.emailLabel')),
      'rider@example.com',
    );
    await user.type(screen.getByLabelText(t('auth.common.passwordLabel')), 'secret123');
    await user.press(screen.getByText(t('auth.login.submit')));

    expect(await screen.findByText(t('auth.errors.tooManyRequests'))).toBeTruthy();
    expect(screen.queryByText(t('auth.errors.invalidCredentials'))).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('affiche un message réseau si l’appel REJETTE (offline/timeout)', async () => {
    mockSignIn.mockRejectedValue(new Error('Network request failed'));
    const user = userEvent.setup();
    await render(<LoginScreen />);

    await user.type(
      screen.getByLabelText(t('auth.common.emailLabel')),
      'rider@example.com',
    );
    await user.type(screen.getByLabelText(t('auth.common.passwordLabel')), 'secret123');
    await user.press(screen.getByText(t('auth.login.submit')));

    expect(await screen.findByText(t('auth.errors.network'))).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('passe le bouton en chargement et empêche le double-submit', async () => {
    let resolveSignIn: (v: unknown) => void = () => {};
    mockSignIn.mockReturnValue(
      new Promise((resolve) => {
        resolveSignIn = resolve;
      }),
    );
    const user = userEvent.setup();
    await render(<LoginScreen />);

    await user.type(
      screen.getByLabelText(t('auth.common.emailLabel')),
      'rider@example.com',
    );
    await user.type(screen.getByLabelText(t('auth.common.passwordLabel')), 'secret123');
    await user.press(screen.getByText(t('auth.login.submit')));

    expect(await screen.findByText(t('auth.login.submitting'))).toBeTruthy();
    // Second tap pendant le chargement (bouton désactivé) → aucun appel supplémentaire.
    await user.press(screen.getByText(t('auth.login.submitting')));
    expect(mockSignIn).toHaveBeenCalledTimes(1);

    resolveSignIn({ data: { user: { id: 'u1' } }, error: null });
    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/adventures');
    });
  });

  it('navigue vers signup et reset-password via les liens', async () => {
    const user = userEvent.setup();
    await render(<LoginScreen />);

    await user.press(screen.getByText(t('auth.login.signupLink')));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/signup');

    await user.press(screen.getByText(t('auth.login.forgotPassword')));
    expect(mockPush).toHaveBeenCalledWith('/(auth)/reset-password');
  });
});
