import { render, screen, userEvent, waitFor } from '@testing-library/react-native';

import ResetPasswordScreen from '@/app/(auth)/reset-password';
import { authClient } from '@/lib/auth/client';
import { i18n } from '@/lib/i18n';

// Hors de `src/app/` à dessein (require.context Expo Router). Mock auth + router.
// `userEvent` (et non `fireEvent`) : updates async RHF awaitées (cf. login.test.tsx).

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), push: jest.fn() },
}));

jest.mock('@/lib/auth/client', () => ({
  authClient: { requestPasswordReset: jest.fn() },
}));

const mockReset = authClient.requestPasswordReset as unknown as jest.Mock;
const t = (k: string) => i18n.t(k);

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Écran réinitialisation (MOB-2.2 / AC3, AC4)', () => {
  it('rend le titre et le champ email', async () => {
    await render(<ResetPasswordScreen />);

    expect(screen.getByText(t('auth.reset.title'))).toBeTruthy();
    expect(screen.getByLabelText(t('auth.common.emailLabel'))).toBeTruthy();
  });

  it('affiche une erreur inline pour un email invalide sans appeler le serveur', async () => {
    const user = userEvent.setup();
    await render(<ResetPasswordScreen />);

    await user.type(screen.getByLabelText(t('auth.common.emailLabel')), 'nope');
    await user.press(screen.getByText(t('auth.reset.submit')));

    expect(await screen.findByText(t('auth.errors.emailInvalid'))).toBeTruthy();
    expect(mockReset).not.toHaveBeenCalled();
  });

  it('déclenche requestPasswordReset (redirectTo web) et affiche le message neutre', async () => {
    mockReset.mockResolvedValue({ data: { status: true }, error: null });
    const user = userEvent.setup();
    await render(<ResetPasswordScreen />);

    await user.type(
      screen.getByLabelText(t('auth.common.emailLabel')),
      'rider@example.com',
    );
    await user.press(screen.getByText(t('auth.reset.submit')));

    await waitFor(() => {
      expect(mockReset).toHaveBeenCalledWith(
        expect.objectContaining({
          email: 'rider@example.com',
          redirectTo: expect.stringContaining('/reset-password'),
        }),
      );
    });
    expect(await screen.findByText(t('auth.reset.neutralMessage'))).toBeTruthy();
  });

  it('affiche le MÊME message neutre même en cas d’échec (anti-énumération)', async () => {
    mockReset.mockResolvedValue({ data: null, error: { code: 'INTERNAL_SERVER_ERROR' } });
    const user = userEvent.setup();
    await render(<ResetPasswordScreen />);

    await user.type(
      screen.getByLabelText(t('auth.common.emailLabel')),
      'inconnu@example.com',
    );
    await user.press(screen.getByText(t('auth.reset.submit')));

    expect(await screen.findByText(t('auth.reset.neutralMessage'))).toBeTruthy();
  });

  it('affiche un message réseau (et PAS le message neutre) si l’appel REJETTE', async () => {
    // Offline/timeout : rien n'a été envoyé → on n'affiche pas le faux « envoyé ».
    mockReset.mockRejectedValue(new Error('Network request failed'));
    const user = userEvent.setup();
    await render(<ResetPasswordScreen />);

    await user.type(
      screen.getByLabelText(t('auth.common.emailLabel')),
      'rider@example.com',
    );
    await user.press(screen.getByText(t('auth.reset.submit')));

    expect(await screen.findByText(t('auth.errors.network'))).toBeTruthy();
    expect(screen.queryByText(t('auth.reset.neutralMessage'))).toBeNull();
  });

  it('passe le bouton en chargement et empêche le double-submit', async () => {
    let resolveReset: (v: unknown) => void = () => {};
    mockReset.mockReturnValue(
      new Promise((resolve) => {
        resolveReset = resolve;
      }),
    );
    const user = userEvent.setup();
    await render(<ResetPasswordScreen />);

    await user.type(
      screen.getByLabelText(t('auth.common.emailLabel')),
      'rider@example.com',
    );
    await user.press(screen.getByText(t('auth.reset.submit')));

    expect(await screen.findByText(t('auth.reset.submitting'))).toBeTruthy();
    await user.press(screen.getByText(t('auth.reset.submitting')));
    expect(mockReset).toHaveBeenCalledTimes(1);

    resolveReset({ data: { status: true }, error: null });
    await screen.findByText(t('auth.reset.neutralMessage'));
  });
});
