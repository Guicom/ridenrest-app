import { formatKm } from '@/lib/format/distance';

// Helper de FORMATAGE pur (MOB-3.3 / T6, AC4). Ne recalcule JAMAIS une distance :
// il formate une valeur déjà fournie par le serveur (`cumulativeStartKm`,
// `distanceKm`, `totalDistanceKm`). 1 décimale, séparateur localisé, sans suffixe
// (le suffixe « km » vit dans les chaînes i18n).

describe('formatKm (T6)', () => {
  it('formate avec 1 décimale et séparateur FR (virgule)', () => {
    expect(formatKm(42.34, 'fr')).toBe('42,3');
  });

  it('arrondit à 1 décimale (42.36 → 42,4)', () => {
    expect(formatKm(42.36, 'fr')).toBe('42,4');
  });

  it('formate 0 sans décimale superflue', () => {
    expect(formatKm(0, 'fr')).toBe('0');
  });

  it('utilise le point en locale EN', () => {
    expect(formatKm(128.6, 'en')).toBe('128.6');
  });

  it('tolère une valeur nulle/indéfinie (défensif) → 0', () => {
    expect(formatKm(undefined as unknown as number, 'fr')).toBe('0');
    expect(formatKm(null as unknown as number, 'en')).toBe('0');
  });
});
