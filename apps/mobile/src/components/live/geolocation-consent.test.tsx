import { fireEvent, render, screen } from '@testing-library/react-native';

import { GeolocationConsent } from '@/components/live/geolocation-consent';
import { i18n } from '@/lib/i18n';

// Dialog de consentement (MOB-5.1 / T4). Overlay RN absolu (pas un Modal). Vérifie le
// contenu, les actions Activer/Refuser et le caractère **non-dismissible** (aucune
// affordance de fermeture hors boutons explicites ; `open={false}` ne rend rien).
// `useColorScheme` (NativeWind) jette en jest → mock statique (parité map-screen.test).
jest.mock('@/hooks/use-color-scheme', () => ({
  useColorScheme: () => ({ colorScheme: 'light' }),
}));

describe('GeolocationConsent', () => {
  it('affiche titre + corps + mention RGPD', async () => {
    await render(
      <GeolocationConsent open onConsent={jest.fn()} onDismiss={jest.fn()} />,
    );
    expect(screen.getByText(i18n.t('live.consent.title'))).toBeTruthy();
    expect(screen.getByText(i18n.t('live.consent.body'))).toBeTruthy();
    expect(screen.getByText(i18n.t('live.consent.rgpd'))).toBeTruthy();
  });

  it('« Activer » → onConsent', async () => {
    const onConsent = jest.fn();
    await render(
      <GeolocationConsent open onConsent={onConsent} onDismiss={jest.fn()} />,
    );
    fireEvent.press(
      screen.getByRole('button', { name: i18n.t('live.consent.accept') }),
    );
    expect(onConsent).toHaveBeenCalledTimes(1);
  });

  it('« Refuser » → onDismiss', async () => {
    const onDismiss = jest.fn();
    await render(
      <GeolocationConsent open onConsent={jest.fn()} onDismiss={onDismiss} />,
    );
    fireEvent.press(
      screen.getByRole('button', { name: i18n.t('live.consent.refuse') }),
    );
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('non-dismissible : aucune affordance de fermeture hors boutons (gate RGPD)', async () => {
    await render(
      <GeolocationConsent open onConsent={jest.fn()} onDismiss={jest.fn()} />,
    );
    // Pas de backdrop dismissible (`close`) ni de bouton ✕ : seules « Activer »/« Refuser »
    // agissent. Le fond assombri est une View inerte (pas de Pressable).
    expect(screen.queryByLabelText('close')).toBeNull();
    expect(screen.queryByLabelText(/fermer|close|✕|×/i)).toBeNull();
  });

  it('open={false} → ne rend rien', async () => {
    await render(
      <GeolocationConsent open={false} onConsent={jest.fn()} onDismiss={jest.fn()} />,
    );
    expect(screen.queryByText(i18n.t('live.consent.title'))).toBeNull();
  });
});
