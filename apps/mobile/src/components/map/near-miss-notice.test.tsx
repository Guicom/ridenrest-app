import { render, screen } from '@testing-library/react-native';

import {
  NearMissNotice,
  formatNearMissDistance,
} from '@/components/map/near-miss-notice';
import { i18n } from '@/lib/i18n';

// Parité web `near-miss-notice.test.tsx`. Composant présentiel pur. RNTL v14 → `await render`.

describe('formatNearMissDistance', () => {
  it('affiche les courtes distances en mètres', () => {
    expect(formatNearMissDistance(800, 'fr')).toBe('800 m');
  });

  it('passe en km au-delà de 1000 m, avec le séparateur de la locale', () => {
    expect(formatNearMissDistance(3263, 'fr')).toBe('3,3 km');
    expect(formatNearMissDistance(3263, 'en')).toBe('3.3 km');
  });
});

describe('NearMissNotice', () => {
  it('n’affiche rien quand rien n’a été masqué', async () => {
    const { toJSON } = await render(
      <NearMissNotice count={0} nearestM={null} corridorWidthM={3000} />,
    );
    expect(toJSON()).toBeNull();
  });

  it('annonce le nombre masqué, le seuil et le plus proche', async () => {
    // Cas réel : un camping à 3 263 m écarté pour 263 m, sans que rien ne l'indique.
    await render(<NearMissNotice count={2} nearestM={3263} corridorWidthM={3000} />);

    const expected = `${i18n.t('pois.search.nearMissMany', { count: 2, corridor: '3,0 km' })} — ${i18n.t(
      'pois.search.nearMissNearest',
      { distance: '3,3 km' },
    )}.`;
    expect(screen.getByText(expected)).toBeOnTheScreen();
  });

  it('accorde le singulier', async () => {
    await render(<NearMissNotice count={1} nearestM={3100} corridorWidthM={3000} />);
    const expected = `${i18n.t('pois.search.nearMissOne', { count: 1, corridor: '3,0 km' })} — ${i18n.t(
      'pois.search.nearMissNearest',
      { distance: '3,1 km' },
    )}.`;
    expect(screen.getByText(expected)).toBeOnTheScreen();
  });

  it('lit le seuil renvoyé par le serveur, sans le redéclarer', async () => {
    await render(<NearMissNotice count={1} nearestM={5200} corridorWidthM={5000} />);
    const expected = `${i18n.t('pois.search.nearMissOne', { count: 1, corridor: '5,0 km' })} — ${i18n.t(
      'pois.search.nearMissNearest',
      { distance: '5,2 km' },
    )}.`;
    expect(screen.getByText(expected)).toBeOnTheScreen();
  });

  it('reste lisible sans distance du plus proche', async () => {
    await render(<NearMissNotice count={3} nearestM={null} corridorWidthM={3000} />);
    const expected = `${i18n.t('pois.search.nearMissMany', { count: 3, corridor: '3,0 km' })}.`;
    expect(screen.getByText(expected)).toBeOnTheScreen();
  });
});
