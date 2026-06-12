import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  render,
  screen,
  userEvent,
  waitFor,
} from '@testing-library/react-native';
import { router } from 'expo-router';

import { AccountSection } from '@/components/shared/account-section';
import { invalidateAuthTokenCache } from '@/lib/api/api-client';
import { authClient, signOut } from '@/lib/auth/client';
import { i18n } from '@/lib/i18n';

// Sections Compte + Zone de danger des Paramètres (MOB-2.5 / AC1, AC2).
//
// On mocke le wrapper `@/lib/auth/client` (jamais `@better-auth/expo` directement,
// cf. AGENTS.md), `expo-router` et le cache token d'`apiFetch`. La carte est rendue
// dans un vrai `QueryClientProvider` → le test exerce le composant ET le hook
// `useAccountActions` (purge locale + redirection).

jest.mock('@/lib/auth/client', () => ({
  authClient: { deleteUser: jest.fn() },
  signOut: jest.fn(),
}));

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
}));

jest.mock('@/lib/api/api-client', () => ({
  invalidateAuthTokenCache: jest.fn(),
}));

const mockSignOut = signOut as unknown as jest.Mock;
const mockDeleteUser = authClient.deleteUser as unknown as jest.Mock;
const mockReplace = router.replace as unknown as jest.Mock;
const mockInvalidate = invalidateAuthTokenCache as unknown as jest.Mock;
const t = (k: string, opts?: Record<string, unknown>) => i18n.t(k, opts);

const CONFIRM_WORD = t('settings.deleteAccount.confirmWord'); // « SUPPRIMER »
const LOGIN_ROUTE = '/(auth)/login';

let queryClientClearSpy: jest.SpyInstance;

async function renderSection(): Promise<void> {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  queryClientClearSpy = jest.spyOn(queryClient, 'clear');
  // RNTL v14 + React 19 : `render` awaité (flush des effets async).
  await render(
    <QueryClientProvider client={queryClient}>
      <AccountSection />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  mockSignOut.mockResolvedValue(undefined);
  mockDeleteUser.mockResolvedValue({ data: { success: true }, error: null });
});

describe('AccountSection — déconnexion (MOB-2.5 / AC1)', () => {
  it('logout : tap → signOut + purge token + queryClient.clear + redirect login', async () => {
    const user = userEvent.setup();
    await renderSection();

    await user.press(screen.getByText(t('settings.logout.button')));

    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    expect(mockInvalidate).toHaveBeenCalledTimes(1);
    expect(queryClientClearSpy).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith(LOGIN_ROUTE);
  });

  it('logout en échec : ErrorBanner + AUCUNE redirection (pas de purge partielle)', async () => {
    mockSignOut.mockRejectedValue(new Error('network'));
    const user = userEvent.setup();
    await renderSection();

    await user.press(screen.getByText(t('settings.logout.button')));

    expect(await screen.findByText(t('settings.logout.error'))).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(queryClientClearSpy).not.toHaveBeenCalled();
  });
});

describe('AccountSection — suppression de compte (MOB-2.5 / AC2)', () => {
  it('ouvre la confirmation au tap « Supprimer mon compte »', async () => {
    const user = userEvent.setup();
    await renderSection();

    await user.press(screen.getByText(t('settings.deleteAccount.button')));

    expect(
      await screen.findByText(t('settings.deleteAccount.warningTitle')),
    ).toBeTruthy();
    // Le bouton de confirmation est présent une fois la modal ouverte.
    expect(screen.getByText(t('settings.deleteAccount.confirm'))).toBeTruthy();
  });

  it('confirmation absente/invalide : NE déclenche PAS deleteUser', async () => {
    const user = userEvent.setup();
    await renderSection();

    await user.press(screen.getByText(t('settings.deleteAccount.button')));
    // Saisie volontairement erronée → bouton confirmer désactivé.
    await user.type(
      await screen.findByLabelText(
        t('settings.deleteAccount.confirmLabel', { word: CONFIRM_WORD }),
      ),
      'nope',
    );
    await user.press(screen.getByText(t('settings.deleteAccount.confirm')));

    expect(mockDeleteUser).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('confirmation correcte : deleteUser + signOut + purge + redirect login', async () => {
    const user = userEvent.setup();
    await renderSection();

    await user.press(screen.getByText(t('settings.deleteAccount.button')));
    await user.type(
      await screen.findByLabelText(
        t('settings.deleteAccount.confirmLabel', { word: CONFIRM_WORD }),
      ),
      CONFIRM_WORD,
    );
    await user.press(screen.getByText(t('settings.deleteAccount.confirm')));

    await waitFor(() => expect(mockDeleteUser).toHaveBeenCalledTimes(1));
    expect(mockSignOut).toHaveBeenCalledTimes(1); // purge secure-store
    expect(mockInvalidate).toHaveBeenCalledTimes(1);
    expect(queryClientClearSpy).toHaveBeenCalledTimes(1);
    expect(mockReplace).toHaveBeenCalledWith(LOGIN_ROUTE);
  });

  it('deleteUser renvoie { error } : ErrorBanner + reste connecté (aucun état partiel)', async () => {
    mockDeleteUser.mockResolvedValue({
      data: null,
      error: { message: 'forbidden' },
    });
    const user = userEvent.setup();
    await renderSection();

    await user.press(screen.getByText(t('settings.deleteAccount.button')));
    await user.type(
      await screen.findByLabelText(
        t('settings.deleteAccount.confirmLabel', { word: CONFIRM_WORD }),
      ),
      CONFIRM_WORD,
    );
    await user.press(screen.getByText(t('settings.deleteAccount.confirm')));

    expect(
      await screen.findByText(t('settings.deleteAccount.error')),
    ).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(queryClientClearSpy).not.toHaveBeenCalled();
  });

  it('deleteUser REJETTE (réseau) : ErrorBanner + reste connecté', async () => {
    mockDeleteUser.mockRejectedValue(new Error('network'));
    const user = userEvent.setup();
    await renderSection();

    await user.press(screen.getByText(t('settings.deleteAccount.button')));
    await user.type(
      await screen.findByLabelText(
        t('settings.deleteAccount.confirmLabel', { word: CONFIRM_WORD }),
      ),
      CONFIRM_WORD,
    );
    await user.press(screen.getByText(t('settings.deleteAccount.confirm')));

    expect(
      await screen.findByText(t('settings.deleteAccount.error')),
    ).toBeTruthy();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
