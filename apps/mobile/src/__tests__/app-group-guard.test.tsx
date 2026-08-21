import { render, screen } from '@testing-library/react-native';
import { Redirect, Stack } from 'expo-router';

import AppLayout from '@/app/(app)/_layout';
import { useSession } from '@/lib/auth/client';

// ⚠️ Ce test vit hors de `src/app/` À DESSEIN : le `require.context` d'Expo Router
// bundle **tout** `.tsx` sous `src/app` (y compris les tests) → `expo export`
// échouerait sur l'import de `@testing-library/react-native`. Les tests de routes
// mobiles doivent rester sous `src/__tests__/` (ou tester de la logique extraite).

// Contrôle l'état de session retourné par le guard.
jest.mock('@/lib/auth/client', () => ({
  useSession: jest.fn(),
}));

// expo-router : Redirect/Stack en stubs `() => null` (pas de JSX RN dans la factory
// — le transform NativeWind y injecterait une variable hors scope interdite par jest).
// On assert sur les appels/props plutôt que sur un rendu textuel.
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

describe('Guard (app)/_layout (MOB-2.1 / AC3, AC4)', () => {
  it('affiche un loader tant que la session n’est pas résolue (isPending), sans rediriger', async () => {
    mockUseSession.mockReturnValue({ data: null, isPending: true });
    await render(<AppLayout />);
    expect(screen.getByLabelText('session-loading')).toBeTruthy();
    expect(mockRedirect).not.toHaveBeenCalled();
    expect(mockStack).not.toHaveBeenCalled();
  });

  it('redirige un utilisateur non connecté vers (auth)/login', async () => {
    mockUseSession.mockReturnValue({ data: null, isPending: false });
    await render(<AppLayout />);
    expect(mockRedirect).toHaveBeenCalled();
    expect(mockRedirect.mock.calls[0][0]).toMatchObject({ href: '/(auth)/login' });
    expect(mockStack).not.toHaveBeenCalled();
  });

  it('rend les écrans enfants (Stack) pour une session active', async () => {
    mockUseSession.mockReturnValue({
      data: { user: { id: 'u1' } },
      isPending: false,
    });
    await render(<AppLayout />);
    expect(mockStack).toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});


// Conflit de gestes — reproduit sur simulateur le 2026-08-21 (iPhone 17 Pro) : un glissement
// horizontal n'importe où sur l'ecran carte depilait l'ecran au lieu de deplacer la poignee du
// slider. Le geste de retour et le geste utile ont la meme direction, et le slider de position
// est au repos tout a gauche, la ou le retour est le plus sensible.
describe('geste de retour borne au bord (MOB-7.1)', () => {
  it('n’active pas le retour plein écran et limite la zone de réponse au bord gauche', async () => {
    mockUseSession.mockReturnValue({ data: { user: { id: 'u1' } }, isPending: false });

    await render(<AppLayout />);

    const options = mockStack.mock.calls.at(-1)?.[0]?.screenOptions;
    expect(options.fullScreenGestureEnabled).toBe(false);
    // Relacher cette borne rend les sliders inutilisables : revalider sur device avant de la
    // changer.
    expect(options.gestureResponseDistance.start).toBeLessThanOrEqual(20);
  });
});
