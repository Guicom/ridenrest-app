import type { AdventureResponse } from '@ridenrest/shared';
import { render, screen, userEvent } from '@testing-library/react-native';
import { router } from 'expo-router';

import { AdventureCard } from '@/components/adventure/adventure-card';
import { i18n } from '@/lib/i18n';

// Test de composant (co-localisé — pas une route, hors `require.context`).
// Carte iso web : rendu (nom + distance + dénivelé + date), navigation via le corps
// ET le bouton « Modifier » (→ onPress). « Planning » navigue vers la carte (MOB-4.1) ;
// « Live » navigue vers l'écran Live (MOB-5.1). i18n réel (langue fr en test).

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
}));

const mockPush = router.push as jest.Mock;

const t = (k: string) => i18n.t(k);

const baseAdventure: AdventureResponse = {
  id: 'adv-1',
  userId: 'user-1',
  name: 'Tour du Mont-Blanc',
  totalDistanceKm: 170.4,
  totalElevationGainM: 11000,
  totalElevationLossM: 10500,
  startDate: null,
  endDate: null,
  status: 'planning',
  densityStatus: 'idle',
  densityProgress: 0,
  avgSpeedKmh: 15,
  routingProfile: 'gravel',
  hasStravaSegment: false,
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-01T10:00:00.000Z',
};

describe('AdventureCard (MOB-3.1 / AC1 — iso web)', () => {
  it('rend le nom, la distance et le dénivelé ↑/↓', async () => {
    await render(<AdventureCard adventure={baseAdventure} onPress={jest.fn()} />);
    expect(screen.getByText('Tour du Mont-Blanc')).toBeTruthy();
    expect(screen.getByText('170.4 km')).toBeTruthy();
    // Dénivelé présent (gain + perte).
    expect(screen.getByText(/↑.*m.*·.*↓.*m/)).toBeTruthy();
  });

  it('affiche « — » quand la distance est nulle (aventure neuve)', async () => {
    await render(
      <AdventureCard
        adventure={{ ...baseAdventure, totalDistanceKm: 0, totalElevationGainM: 0 }}
        onPress={jest.fn()}
      />,
    );
    expect(screen.getByText('—')).toBeTruthy();
  });

  it('tap sur le corps de la carte → onPress(id)', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await render(<AdventureCard adventure={baseAdventure} onPress={onPress} />);
    await user.press(screen.getByLabelText(t('adventures.card.openA11y')));
    expect(onPress).toHaveBeenCalledWith('adv-1');
  });

  it('tap sur « Modifier » → onPress(id)', async () => {
    const onPress = jest.fn();
    const user = userEvent.setup();
    await render(<AdventureCard adventure={baseAdventure} onPress={onPress} />);
    await user.press(screen.getByLabelText(t('adventures.card.edit')));
    expect(onPress).toHaveBeenCalledWith('adv-1');
  });

  it('tap sur « Live » → navigue vers l’écran Live (MOB-5.1)', async () => {
    const user = userEvent.setup();
    await render(<AdventureCard adventure={baseAdventure} onPress={jest.fn()} />);
    await user.press(screen.getByLabelText(t('adventures.card.live')));
    expect(mockPush).toHaveBeenCalledWith('/(app)/live/adv-1');
  });

  it('tap sur « Planning » → navigue vers la carte (MOB-4.1)', async () => {
    const user = userEvent.setup();
    await render(<AdventureCard adventure={baseAdventure} onPress={jest.fn()} />);
    await user.press(screen.getByLabelText(t('adventures.card.planning')));
    expect(mockPush).toHaveBeenCalledWith('/(app)/map/adv-1');
  });
});
