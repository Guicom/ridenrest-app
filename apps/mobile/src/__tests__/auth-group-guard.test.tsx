import { render, screen } from '@testing-library/react-native';
import { Redirect, Stack } from 'expo-router';

import AuthLayout from '@/app/(auth)/_layout';
import { useSession } from '@/lib/auth/client';

// ⚠️ Hors de `src/app/` À DESSEIN (cf. app-group-guard.test.tsx) : le `require.context`
// d'Expo Router bundlerait ce test sinon. Couvre le guard **inverse** `(auth)/_layout`
// (la moitié d'AC4 non testée jusqu'ici) : un utilisateur déjà connecté est sorti des
// écrans login vers l'app.

jest.mock('@/lib/auth/client', () => ({
  useSession: jest.fn(),
}));

jest.mock('expo-router', () => ({
  Redirect: jest.fn(() => null),
  Stack: jest.fn(() => null),
}));

const mockUseSession = useSession as unknown as jest.Mock;
const mockRedirect = Redirect as unknown as jest.Mock;
const mockStack = Stack as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Guard inverse (auth)/_layout (MOB-2.1 / AC3, AC4)', () => {
  it('affiche un loader tant que la session n’est pas résolue (isPending), sans rediriger', async () => {
    mockUseSession.mockReturnValue({ data: null, isPending: true });
    await render(<AuthLayout />);
    expect(screen.getByLabelText('session-loading')).toBeTruthy();
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockStack).not.toHaveBeenCalled();
  });

  it('redirige un utilisateur DÉJÀ connecté vers (app)/adventures', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'u1' } },
      isPending: false,
    });
    await render(<AuthLayout />);
    expect(mockRedirect).toHaveBeenCalled();
    expect(mockRedirect.mock.calls[0][0]).toMatchObject({
      href: '/(app)/adventures',
    });
    expect(mockStack).not.toHaveBeenCalled();
  });

  it('rend les écrans d’auth (Stack) pour un utilisateur non connecté', async () => {
    mockUseSession.mockReturnValue({ data: null, isPending: false });
    await render(<AuthLayout />);
    expect(mockStack).toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
