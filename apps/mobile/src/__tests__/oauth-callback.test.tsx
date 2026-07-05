import { render, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import OAuthCallbackScreen from '@/app/oauth-callback';
import { authClient } from '@/lib/auth/client';

// Écran de TRANSITION du deep link `ridenrest://oauth-callback` (MOB-2.3 / AC2,
// AC3). Filet de sécurité si l'OS route le deep link vers l'app au lieu de le
// laisser capter par `openAuthSessionAsync`. NE traite aucun token : il valide
// les params (validation déférée de MOB-1.4) puis route selon la session déjà
// persistée — JAMAIS d'état partiel. Hors `src/app/` (require.context Expo Router).

jest.mock('expo-router', () => ({
  router: { replace: jest.fn() },
  useLocalSearchParams: jest.fn(() => ({})),
}));

jest.mock('@/lib/auth/client', () => ({
  authClient: { getCookie: jest.fn(() => '') },
}));

const mockParams = useLocalSearchParams as unknown as jest.Mock;
const mockGetCookie = authClient.getCookie as unknown as jest.Mock;
const mockReplace = router.replace as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockParams.mockReturnValue({});
  mockGetCookie.mockReturnValue('');
});

describe('OAuthCallbackScreen — écran de transition (MOB-2.3 / AC2, AC3)', () => {
  it('affiche un loader (et plus aucun dump debug des params)', async () => {
    mockParams.mockReturnValue({ code: 'xyz' });
    await render(<OAuthCallbackScreen />);

    expect(screen.getByTestId('oauth-callback-loader')).toBeTruthy();
    // L'ancien placeholder MOB-1.4 affichait JSON.stringify(params) : plus de dump.
    expect(screen.queryByText(/"code"/)).toBeNull();
  });

  it('session persistée + aucun error param → redirige vers adventures (AC2)', async () => {
    mockGetCookie.mockReturnValue('ridenrest.session_token=abc');
    mockParams.mockReturnValue({});
    await render(<OAuthCallbackScreen />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(app)/adventures');
    });
  });

  it('aucune session (annulation) → retour login, aucun état partiel (AC3)', async () => {
    mockGetCookie.mockReturnValue('');
    mockParams.mockReturnValue({});
    await render(<OAuthCallbackScreen />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
    });
  });

  it('param error=access_denied → retour login même si un cookie traîne (AC3)', async () => {
    mockGetCookie.mockReturnValue('ridenrest.session_token=abc');
    mockParams.mockReturnValue({ error: 'access_denied' });
    await render(<OAuthCallbackScreen />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
    });
  });

  it('param error fourni en tableau (param dupliqué) → retour login', async () => {
    mockGetCookie.mockReturnValue('ridenrest.session_token=abc');
    mockParams.mockReturnValue({ error: ['access_denied', 'x'] });
    await render(<OAuthCallbackScreen />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/(auth)/login');
    });
  });
});
